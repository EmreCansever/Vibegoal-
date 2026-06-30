import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  signInWithPopup,
  GoogleAuthProvider,
  OAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  fetchSignInMethodsForEmail,
  sendPasswordResetEmail,
  updateProfile,
  deleteUser,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  EmailAuthProvider,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  getDocFromServer,
  getDocs,
  deleteDoc,
  query,
  where,
  limit,
  serverTimestamp,
  collection,
  enableNetwork,
  waitForPendingWrites,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const hasConfig =
  firebaseConfig.apiKey &&
  firebaseConfig.apiKey !== 'your_api_key_here' &&
  firebaseConfig.apiKey.trim() !== '';

let app;
let auth;
let db;
let authPersistenceReady = null;

if (hasConfig) {
  try {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    auth = getAuth(app);
    db = getFirestore(app);
    enableNetwork(db).catch((err) => {
      console.warn('Firestore ag etkinlestirilemedi:', err);
    });
    authPersistenceReady = setPersistence(auth, browserLocalPersistence).catch((err) => {
      authPersistenceReady = null;
      console.warn('Firebase auth persistence ayarlanamadı:', err);
    });
  } catch (err) {
    console.error('Firebase initialization failed:', err);
  }
}

export { auth, db, hasConfig as isFirebaseConfigured };

/** Firebase Auth oturumu tamamen yuklenene kadar bekler (max 2.5sn) */
export async function waitForAuthReady(maxMs = 2500) {
  if (!auth) return;
  if (auth.currentUser) return;
  await ensureAuthPersistence();
  if (typeof auth.authStateReady !== 'function') return;
  await Promise.race([
    auth.authStateReady(),
    new Promise((resolve) => { setTimeout(resolve, maxMs); }),
  ]);
}

/** Gecerli Firebase Auth uid — yoksa null */
export function getFirebaseAuthUid() {
  return auth?.currentUser?.uid ?? null;
}

/** Firebase uid oncelikli; yedek olarak verilen uid */
export function resolveAuthUid(fallbackUid) {
  return getFirebaseAuthUid() || fallbackUid || null;
}

/** Tarayıcıda oturumun kalıcı kalmasını garanti eder */
export function ensureAuthPersistence() {
  if (!auth) return Promise.resolve();
  if (!authPersistenceReady) {
    authPersistenceReady = setPersistence(auth, browserLocalPersistence).catch((err) => {
      authPersistenceReady = null;
      throw err;
    });
  }
  return authPersistenceReady;
}

/**
 * Firestore users/{uid} dökümanını oluşturur veya günceller (merge).
 * Şifre asla yazılmaz — yalnızca Firebase Auth yönetir.
 */
export async function upsertUserDocument(firebaseUser, { username } = {}) {
  if (!db || !firebaseUser?.uid) return null;

  try {
    const ref = doc(db, 'users', firebaseUser.uid);
    const existing = await getDoc(ref);
    const email = (firebaseUser.email || '').toLowerCase().trim();
    const resolvedUsername =
      username?.trim() ||
      firebaseUser.displayName ||
      email.split('@')[0] ||
      'Kullanıcı';

    if (existing.exists()) {
      const data = existing.data();
      const patch = {
        email: email || data.email || '',
        updatedAt: serverTimestamp(),
      };
      if (username?.trim()) patch.username = username.trim();
      if (firebaseUser.photoURL && !data.avatar) patch.avatar = firebaseUser.photoURL;
      await setDoc(ref, patch, { merge: true });
      return { ...data, ...patch, uid: firebaseUser.uid };
    }

    const profile = {
      uid: firebaseUser.uid,
      username: resolvedUsername,
      email,
      avatar: firebaseUser.photoURL || '',
      totalPoints: 0,
      correct: 0,
      total: 0,
      badge: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(ref, profile);
    return profile;
  } catch (err) {
    console.warn('Firestore users dökümanı yazılamadı:', err);
    return null;
  }
}

/** Firestore'dan kullanıcı profili okur — hata olursa null döner */
export async function fetchUserDocument(uid) {
  if (!db || !uid) return null;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    return snap.exists() ? snap.data() : null;
  } catch (err) {
    console.warn('Firestore profil okunamadı:', err);
    return null;
  }
}

