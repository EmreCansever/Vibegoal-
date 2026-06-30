/* ═══════════════════════════════════════════════════════════════
   VibeGoal — Firestore Oda Servisi
   Odalar kalıcı olarak rooms koleksiyonunda tutulur.
═══════════════════════════════════════════════════════════════ */

import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocFromServer,
  getDocs,
  getDocsFromServer,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  arrayUnion,
  arrayRemove,
  serverTimestamp,
  limit,
  waitForPendingWrites,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import {
  auth,
  db,
  isFirebaseConfigured,
  waitForAuthReady,
  resolveAuthUid,
} from './firebase';

function formatLastActivity(val) {
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (typeof val?.toDate === 'function') {
    try {
      return val.toDate().toLocaleDateString('tr-TR');
    } catch {
      return '';
    }
  }
  return '';
}

function mapRoomDoc(docSnap, uid) {
  if (!docSnap?.id) return null;

  let data = {};
  try {
    data = typeof docSnap.data === 'function' ? docSnap.data() : (docSnap.data ?? {});
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;

  const memberIds = Array.isArray(data.memberIds) ? data.memberIds : [];

  return {
    id: docSnap.id,
    name: data.name || '',
    league: data.league || '',
    leagueId: data.leagueId || 'wc2026',
    members: Number(data.members) || memberIds.length || 0,
    maxMembers: data.maxMembers ?? 20,
    totalPoints: Number(data.totalPoints) || 0,
    avatar: data.avatar || '✨',
    color: data.color || '#a3e635',
    description: data.description || '',
    lastActivity: formatLastActivity(data.lastActivity),
    isPublic: !!data.isPublic,
    inviteCode: data.inviteCode || '',
    ownerId: data.ownerId || '',
    isAdmin: data.ownerId === uid,
    isMember: uid ? memberIds.includes(uid) : false,
    myRank: Number(data.myRank) || 1,
    hot: !!data.hot,
    requested: false,
  };
}

/** Liste render öncesi güvenli oda dizisi */
export function normalizeRoomList(rooms) {
  if (!Array.isArray(rooms)) return [];
  return rooms
    .map((room) => {
      if (!room?.id) return null;
      return {
        ...room,
        id: room.id,
        name: room.name ?? '',
        league: room.league ?? '',
        leagueId: room.leagueId ?? 'wc2026',
        members: Number(room.members) || 0,
        maxMembers: Number(room.maxMembers) || 20,
        totalPoints: Number(room.totalPoints) || 0,
        avatar: room.avatar ?? '✨',
        color: room.color ?? '#a3e635',
        description: room.description ?? '',
        lastActivity: room.lastActivity ?? '',
        myRank: Number(room.myRank) || 1,
        isPublic: !!room.isPublic,
        inviteCode: room.inviteCode ?? '',
        ownerId: room.ownerId ?? '',
        isAdmin: !!room.isAdmin,
        isMember: !!room.isMember,
      };
    })
    .filter(Boolean);
}

function generateInviteCode(name) {
  const slug = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8) || 'ODA';
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `VG-${slug}-${suffix}`;
}

function normalizeInviteCode(raw) {
  const trimmed = raw.trim().toUpperCase();
  const match = trimmed.match(/VG[-\w]+/);
  return match ? match[0].replace(/\s/g, '') : trimmed;
}

function mapFirestoreError(err, fallback) {
  const code = err?.code || '';
  if (code === 'permission-denied') {
    return new Error(
      'Firestore izin hatasi. Firebase Console > Firestore > Rules kurallarini deploy edin.',
    );
  }
  if (code === 'unavailable') {
    return new Error('Firestore sunucusuna ulasilamadi. Internet baglantinizi kontrol edin.');
  }
  return err instanceof Error ? err : new Error(fallback || 'Firestore islemi basarisiz.');
}

/** Yazinin gercekten sunucuya ulastigini dogrular — yerel onbellek sahte basariyi onler */
async function confirmServerDocument(docRef, label = 'Kayit') {
  if (!db) throw new Error('Firestore baglantisi yok.');

  try {
    await waitForPendingWrites(db);
  } catch (err) {
    console.warn('Bekleyen yazimlar beklenirken hata:', err);
  }

  try {
    const snap = await getDocFromServer(docRef);
    if (!snap.exists()) {
      throw new Error(`${label} sunucuya yazilamadi. Firestore kurallarini kontrol edin.`);
    }
    return snap;
  } catch (err) {
    throw mapFirestoreError(err, `${label} sunucuya yazilamadi.`);
  }
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('timeout')), ms);
    }),
  ]);
}

