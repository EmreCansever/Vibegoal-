/**
 * Canlı Düello — Firestore Session Room mimarisi
 *
 * Oda = duel_sessions/{sessionId}
 * Real-time senkron: onSnapshot (Firestore Snapshot Listeners)
 *
 * Akış:
 *   duel_invites  → davet / kabul
 *   duel_sessions → draft state (picks, round, version)
 *   finalizeDuel  → transaction ile skor + kazanan
 */

import {
  collection,
  doc,
  setDoc,
  updateDoc,
  getDoc,
  onSnapshot,
  query,
  where,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import {
  auth,
  db,
  isFirebaseConfigured,
  resolveAuthUid,
  getFirebaseAuthUid,
  waitForAuthReady,
} from './firebase';
import { playerService } from './playerService';
import { buildRevealResult } from '../utils/duelEngine';
import { DUEL_STATUS, FORMATION_SLOTS, getChallengeById } from '../constants/duelChallenges';

const REQUIRED_PICKS = FORMATION_SLOTS.length;

function resolvePickSlotId(existingPicks, roundData, playerPosition) {
  const group = roundData.slotPosGroup;
  if (playerPosition && group && playerPosition !== group) {
    throw new Error('Bu oyuncu bu mevki için uygun değil.');
  }
  const targetSlot = roundData.slotId;
  if (!existingPicks?.[targetSlot]) return targetSlot;

  const fallback = FORMATION_SLOTS.find(
    (s) => s.posGroup === group && !existingPicks[s.id],
  );
  if (!fallback) throw new Error('Bu mevki için boş slot kalmadı.');
  return fallback.id;
}

function countPicks(picksObj) {
  return Object.keys(picksObj || {}).length;
}

function genId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function tsToMs(val) {
  if (!val) return null;
  if (typeof val?.toMillis === 'function') return val.toMillis();
  if (typeof val === 'number') return val;
  return null;
}

function uidCandidates(fallbackUid) {
  const authUid = getFirebaseAuthUid();
  return [...new Set([authUid, fallbackUid].filter(Boolean))];
}

/** Oturumdaki gerçek katılımcı uid — Firebase / yerel uid uyumsuzluğunu çözer */
export function resolveParticipantUid(sessionData, fallbackUid) {
  if (!sessionData) return fallbackUid || getFirebaseAuthUid() || null;
  const candidates = uidCandidates(fallbackUid);
  for (const id of candidates) {
    if (id === sessionData.playerAUid || id === sessionData.playerBUid) return id;
    if (sessionData.participantIds?.includes(id)) return id;
    if (sessionData.picks?.[id]) return id;
  }
  const round0 = sessionData.draftRounds?.[0];
  if (round0?.optionsByPlayer) {
    for (const id of candidates) {
      if (round0.optionsByPlayer[id]) return id;
    }
  }
  return candidates[0] || fallbackUid || null;
}

function canReceiveInvite(invite, fallbackUid) {
  if (!invite) return false;
  return uidCandidates(fallbackUid).includes(invite.toUid);
}

function mapInvite(d, fallbackUid) {
  if (!d?.exists()) return null;
  const data = d.data();
  const candidates = uidCandidates(fallbackUid);
  return {
    id: d.id,
    ...data,
    isIncoming: candidates.includes(data.toUid),
    isOutgoing: candidates.includes(data.fromUid),
  };
}

/** Session room state — her snapshot'ta tüm client'lara aynı görünür */
function mapSession(d, fallbackUid) {
  if (!d?.exists()) return null;
  const data = d.data();
  const uid = resolveParticipantUid(data, fallbackUid);
  if (!uid) return null;

  const rounds = data.draftRounds || [];
  const currentRound = Number(data.currentRound) || 0;
  const myPicks = data.picks?.[uid] || {};
  const theirUid = data.playerAUid === uid ? data.playerBUid : data.playerAUid;
  const theirPicks = data.picks?.[theirUid] || {};
  const roundPicks = data.roundPicks?.[currentRound] || {};
  const activeRound = rounds[currentRound] || null;
  const myRoundOptions = activeRound?.optionsByPlayer?.[uid]
    || activeRound?.options
    || [];

  const myPickCount = Object.keys(myPicks).length;
  const theirPickCount = Object.keys(theirPicks).length;

  return {
    id: d.id,
    ...data,
    resolvedUid: uid,
    currentRound,
    totalRounds: rounds.length,
    activeRound,
    myRoundOptions,
    myPicks,
    theirPicks,
    myPickCount,
    theirPickCount,
    myRoundPick: roundPicks[uid] || null,
    theirRoundPick: roundPicks[theirUid] || null,
    bothPickedRound: !!(roundPicks[data.playerAUid] && roundPicks[data.playerBUid]),
    isPlayerA: data.playerAUid === uid,
    theirUid,
    version: Number(data.version) || 0,
    serverUpdatedAt: tsToMs(data.clientUpdatedAt) || tsToMs(data.updatedAt),
    challenge: getChallengeById(data.challengeId),
  };
}

export const duelService = {
  isAvailable: () => isFirebaseConfigured && !!db,

  async sendInvite({ toUid, challengeId, fromProfile = {} }) {
    if (!this.isAvailable()) throw new Error('Firebase yapılandırılmamış.');
    await waitForAuthReady(2000);
    const fromUid = resolveAuthUid();
    if (!fromUid) throw new Error('Oturum gerekli.');
    if (fromUid === toUid) throw new Error('Kendinize düello gönderemezsiniz.');

    const inviteId = genId('inv');
    const payload = {
      fromUid,
      toUid,
      challengeId,
      status: 'pending',
      fromUsername: fromProfile.username || 'Oyuncu',
      fromAvatar: fromProfile.avatar || '',
      duelId: null,
      sessionId: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(doc(db, 'duel_invites', inviteId), payload);
    return { id: inviteId, ...payload };
  },

  /** Davet kabul → Session Room oluştur */
  async acceptInvite(inviteId, acceptorProfile = {}) {
    if (!this.isAvailable()) throw new Error('Firebase yapılandırılmamış.');
    await waitForAuthReady(2500);
    const fallbackUid = acceptorProfile.uid || null;
    const authUid = resolveAuthUid(fallbackUid);
    if (!authUid && !fallbackUid) throw new Error('Oturum gerekli.');

    const inviteRef = doc(db, 'duel_invites', inviteId);
    const inviteSnap = await getDoc(inviteRef);
    if (!inviteSnap.exists()) throw new Error('Davet bulunamadı.');
    const invite = inviteSnap.data();
    if (!canReceiveInvite(invite, fallbackUid)) {
      throw new Error('Bu davet size ait değil.');
    }
    if (invite.status !== 'pending') throw new Error('Davet artık geçerli değil.');

    await playerService.ensureSeeded();
    const sessionId = genId('duel');
    const draftRounds = await playerService.buildDraftScript(
      sessionId,
      invite.fromUid,
      invite.toUid,
    );

    const session = {
      challengeId: invite.challengeId,
      playerAUid: invite.fromUid,
      playerBUid: invite.toUid,
      playerAName: invite.fromUsername || 'Oyuncu A',
      playerBName: acceptorProfile.username || 'Oyuncu B',
      participantIds: [invite.fromUid, invite.toUid],
      status: DUEL_STATUS.DRAFT,
      currentRound: 0,
      draftRounds,
      picks: { [invite.fromUid]: {}, [invite.toUid]: {} },
      roundPicks: {},
      winnerUid: null,
      winnerSide: null,
      scoreA: null,
      scoreB: null,
      version: 1,
      clientUpdatedAt: Date.now(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(doc(db, 'duel_sessions', sessionId), session);
    await updateDoc(inviteRef, {
      status: 'accepted',
      duelId: sessionId,
      sessionId,
      updatedAt: serverTimestamp(),
    });

    return { sessionId, duelId: sessionId, inviteId };
  },

  async declineInvite(inviteId) {
    if (!this.isAvailable()) return;
    const uid = resolveAuthUid();
    const ref = doc(db, 'duel_invites', inviteId);
    const snap = await getDoc(ref);
    if (!snap.exists() || snap.data().toUid !== uid) return;
    await updateDoc(ref, { status: 'declined', updatedAt: serverTimestamp() });
  },

  async cancelInvite(inviteId) {
    if (!this.isAvailable()) return;
    const uid = resolveAuthUid();
    const ref = doc(db, 'duel_invites', inviteId);
    const snap = await getDoc(ref);
    if (!snap.exists() || snap.data().fromUid !== uid) return;
    if (snap.data().status !== 'pending') return;
    await updateDoc(ref, { status: 'cancelled', updatedAt: serverTimestamp() });
  },

  /** Tur seçimi — Firestore transaction ile atomik senkron */
  async pickPlayer(sessionId, playerId, fallbackUid = null) {
    if (!this.isAvailable()) throw new Error('Firebase yapılandırılmamış.');

    const ref = doc(db, 'duel_sessions', sessionId);
    let shouldFinalize = false;

    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(ref);
      if (!snap.exists()) throw new Error('Düello oturumu bulunamadı.');
      const data = snap.data();

      const uid = resolveParticipantUid(data, fallbackUid || resolveAuthUid());
      if (!uid) throw new Error('Oturum gerekli.');
      if (!data.participantIds?.includes(uid)
        && uid !== data.playerAUid
        && uid !== data.playerBUid) {
        throw new Error('Bu oturumun oyuncusu değilsiniz.');
      }

      if (data.status !== DUEL_STATUS.DRAFT) throw new Error('Draft aktif değil.');

      const round = Number(data.currentRound) || 0;
      const roundData = data.draftRounds?.[round];
      if (!roundData) throw new Error('Tur bulunamadı.');

      const myOptions = roundData.optionsByPlayer?.[uid] || roundData.options || [];
      const validIds = myOptions.map((o) => o.id);
      if (!validIds.includes(playerId)) throw new Error('Geçersiz oyuncu seçimi.');

      const pickedOption = myOptions.find((o) => o.id === playerId);
      if (roundData.slotPosGroup && pickedOption?.position
        && pickedOption.position !== roundData.slotPosGroup) {
        throw new Error('Bu oyuncu bu mevki için uygun değil.');
      }

      const existingUserPicks = data.picks?.[uid] || {};
      const slotId = resolvePickSlotId(existingUserPicks, roundData, pickedOption?.position);
      if (existingUserPicks[slotId]) throw new Error('Bu slot zaten dolu.');

      const roundPicks = data.roundPicks?.[round] || {};
      if (roundPicks[uid]) throw new Error('Bu turda zaten seçim yaptınız.');

      const newRoundPicks = { ...roundPicks, [uid]: playerId };
      const bothDone = newRoundPicks[data.playerAUid] && newRoundPicks[data.playerBUid];
      const nextRound = bothDone ? round + 1 : round;
      const totalRounds = data.draftRounds?.length || REQUIRED_PICKS;
      const allRoundsDone = bothDone
        && nextRound >= totalRounds
        && totalRounds >= REQUIRED_PICKS;

      const patch = {
        [`picks.${uid}.${slotId}`]: playerId,
        [`roundPicks.${round}.${uid}`]: playerId,
        version: (Number(data.version) || 0) + 1,
        clientUpdatedAt: Date.now(),
        updatedAt: serverTimestamp(),
      };

      if (bothDone) {
        patch.currentRound = nextRound;
      }

      transaction.update(ref, patch);
      shouldFinalize = allRoundsDone;
    });

    if (shouldFinalize) {
      await this.finalizeDuel(sessionId);
    }
  },

  /** Skor hesabı — önce oyuncu verisi, sonra transaction ile tek finalize */
  async finalizeDuel(sessionId) {
    const ref = doc(db, 'duel_sessions', sessionId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    const data = snap.data();
    if (data.status !== DUEL_STATUS.DRAFT) return null;

    const picksA = countPicks(data.picks?.[data.playerAUid]);
    const picksB = countPicks(data.picks?.[data.playerBUid]);
    if (picksA < REQUIRED_PICKS || picksB < REQUIRED_PICKS) {
      console.warn(`[Duel] Erken finalize engellendi: A=${picksA} B=${picksB}`);
      return null;
    }

    const allIds = new Set();
    Object.values(data.picks || {}).forEach((slots) => {
      Object.values(slots).forEach((id) => allIds.add(id));
    });

    const playerMap = await playerService.getPlayersByIds([...allIds]);
    const computed = buildRevealResult(data, playerMap);

    const committed = await runTransaction(db, async (transaction) => {
      const fresh = await transaction.get(ref);
      if (!fresh.exists() || fresh.data().status !== DUEL_STATUS.DRAFT) return false;

      transaction.update(ref, {
        status: DUEL_STATUS.REVEAL,
        scoreA: computed.scoreA,
        scoreB: computed.scoreB,
        winnerUid: computed.winnerUid,
        winnerSide: computed.winnerSide,
        version: (Number(fresh.data().version) || 0) + 1,
        clientUpdatedAt: Date.now(),
        updatedAt: serverTimestamp(),
      });
      return true;
    });

    if (committed) {
      setTimeout(async () => {
        try {
          const latest = await getDoc(ref);
          if (!latest.exists() || latest.data().status !== DUEL_STATUS.REVEAL) return;
          await updateDoc(ref, {
            status: DUEL_STATUS.FINISHED,
            version: (Number(latest.data().version) || 0) + 1,
            clientUpdatedAt: Date.now(),
            updatedAt: serverTimestamp(),
          });
        } catch { /* ignore */ }
      }, 4500);
    }

    return committed ? computed : null;
  },

  /** Tek davet belgesi — gönderen tarafında anlık kabul/red */
  subscribeInvite(inviteId, uid, callback) {
    if (!this.isAvailable() || !inviteId) {
      callback(null);
      return () => {};
    }

    const ref = doc(db, 'duel_invites', inviteId);
    return onSnapshot(
      ref,
      (snap) => callback(mapInvite(snap, uid)),
      (err) => {
        console.error('[DuelRoom] invite doc listener:', err);
        callback(null);
      },
    );
  },

  /** Gelen davetler — Firebase + yerel uid ile çift dinleme */
  subscribeIncomingInvites(fallbackUid, callback) {
    if (!this.isAvailable()) {
      callback([]);
      return () => {};
    }

    const targets = uidCandidates(fallbackUid);
    if (targets.length === 0) {
      callback([]);
      return () => {};
    }

    const byId = new Map();
    const emit = () => callback([...byId.values()]);

    const unsubs = targets.map((target) => {
      const q = query(
        collection(db, 'duel_invites'),
        where('toUid', '==', target),
        where('status', '==', 'pending'),
      );
      return onSnapshot(q, (snap) => {
        [...byId.entries()].forEach(([id, inv]) => {
          if (inv.toUid === target) byId.delete(id);
        });
        snap.docs.forEach((d) => byId.set(d.id, mapInvite(d, fallbackUid)));
        emit();
      }, (err) => {
        console.error('[DuelRoom] invite listener:', err);
      });
    });

    return () => unsubs.forEach((u) => u());
  },

  /** Session Room — draft state anlık senkron */
  subscribeSession(sessionId, fallbackUid, callback) {
    if (!this.isAvailable() || !sessionId) {
      callback(null);
      return () => {};
    }

    const ref = doc(db, 'duel_sessions', sessionId);
    return onSnapshot(
      ref,
      (snap) => callback(mapSession(snap, fallbackUid)),
      (err) => {
        console.error('[DuelRoom] session listener:', err);
        callback(null);
      },
    );
  },

  /** Kullanıcının aktif oturumu — sayfa yenilemede odaya dön */
  subscribeActiveSession(fallbackUid, callback) {
    if (!this.isAvailable()) {
      callback(null);
      return () => {};
    }

    const targets = uidCandidates(fallbackUid);
    if (targets.length === 0) {
      callback(null);
      return () => {};
    }

    const sessionsByTarget = new Map();
    const refreshLatest = () => {
      let best = null;
      sessionsByTarget.forEach((s) => {
        if (!s) return;
        if (!best || (s.serverUpdatedAt || 0) > (best.serverUpdatedAt || 0)) best = s;
      });
      callback(best);
    };

    const unsubs = targets.map((target) => {
      const q = query(
        collection(db, 'duel_sessions'),
        where('participantIds', 'array-contains', target),
        where('status', 'in', [DUEL_STATUS.DRAFT, DUEL_STATUS.REVEAL]),
      );
      return onSnapshot(q, (snap) => {
        if (snap.empty) {
          sessionsByTarget.set(target, null);
        } else {
          const docSnap = snap.docs.sort((a, b) => {
            const ta = tsToMs(a.data().updatedAt) || 0;
            const tb = tsToMs(b.data().updatedAt) || 0;
            return tb - ta;
          })[0];
          sessionsByTarget.set(target, mapSession(docSnap, fallbackUid));
        }
        refreshLatest();
      }, (err) => {
        console.error('[DuelRoom] active session listener:', err);
      });
    });

    return () => unsubs.forEach((u) => u());
  },

  /** Gönderilen davet kabul edildiğinde — modal kapalı olsa bile oyunu aç */
  subscribeSentInviteAccepted(fallbackUid, callback) {
    if (!this.isAvailable()) {
      callback(null);
      return () => {};
    }

    const targets = uidCandidates(fallbackUid);
    if (targets.length === 0) return () => {};

    const unsubs = targets.map((target) => {
      const q = query(
        collection(db, 'duel_invites'),
        where('fromUid', '==', target),
        where('status', '==', 'accepted'),
      );
      return onSnapshot(q, (snap) => {
        const accepted = snap.docs
          .map((d) => mapInvite(d, fallbackUid))
          .filter((inv) => inv?.sessionId)
          .sort((a, b) => (tsToMs(b.updatedAt) || 0) - (tsToMs(a.updatedAt) || 0));
        callback(accepted[0] || null);
      }, (err) => {
        console.error('[DuelRoom] sent invite listener:', err);
      });
    });

    return () => unsubs.forEach((u) => u());
  },
};

export { mapSession, mapInvite };
