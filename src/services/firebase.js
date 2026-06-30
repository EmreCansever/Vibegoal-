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
  getDocs,
  deleteDoc,
  query,
  where,
  limit,
  serverTimestamp,
  collection,
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
    authPersistenceReady = setPersistence(auth, browserLocalPersistence).catch((err) => {
      authPersistenceReady = null;
      console.warn('Firebase auth persistence ayarlanamadı:', err);
    });
  } catch (err) {
    console.error('Firebase initialization failed:', err);
  }
}

export { auth, db, hasConfig as isFirebaseConfigured };

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
}

/** Firestore'dan kullanıcı profili okur */
export async function fetchUserDocument(uid) {
  if (!db || !uid) return null;
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? snap.data() : null;
}

/** Firestore users/{uid} kısmi güncelleme */
export async function patchUserDocument(uid, updates) {
  if (!db || !uid) return;
  await setDoc(
    doc(db, 'users', uid),
    { ...updates, updatedAt: serverTimestamp() },
    { merge: true },
  );
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
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
  await upsertUserDocument(cred.user, { username });
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
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
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

/**
 * Oturum kullanıcısından uygulama session objesi üretir
 */
export async function mapFirebaseUserToSession(firebaseUser) {
  if (!firebaseUser) return null;

  let profile = await fetchUserDocument(firebaseUser.uid);
  if (!profile) {
    profile = await upsertUserDocument(firebaseUser);
  }

  return {
    uid: firebaseUser.uid,
    username: profile?.username || firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Kullanıcı',
    email: (firebaseUser.email || profile?.email || '').toLowerCase(),
    avatar: profile?.avatar || firebaseUser.photoURL || '',
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
