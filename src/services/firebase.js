import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, OAuthProvider, sendPasswordResetEmail, deleteUser } from 'firebase/auth';
import { getFirestore, doc, deleteDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Check if valid config exists (and isn't the placeholder string)
const hasConfig = 
  firebaseConfig.apiKey && 
  firebaseConfig.apiKey !== 'your_api_key_here' &&
  firebaseConfig.apiKey.trim() !== '';

let app;
let auth;
let db;

if (hasConfig) {
  try {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    auth = getAuth(app);
    db = getFirestore(app);
  } catch (err) {
    console.error('Firebase initialization failed:', err);
  }
}

export { auth, db };

/**
 * Sign in using Google OAuth popup
 * @returns {Promise<import('firebase/auth').User>}
 */
export async function signInWithGoogle() {
  if (!auth) {
    throw new Error('Firebase Authentication .env dosyası üzerinden konfigüre edilmemiş! Lütfen .env dosyasını geçerli Firebase anahtarlarıyla güncelleyin.');
  }
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

/**
 * Sign in using Apple OAuth popup
 * @returns {Promise<import('firebase/auth').User>}
 */
export async function signInWithApple() {
  if (!auth) {
    throw new Error('Firebase Authentication .env dosyası üzerinden konfigüre edilmemiş! Lütfen .env dosyasını geçerli Firebase anahtarlarıyla güncelleyin.');
  }
  const provider = new OAuthProvider('apple.com');
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

/**
 * Sends a password reset email using Firebase Auth.
 * @param {string} email
 * @returns {Promise<void>}
 */
export async function sendPasswordReset(email) {
  if (!auth) {
    throw new Error('Firebase Authentication konfigüre edilmemiş! Lütfen .env dosyasını geçerli Firebase anahtarlarıyla güncelleyin.');
  }
  await sendPasswordResetEmail(auth, email.trim());
}

/**
 * Deletes the active user record from Firebase Auth and deletes their Firestore document user record.
 * @returns {Promise<void>}
 */
export async function deleteCurrentUser() {
  if (!auth || !auth.currentUser) {
    throw new Error('Aktif kullanıcı oturumu bulunamadı.');
  }
  const user = auth.currentUser;

  // 1. Delete Firestore users/{uid} document if Firestore db is active
  if (db) {
    try {
      await deleteDoc(doc(db, 'users', user.uid));
    } catch (err) {
      console.warn('Firestore users dökümanı silinemedi:', err);
    }
  }

  // 2. Delete auth user record
  await deleteUser(user);
}
