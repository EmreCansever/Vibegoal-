/**
 * Tahmin Düellosu — Firestore session room
 * Rakip + maç seçimi → maç bitene kadar ana sayfa tahmin puanları → kazanan
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
import { PRED_DUEL_STATUS } from '../constants/predictionDuel';

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

function canReceiveInvite(invite, fallbackUid) {
  if (!invite) return false;
  return uidCandidates(fallbackUid).includes(invite.toUid);
}

function mapInvite(d, fallbackUid) {
  if (!d?.exists()) return null;
  const data = d.data();
  const candidates = uidCandidates(fallbackUid);
  return { id: d.id, ...data, isIncoming: candidates.includes(data.toUid) };
}

function mapSession(d) {
  if (!d?.exists()) return null;
  const data = d.data();
  return {
    id: d.id,
    ...data,
    serverUpdatedAt: tsToMs(data.updatedAt),
  };
}

export const predictionDuelService = {
  isAvailable: () => isFirebaseConfigured && !!db,

  async sendInvite({ toUid, match, fromProfile = {} }) {
    if (!this.isAvailable()) throw new Error('Firebase yapılandırılmamış.');
    await waitForAuthReady(2000);
    const fromUid = resolveAuthUid();
    if (!fromUid) throw new Error('Oturum gerekli.');
    if (fromUid === toUid) throw new Error('Kendinize düello gönderemezsiniz.');
    if (!match?.id) throw new Error('Maç seçilmedi.');

    const inviteId = genId('pinv');
    const payload = {
      type: 'prediction',
      fromUid,
      toUid,
      matchId: String(match.id),
      matchSnapshot: {
        id: String(match.id),
        home: match.home,
        away: match.away,
        homeFlag: match.homeFlag || '⚽',
        awayFlag: match.awayFlag || '⚽',
        status: match.status || 'NS',
        minute: match.minute ?? null,
        homeScore: match.homeScore ?? 0,
        awayScore: match.awayScore ?? 0,
        league: match.league || '',
      },
      status: 'pending',
      fromUsername: fromProfile.username || 'Oyuncu',
      fromAvatar: fromProfile.avatar || '',
      duelId: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(doc(db, 'pred_duel_invites', inviteId), payload);
    return { id: inviteId, ...payload };
  },

  async acceptInvite(inviteId, acceptorProfile = {}) {
    if (!this.isAvailable()) throw new Error('Firebase yapılandırılmamış.');

    const fallbackUid = acceptorProfile.uid || null;
    if (!fallbackUid) {
      await waitForAuthReady(1500);
    }
    const acceptorUid = resolveAuthUid(fallbackUid) || fallbackUid;
    if (!acceptorUid) throw new Error('Oturum gerekli.');

    const inviteRef = doc(db, 'pred_duel_invites', inviteId);
    const inviteSnap = await getDoc(inviteRef);
    if (!inviteSnap.exists()) throw new Error('Davet bulunamadı.');
    const invite = inviteSnap.data();
    if (!canReceiveInvite(invite, fallbackUid)) throw new Error('Bu davet size ait değil.');
    if (invite.status !== 'pending') throw new Error('Davet artık geçerli değil.');

    const duelId = genId('pred');
    const session = {
      type: 'prediction',
      playerAUid: invite.fromUid,
      playerBUid: acceptorUid,
      playerAName: invite.fromUsername || 'Oyuncu A',
      playerBName: acceptorProfile.username || 'Oyuncu B',
      participantIds: [invite.fromUid, acceptorUid],
      matchId: invite.matchId,
      matchSnapshot: invite.matchSnapshot,
      status: PRED_DUEL_STATUS.LIVE,
      scores: {
        [invite.fromUid]: { total: 0, participation: 0, matchResult: 0, questions: 0 },
        [acceptorUid]: { total: 0, participation: 0, matchResult: 0, questions: 0 },
      },
      winnerUid: null,
      winnerSide: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(doc(db, 'pred_duels', duelId), session);
    await updateDoc(inviteRef, {
      status: 'accepted',
      duelId,
      updatedAt: serverTimestamp(),
    });

    return { duelId, inviteId };
  },

  async declineInvite(inviteId) {
    if (!this.isAvailable()) return;
    const uid = resolveAuthUid();
    const ref = doc(db, 'pred_duel_invites', inviteId);
    const snap = await getDoc(ref);
    if (!snap.exists() || snap.data().toUid !== uid) return;
    await updateDoc(ref, { status: 'declined', updatedAt: serverTimestamp() });
  },

  async cancelInvite(inviteId) {
    if (!this.isAvailable()) return;
    const uid = resolveAuthUid();
    const ref = doc(db, 'pred_duel_invites', inviteId);
    const snap = await getDoc(ref);
    if (!snap.exists() || snap.data().fromUid !== uid) return;
    if (snap.data().status !== 'pending') return;
    await updateDoc(ref, { status: 'cancelled', updatedAt: serverTimestamp() });
  },

  async abandonPredDuel(duelId, fallbackUid = null) {
    if (!this.isAvailable() || !duelId) return false;
    const ref = doc(db, 'pred_duels', duelId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return false;
    const data = snap.data();
    const candidates = uidCandidates(fallbackUid);
    const uid = candidates.find((id) => data.participantIds?.includes(id));
    if (!uid) return false;
    if (data.status === PRED_DUEL_STATUS.FINISHED || data.status === PRED_DUEL_STATUS.CANCELLED) {
      return true;
    }
    await updateDoc(ref, {
      status: PRED_DUEL_STATUS.CANCELLED,
      cancelledBy: uid,
      updatedAt: serverTimestamp(),
    });
    return true;
  },

  async syncScore(duelId, uid, { total, breakdown, matchSnapshot }) {
    if (!this.isAvailable() || !duelId || !uid) return;
    const ref = doc(db, 'pred_duels', duelId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const data = snap.data();
    if (data.status !== PRED_DUEL_STATUS.LIVE) return;
    if (!data.participantIds?.includes(uid)) return;

    const patch = {
      [`scores.${uid}`]: {
        total: Number(total) || 0,
        participation: breakdown?.participation ?? 0,
        matchResult: breakdown?.matchResult ?? 0,
        questions: breakdown?.questions ?? 0,
        updatedAt: Date.now(),
      },
      updatedAt: serverTimestamp(),
    };
    if (matchSnapshot) patch.matchSnapshot = matchSnapshot;
    await updateDoc(ref, patch);
  },

  async finalize(duelId, matchSnapshot) {
    if (!this.isAvailable()) return null;
    const ref = doc(db, 'pred_duels', duelId);

    return runTransaction(db, async (transaction) => {
      const snap = await transaction.get(ref);
      if (!snap.exists()) return null;
      const data = snap.data();
      if (data.status !== PRED_DUEL_STATUS.LIVE) return null;

      const scoreA = Number(data.scores?.[data.playerAUid]?.total) || 0;
      const scoreB = Number(data.scores?.[data.playerBUid]?.total) || 0;
      let winnerUid = null;
      let winnerSide = 'draw';
      if (scoreA > scoreB) {
        winnerUid = data.playerAUid;
        winnerSide = 'playerA';
      } else if (scoreB > scoreA) {
        winnerUid = data.playerBUid;
        winnerSide = 'playerB';
      }

      transaction.update(ref, {
        status: PRED_DUEL_STATUS.FINISHED,
        winnerUid,
        winnerSide,
        matchSnapshot: matchSnapshot || data.matchSnapshot,
        finalizedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      return { winnerUid, winnerSide, scoreA, scoreB };
    });
  },

  subscribeInvite(inviteId, uid, callback) {
    if (!inviteId) return () => {};
    const ref = doc(db, 'pred_duel_invites', inviteId);
    return onSnapshot(ref, (snap) => callback(mapInvite(snap, uid)));
  },

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
        collection(db, 'pred_duel_invites'),
        where('toUid', '==', target),
        where('status', '==', 'pending'),
      );
      return onSnapshot(q, (snap) => {
        [...byId.entries()].forEach(([id, inv]) => {
          if (inv.toUid === target) byId.delete(id);
        });
        snap.docs.forEach((d) => byId.set(d.id, mapInvite(d, fallbackUid)));
        emit();
      }, () => callback([]));
    });

    return () => unsubs.forEach((u) => u());
  },

  subscribePredDuel(duelId, callback) {
    if (!duelId) {
      callback(null);
      return () => {};
    }
    const ref = doc(db, 'pred_duels', duelId);
    return onSnapshot(ref, (snap) => callback(mapSession(snap)));
  },

  subscribeActivePredDuel(fallbackUid, callback) {
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
        collection(db, 'pred_duels'),
        where('participantIds', 'array-contains', target),
        where('status', '==', PRED_DUEL_STATUS.LIVE),
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
          sessionsByTarget.set(target, mapSession(docSnap));
        }
        refreshLatest();
      }, () => callback(null));
    });

    return () => unsubs.forEach((u) => u());
  },
};
