import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  OAuthProvider,
  sendPasswordResetEmail,
  deleteUser,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  EmailAuthProvider,
} from 'firebase/auth';
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
 * Determines how the current Firebase user signed in.
 * Returns 'google', 'apple', 'email', or 'unknown'.
 * @returns {string}
 */
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

/**
 * Re-authenticates the current user before a sensitive operation.
 * - For email/password users: requires the current password.
 * - For Google users: triggers a Google re-auth popup.
 * - If Firebase is not configured (local-only mode), resolves silently.
 *
 * @param {string|null} password - Required only for email/password users.
 * @returns {Promise<void>}
 */
export async function reauthenticateCurrentUser(password = null) {
  // If Firebase is not active (local-only mode), skip re-auth silently
  if (!auth || !auth.currentUser) return;

  const provider = getSignInProvider();

  if (provider === 'google') {
    // Google: trigger popup-based re-auth
    const googleProvider = new GoogleAuthProvider();
    googleProvider.setCustomParameters({ prompt: 'select_account' });
    await reauthenticateWithPopup(auth.currentUser, googleProvider);
  } else if (provider === 'apple') {
    const appleProvider = new OAuthProvider('apple.com');
    await reauthenticateWithPopup(auth.currentUser, appleProvider);
  } else if (provider === 'email') {
    // Email/password: credential-based re-auth
    if (!password) {
      throw new Error('Kimliğinizi doğrulamak için mevcut şifrenizi girmeniz gerekmektedir.');
    }
    const email = auth.currentUser.email;
    const credential = EmailAuthProvider.credential(email, password);
    await reauthenticateWithCredential(auth.currentUser, credential);
  }
  // For 'unknown' providers, skip silently (local-only users)
}

/**
 * Deletes the active user record from Firebase Auth and deletes their Firestore document.
 * Automatically performs re-authentication before deletion to satisfy Firebase's
 * recent-login requirement (auth/requires-recent-login).
 *
 * @param {string|null} password - Password for email users. Google users get a popup.
 * @returns {Promise<void>}
 */
export async function deleteCurrentUser(password = null) {
  // Local-only mode: Firebase not configured, skip Firebase deletion
  if (!auth || !auth.currentUser) return;

  const user = auth.currentUser;

  // 1. Re-authenticate first to satisfy Firebase's security requirement
  await reauthenticateCurrentUser(password);

  // 2. Delete Firestore users/{uid} document if Firestore db is active
  if (db) {
    try {
      await deleteDoc(doc(db, 'users', user.uid));
    } catch (err) {
      console.warn('Firestore users dökümanı silinemedi:', err);
    }
  }

  // 3. Delete the Firebase Auth user record
  await deleteUser(user);
}