/** Arka planda sunucu dogrulama — UI bloklamaz */
function verifyOnServerLater(docRef, label) {
  withTimeout(confirmServerDocument(docRef, label), 6000).catch((err) => {
    console.warn(`${label} sunucu dogrulama:`, err?.message || err);
  });
}

/** Auth hazir olunca Firestore dinleyicisini baglar; cikis/giris sonrasi yeniden baglanir */
function watchFirestoreRooms({
  fallbackUid,
  buildQuery,
  onData,
  label,
  requireMemberUid = false,
}) {
  if (!isFirebaseConfigured || !db) {
    onData([]);
    return () => {};
  }

  let unsubSnapshot = () => {};
  let cancelled = false;
  let generation = 0;
  let lastAuthUid = null;

  const emit = (rooms) => {
    if (!cancelled) onData(Array.isArray(rooms) ? rooms : []);
  };

  const attach = (authUid) => {
    const gen = ++generation;
    unsubSnapshot();
    unsubSnapshot = () => {};

    const startSnapshot = () => {
      if (cancelled || gen !== generation) return;

      if (!auth?.currentUser) {
        emit([]);
        return;
      }

      const mapUid = authUid || resolveAuthUid(fallbackUid) || auth.currentUser.uid;
      if (requireMemberUid && !mapUid) {
        emit([]);
        return;
      }

      const q = buildQuery(mapUid);
      unsubSnapshot = onSnapshot(
        q,
        (snap) => {
          if (cancelled || gen !== generation) return;
          const list = snap.docs
            .map((d) => mapRoomDoc(d, mapUid))
            .filter(Boolean);
          emit(normalizeRoomList(list));
        },
        (err) => {
          console.error(`${label}:`, err);
          emit([]);
        },
      );
    };

    if (auth?.currentUser) {
      startSnapshot();
      return;
    }

    waitForAuthReady(2000)
      .then(startSnapshot)
      .catch((err) => {
        console.warn(`${label}: auth hazir degil`, err);
        emit([]);
      });
  };

  let unsubAuth = () => {};
  if (auth) {
    unsubAuth = onAuthStateChanged(auth, (user) => {
      const uid = user?.uid ?? null;
      if (uid === lastAuthUid) return;
      lastAuthUid = uid;
      attach(uid);
    });
  } else {
    attach(null);
  }

  return () => {
    cancelled = true;
    generation += 1;
    unsubSnapshot();
    unsubAuth();
  };
}