/** Firestore users/{uid} kısmi güncelleme */
export async function patchUserDocument(uid, updates) {
  if (!db || !uid) return;
  try {
    await setDoc(
      doc(db, 'users', uid),
      { ...updates, updatedAt: serverTimestamp() },
      { merge: true },
    );
  } catch (err) {
    console.warn('Firestore profil güncellenemedi:', err);
  }
}

/**
 * E-posta kayıtlı mı? Önce Firebase Auth, sonra Firestore users sorgusu.
 */
export async function emailAccountExists(email) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;

  if (auth) {
    await ensureAuthPersistence();
    const methods = await fetchSignInMethodsForEmail(auth, normalized);
    if (methods.length > 0) return true;
  }

  if (db) {
    const q = query(
      collection(db, 'users'),
      where('email', '==', normalized),
      limit(1),
    );
    const snap = await getDocs(q);
    if (!snap.empty) return true;
  }

  return false;
}

/**
 * E-posta/şifre ile kayıt — Auth + Firestore profil
 */
export async function registerWithEmail({ email, password, username }) {
  if (!auth) {
    throw new Error('Firebase Authentication konfigüre edilmemiş! Lütfen .env dosyasını geçerli Firebase anahtarlarıyla güncelleyin.');
  }
  await ensureAuthPersistence();
  const normalizedEmail = email.trim().toLowerCase();
  const cred = await createUserWithEmailAndPassword(auth, normalizedEmail, password);

  if (username?.trim()) {
    try {
      await updateProfile(cred.user, { displayName: username.trim() });
    } catch (err) {
      console.warn('Auth displayName güncellenemedi:', err);
    }
  }

  try {
    await upsertUserDocument(cred.user, { username });
  } catch (err) {
    console.warn('Firestore profil oluşturulamadı (Auth hesabı oluşturuldu):', err);
  }

  return cred.user;
}

/**
 * E-posta/şifre ile giriş
 */
export async function loginWithEmail({ email, password }) {
  if (!auth) {
    throw new Error('Firebase Authentication konfigüre edilmemiş! Lütfen .env dosyasını geçerli Firebase anahtarlarıyla güncelleyin.');
  }
  await ensureAuthPersistence();
  const normalizedEmail = email.trim().toLowerCase();
  const cred = await signInWithEmailAndPassword(auth, normalizedEmail, password);
  return cred.user;
}

/** Oturumu kapat */
export async function firebaseSignOut() {
  if (!auth) return;
  await signOut(auth);
}

