import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, OAuthProvider } from 'firebase/auth';

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

if (hasConfig) {
  try {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    auth = getAuth(app);
  } catch (err) {
    console.error('Firebase initialization failed:', err);
  }
}

export { auth };

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