export const roomService = {
  isAvailable: () => isFirebaseConfigured && !!db,

  /**
   * Kullanıcının üye olduğu odaları gerçek zamanlı dinler
   * @returns {() => void} unsubscribe
   */
  subscribeUserRooms(uid, callback) {
    if (!uid) {
      callback([]);
      return () => {};
    }

    return watchFirestoreRooms({
      fallbackUid: uid,
      requireMemberUid: true,
      buildQuery: (queryUid) => query(
        collection(db, 'rooms'),
        where('memberIds', 'array-contains', queryUid),
      ),
      onData: callback,
      label: 'Oda dinleme',
    });
  },

  /**
   * Herkese açık odaları gerçek zamanlı dinler
   * @returns {() => void} unsubscribe
   */
  subscribePublicRooms(callback, uid = null) {
    return watchFirestoreRooms({
      fallbackUid: uid,
      requireMemberUid: false,
      buildQuery: () => query(collection(db, 'rooms'), where('isPublic', '==', true)),
      onData: callback,
      label: 'Genel oda dinleme',
    });
  },

  /**
   * Yeni oda oluşturur ve Firestore'a yazar
   */
  async createRoom({
    name,
    leagueId,
    leagueLabel,
    isPublic,
    ownerId,
    accentColor,
  }) {
    if (!this.isAvailable()) {
      throw new Error('Firebase yapılandırılmamış. Oda oluşturulamıyor.');
    }

    if (!auth?.currentUser) {
      await waitForAuthReady(2000);
    }
    const resolvedOwnerId = resolveAuthUid(ownerId);
    if (!resolvedOwnerId) throw new Error('Oturum açmanız gerekiyor.');

    const roomRef = doc(collection(db, 'rooms'));
    const inviteCode = generateInviteCode(name);

    const payload = {
      name: name.trim(),
      leagueId,
      league: leagueLabel,
      isPublic: !!isPublic,
      ownerId: resolvedOwnerId,
      memberIds: [resolvedOwnerId],
      members: 1,
      maxMembers: 20,
      inviteCode,
      totalPoints: 0,
      avatar: '✨',
      color: accentColor || '#a3e635',
      description: isPublic
        ? 'Kullanıcı tarafından oluşturulan açık tahmin odası.'
        : '',
      lastActivity: 'şimdi',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await withTimeout(setDoc(roomRef, payload), 10000);

    const localSnap = await getDoc(roomRef);
    const mapped = mapRoomDoc(localSnap, resolvedOwnerId);
    if (!mapped) {
      throw new Error('Oda oluşturulamadı.');
    }

    try {
      await withTimeout(confirmServerDocument(roomRef, 'Oda'), 6000);
    } catch (err) {
      throw mapFirestoreError(err, 'Oda sunucuya kaydedilemedi. Firebase Console > Firestore Rules kurallarini deploy edin.');
    }

    return mapped;
  },

  /**
   * Mevcut odaya katılır (genel keşfet veya davet)
   */
  async joinRoom(roomId, uid) {
    if (!this.isAvailable()) {
      throw new Error('Firebase yapılandırılmamış.');
    }

    await waitForAuthReady(2000);
    const resolvedUid = resolveAuthUid(uid);
    if (!resolvedUid) throw new Error('Oturum açmanız gerekiyor.');

    const roomRef = doc(db, 'rooms', roomId);
    let snap = await getDoc(roomRef);
    if (!snap.exists()) {
      try {
        snap = await withTimeout(getDocFromServer(roomRef), 4000);
      } catch {
        throw new Error('Oda bulunamadı.');
      }
    }
    if (!snap.exists()) throw new Error('Oda bulunamadı.');

    const data = snap.data();
    const memberIds = data.memberIds || [];

    if (memberIds.includes(resolvedUid)) {
      return mapRoomDoc(snap, resolvedUid);
    }

    if (memberIds.length >= (data.maxMembers ?? 20)) {
      throw new Error('Oda dolu.');
    }

    await updateDoc(roomRef, {
      memberIds: arrayUnion(resolvedUid),
      members: memberIds.length + 1,
      updatedAt: serverTimestamp(),
      lastActivity: 'şimdi',
    });

    const updated = await getDoc(roomRef);
    verifyOnServerLater(roomRef, 'Katilim');
    return mapRoomDoc(updated, resolvedUid);
  },

  /**
   * Davet kodu ile odaya katılır
   */
  async joinRoomByCode(rawCode, uid) {
    if (!this.isAvailable()) {
      throw new Error('Firebase yapılandırılmamış.');
    }

    await waitForAuthReady(2000);
    const resolvedUid = resolveAuthUid(uid);
    if (!resolvedUid) throw new Error('Oturum açmanız gerekiyor.');

    const inviteCode = normalizeInviteCode(rawCode);
    if (!inviteCode.startsWith('VG')) {
      throw new Error('Geçersiz kod veya link.');
    }

    const q = query(
      collection(db, 'rooms'),
      where('inviteCode', '==', inviteCode),
      limit(1),
    );

    let snap = await getDocs(q);
    if (snap.empty) {
      try {
        snap = await withTimeout(getDocsFromServer(q), 4000);
      } catch (err) {
        throw mapFirestoreError(err, 'Davet kodu sorgulanamadi.');
      }
    }

    if (snap.empty) {
      throw new Error('Geçersiz kod veya link.');
    }

    const roomDoc = snap.docs[0];
    return this.joinRoom(roomDoc.id, resolvedUid);
  },

  /**
   * Grubu kalıcı olarak siler — yalnızca oda sahibi
   */
  async deleteRoom(roomId, uid) {
    if (!this.isAvailable()) {
      throw new Error('Firebase yapılandırılmamış.');
    }

    await waitForAuthReady();
    const resolvedUid = resolveAuthUid(uid);
    if (!resolvedUid) throw new Error('Oturum açmanız gerekiyor.');

    const roomRef = doc(db, 'rooms', roomId);
    const snap = await getDoc(roomRef);
    if (!snap.exists()) throw new Error('Oda bulunamadı.');

    const data = snap.data();
    if (data.ownerId !== resolvedUid) {
      throw new Error('Yalnızca grup admini grubu silebilir.');
    }

    await deleteDoc(roomRef);
  },

  /**
   * Odadan ayrılır; son üye ayrılırsa oda silinir
   */
  async leaveRoom(roomId, uid) {
    if (!this.isAvailable()) return;

    await waitForAuthReady();
    const resolvedUid = resolveAuthUid(uid);
    if (!resolvedUid) return;

    const roomRef = doc(db, 'rooms', roomId);
    const snap = await getDoc(roomRef);
    if (!snap.exists()) return;

    const data = snap.data();
    const memberIds = (data.memberIds || []).filter((id) => id !== resolvedUid);
    const newCount = memberIds.length;

    if (newCount === 0) {
      await deleteDoc(roomRef);
      return;
    }

    await updateDoc(roomRef, {
      memberIds: arrayRemove(resolvedUid),
      members: newCount,
      updatedAt: serverTimestamp(),
    });
  },
};
