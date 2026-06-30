/* ═══════════════════════════════════════════════════════════════
   VibeGoal — Firestore Oda Servisi
   Odalar kalıcı olarak rooms koleksiyonunda tutulur.
═══════════════════════════════════════════════════════════════ */

import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  arrayUnion,
  arrayRemove,
  serverTimestamp,
  limit,
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

/** Auth hazir olunca Firestore dinleyicisini baglar; cikis/giris sonrasi yeniden baglanir */
function subscribeRoomsQuery(fallbackUid, buildQuery, callback, errorLabel) {
  if (!isFirebaseConfigured || !db) {
    callback([]);
    return () => {};
  }

  let unsubSnapshot = () => {};
  let cancelled = false;

  const attach = async () => {
    unsubSnapshot();
    unsubSnapshot = () => {};
    if (cancelled) return;

    try {
      await waitForAuthReady();
    } catch (err) {
      console.warn(`${errorLabel}: auth hazir degil`, err);
      return;
    }
    if (cancelled) return;

    const queryUid = resolveAuthUid(fallbackUid);
    if (!queryUid) {
      callback([]);
      return;
    }

    if (auth?.currentUser?.uid && fallbackUid && auth.currentUser.uid !== fallbackUid) {
      console.warn(`${errorLabel}: uid uyusmazligi duzeltildi`, {
        cached: fallbackUid,
        firebase: auth.currentUser.uid,
      });
    }

    const q = buildQuery(queryUid);
    unsubSnapshot = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs
          .map((d) => mapRoomDoc(d, queryUid))
          .filter(Boolean);
        callback(normalizeRoomList(list));
      },
      (err) => {
        console.error(`${errorLabel}:`, err);
        if (err?.code !== 'permission-denied') {
          callback([]);
        }
      },
    );
  };

  let unsubAuth = () => {};
  attach();
  if (auth) {
    unsubAuth = onAuthStateChanged(auth, () => {
      attach();
    });
  }

  return () => {
    cancelled = true;
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

    return subscribeRoomsQuery(
      uid,
      (queryUid) => query(
        collection(db, 'rooms'),
        where('memberIds', 'array-contains', queryUid),
      ),
      callback,
      'Oda dinleme hatasi',
    );
  },

  /**
   * Herkese açık odaları gerçek zamanlı dinler
   * @returns {() => void} unsubscribe
   */
  subscribePublicRooms(callback, uid = null) {
    return subscribeRoomsQuery(
      uid,
      () => query(collection(db, 'rooms'), where('isPublic', '==', true)),
      callback,
      'Genel oda dinleme hatasi',
    );
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

    await waitForAuthReady();
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

    await setDoc(roomRef, payload);

    try {
      const saved = await getDoc(roomRef);
      const mapped = mapRoomDoc(saved, resolvedOwnerId);
      if (mapped) return mapped;
    } catch (err) {
      console.warn('Oda oluşturuldu; okuma atlandı:', err);
    }

    return {
      id: roomRef.id,
      name: name.trim(),
      leagueId,
      league: leagueLabel,
      isPublic: !!isPublic,
      ownerId: resolvedOwnerId,
      members: 1,
      maxMembers: 20,
      totalPoints: 0,
      avatar: '✨',
      color: accentColor || '#a3e635',
      description: payload.description,
      lastActivity: 'şimdi',
      inviteCode,
      isAdmin: true,
      isMember: true,
      myRank: 1,
      hot: false,
      requested: false,
    };
  },

  /**
   * Mevcut odaya katılır (genel keşfet veya davet)
   */
  async joinRoom(roomId, uid) {
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
    return mapRoomDoc(updated, resolvedUid);
  },

  /**
   * Davet kodu ile odaya katılır
   */
  async joinRoomByCode(rawCode, uid) {
    if (!this.isAvailable()) {
      throw new Error('Firebase yapılandırılmamış.');
    }

    await waitForAuthReady();
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
    const snap = await getDocs(q);

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
      memberIds: arrayRemove(uid),
      members: newCount,
      updatedAt: serverTimestamp(),
    });
  },
};
