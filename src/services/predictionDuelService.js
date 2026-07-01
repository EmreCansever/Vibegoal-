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

function mapInvite(d, uid) {
  if (!d?.exists()) return null;
  return { id: d.id, ...d.data(), isIncoming: d.data().toUid === uid };
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
    const uid = resolveAuthUid();
    if (!uid) throw new Error('Oturum gerekli.');

    const inviteRef = doc(db, 'pred_duel_invites', inviteId);
    const inviteSnap = await getDoc(inviteRef);
    if (!inviteSnap.exists()) throw new Error('Davet bulunamadı.');
    const invite = inviteSnap.data();
    if (invite.toUid !== uid) throw new Error('Bu davet size ait değil.');
    if (invite.status !== 'pending') throw new Error('Davet artık geçerli değil.');

    const duelId = genId('pred');
    const session = {
      type: 'prediction',
      playerAUid: invite.fromUid,
      playerBUid: invite.toUid,
      playerAName: invite.fromUsername || 'Oyuncu A',
      playerBName: acceptorProfile.username || 'Oyuncu B',
      participantIds: [invite.fromUid, invite.toUid],
      matchId: invite.matchId,
      matchSnapshot: invite.matchSnapshot,
      status: PRED_DUEL_STATUS.LIVE,
      scores: {
        [invite.fromUid]: { total: 0, participation: 0, matchResult: 0, questions: 0 },
        [invite.toUid]: { total: 0, participation: 0, matchResult: 0, questions: 0 },
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

  subscribeIncomingInvites(uid, callback) {
    if (!this.isAvailable() || !uid) {
      callback([]);
      return () => {};
    }
    const q = query(
      collection(db, 'pred_duel_invites'),
      where('toUid', '==', uid),
      where('status', '==', 'pending'),
    );
    return onSnapshot(q, (snap) => {
      callback(snap.docs.map((d) => mapInvite(d, uid)));
    }, () => callback([]));
  },

  subscribePredDuel(duelId, callback) {
    if (!duelId) {
      callback(null);
      return () => {};
    }
    const ref = doc(db, 'pred_duels', duelId);
    return onSnapshot(ref, (snap) => callback(mapSession(snap)));
  },

  subscribeActivePredDuel(uid, callback) {
    if (!this.isAvailable() || !uid) {
      callback(null);
      return () => {};
    }
    const q = query(
      collection(db, 'pred_duels'),
      where('participantIds', 'array-contains', uid),
      where('status', '==', PRED_DUEL_STATUS.LIVE),
    );
    return onSnapshot(q, (snap) => {
      if (snap.empty) {
        callback(null);
        return;
      }
      const docSnap = snap.docs.sort((a, b) => {
        const ta = tsToMs(a.data().updatedAt) || 0;
        const tb = tsToMs(b.data().updatedAt) || 0;
        return tb - ta;
      })[0];
      callback(mapSession(docSnap));
    }, () => callback(null));
  },
};