/** Auth durumu dinleyicisi */
export function subscribeAuthState(callback) {
  if (!auth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
}

/** Auth kullanıcısından anında oturum objesi — Firestore sorgusu yok */
export function sessionUserFromAuth(firebaseUser) {
  if (!firebaseUser) return null;

  const email = (firebaseUser.email || '').toLowerCase().trim();

  return {
    uid: firebaseUser.uid,
    username:
      firebaseUser.displayName ||
      email.split('@')[0] ||
      'Kullanıcı',
    email,
    avatar: firebaseUser.photoURL || '',
  };
}

/** Giriş sonrası Firestore profil senkronu — arka planda, girişi bloklamaz */
export function syncUserProfileInBackground(firebaseUser) {
  if (!firebaseUser?.uid) return Promise.resolve(null);

  return (async () => {
    try {
      let profile = await fetchUserDocument(firebaseUser.uid);
      if (!profile) {
        profile = await upsertUserDocument(firebaseUser);
      }
      return profile;
    } catch (err) {
      console.warn('Arka plan profil senkronizasyonu atlandı:', err);
      return null;
    }
  })();
}

/**
 * Oturum kullanıcısından uygulama session objesi üretir (Firestore dahil — kayıt/sosyal giriş)
 */
export async function mapFirebaseUserToSession(firebaseUser) {
  if (!firebaseUser) return null;

  const base = sessionUserFromAuth(firebaseUser);
  const profile = await syncUserProfileInBackground(firebaseUser);

  if (!profile) return base;

  return {
    ...base,
    username: profile.username || base.username,
    avatar: profile.avatar || base.avatar,
  };
}

/**
 * Sign in using Google OAuth popup
 */
export async function signInWithGoogle() {
  if (!auth) {
    throw new Error('Firebase Authentication .env dosyası üzerinden konfigüre edilmemiş! Lütfen .env dosyasını geçerli Firebase anahtarlarıyla güncelleyin.');
  }
  await ensureAuthPersistence();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const result = await signInWithPopup(auth, provider);
  await upsertUserDocument(result.user);
  return result.user;
}

/**
 * Sign in using Apple OAuth popup
 */
export async function signInWithApple() {
  if (!auth) {
    throw new Error('Firebase Authentication .env dosyası üzerinden konfigüre edilmemiş! Lütfen .env dosyasını geçerli Firebase anahtarlarıyla güncelleyin.');
  }
  await ensureAuthPersistence();
  const provider = new OAuthProvider('apple.com');
  const result = await signInWithPopup(auth, provider);
  await upsertUserDocument(result.user);
  return result.user;
}

/**
 * Hesap varlığı kontrolü sonrası şifre sıfırlama maili gönderir.
 */
export async function sendPasswordReset(email) {
  if (!auth) {
    throw new Error('Firebase Authentication konfigüre edilmemiş! Lütfen .env dosyasını geçerli Firebase anahtarlarıyla güncelleyin.');
  }

  const normalized = email.trim().toLowerCase();
  const exists = await emailAccountExists(normalized);
  if (!exists) {
    const err = new Error('Bu e-posta adresine ait bir kullanıcı bulunamadı.');
    err.code = 'auth/user-not-found';
    throw err;
  }

  await ensureAuthPersistence();
  await sendPasswordResetEmail(auth, normalized);
}

export function getSignInProvider() {
  if (!auth?.currentUser) return 'unknown';
  const providerData = auth.currentUser.providerData;
  if (!providerData || providerData.length === 0) return 'unknown';
  const providerId = providerData[0]?.providerId || '';
  if (providerId === 'google.com') return 'google';
  if (providerId === 'apple.com') return 'apple';
  if (providerId === 'password') return 'email';
  return 'unknown';
}

export async function reauthenticateCurrentUser(password = null) {
  if (!auth || !auth.currentUser) return;

  const provider = getSignInProvider();

  if (provider === 'google') {
    const googleProvider = new GoogleAuthProvider();
    googleProvider.setCustomParameters({ prompt: 'select_account' });
    await reauthenticateWithPopup(auth.currentUser, googleProvider);
  } else if (provider === 'apple') {
    const appleProvider = new OAuthProvider('apple.com');
    await reauthenticateWithPopup(auth.currentUser, appleProvider);
  } else if (provider === 'email') {
    if (!password) {
      throw new Error('Kimliğinizi doğrulamak için mevcut şifrenizi girmeniz gerekmektedir.');
    }
    const email = auth.currentUser.email;
    const credential = EmailAuthProvider.credential(email, password);
    await reauthenticateWithCredential(auth.currentUser, credential);
  }
}

export async function deleteCurrentUser(password = null) {
  if (!auth || !auth.currentUser) return;

  const user = auth.currentUser;
  await reauthenticateCurrentUser(password);

  if (db) {
    try {
      await deleteDoc(doc(db, 'users', user.uid));
    } catch (err) {
      console.warn('Firestore users dökümanı silinemedi:', err);
    }
  }

  await deleteUser(user);
}
