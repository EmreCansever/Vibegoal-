/* ═══════════════════════════════════════════════════════════════
   VibeGoal — Soyutlanmış Veri Servis Katmanı
   Firebase Auth + Firestore birincil; yapılandırma yoksa localStorage yedek.

   authService  → Giriş / Kayıt / Çıkış / Oturum kontrolü
   dbService    → Kullanıcı profili, puanlar, tahminler CRUD
═══════════════════════════════════════════════════════════════ */

import {
  auth,
  isFirebaseConfigured,
  registerWithEmail,
  loginWithEmail,
  firebaseSignOut,
  subscribeAuthState,
  sessionUserFromAuth,
  syncUserProfileInBackground,
  upsertUserDocument,
  patchUserDocument,
} from './firebase';

const LS_KEYS = {
  USERS:        'vg_users',
  CURRENT_USER: 'vg_current_user',
  USER_PROFILE: (uid) => `vg_profile_${uid}`,
  USER_PREDS:   (uid) => `vg_predictions_${uid}`,
  USER_ANSWERS: (uid) => `vg_answers_${uid}`,
};

function lsGet(key, fallback = null) {
  try {
    const val = localStorage.getItem(key);
    return val ? JSON.parse(val) : fallback;
  } catch {
    return fallback;
  }
}

function lsSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota */ }
}

function lsDel(key) {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

function genUid() {
  return `uid_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function hashPassword(pw) {
  return btoa(pw + '_vg_salt_2026');
}

function cacheSessionUser(user) {
  if (user) lsSet(LS_KEYS.CURRENT_USER, user);
  else lsDel(LS_KEYS.CURRENT_USER);
}

function profileToCache(uid, profile) {
  if (profile) lsSet(LS_KEYS.USER_PROFILE(uid), profile);
}

/** Yerel profil önbelleğini oturum kullanıcısıyla birleştir */
function mergeSessionWithLocalProfile(sessionUser) {
  const cached = lsGet(LS_KEYS.USER_PROFILE(sessionUser.uid));
  if (!cached) {
    lsSet(LS_KEYS.USER_PROFILE(sessionUser.uid), {
      uid: sessionUser.uid,
      username: sessionUser.username,
      totalPoints: 0,
      correct: 0,
      total: 0,
      badge: '',
      avatar: sessionUser.avatar || '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return sessionUser;
  }
  return {
    ...sessionUser,
    username: cached.username || sessionUser.username,
    avatar: cached.avatar || sessionUser.avatar,
  };
}

/* ═══════════════════════════════════════════════════════════════
   authService
═══════════════════════════════════════════════════════════════ */
export const authService = {

  /**
   * Firebase oturum dinleyicisini başlatır
   * @returns {Promise<() => void>}
   */
  async initSessionListener(callback) {
    if (!isFirebaseConfigured) {
      callback(this.getCurrentUser());
      return () => {};
    }

    const applyFirebaseUser = (firebaseUser) => {
      if (!firebaseUser) {
        cacheSessionUser(null);
        callback(null);
        return;
      }

      const sessionUser = mergeSessionWithLocalProfile(sessionUserFromAuth(firebaseUser));
      cacheSessionUser(sessionUser);
      callback(sessionUser);

      syncUserProfileInBackground(firebaseUser).then((doc) => {
        if (doc) profileToCache(firebaseUser.uid, doc);
      });
    };

    const cached = this.getCurrentUser();
    if (cached) callback(cached);

    return subscribeAuthState((firebaseUser) => {
      applyFirebaseUser(firebaseUser);
    });
  },

  /**
   * Kullanıcı kaydı — Firebase Auth + Firestore users/{uid}
   */
  async register({ username, email, password }) {
    if (isFirebaseConfigured) {
      try {
        const firebaseUser = await registerWithEmail({ email, password, username });
        const sessionUser = mergeSessionWithLocalProfile(sessionUserFromAuth(firebaseUser));
        cacheSessionUser(sessionUser);
        dbService.initProfile(sessionUser.uid, sessionUser.username);
        syncUserProfileInBackground(firebaseUser).then((doc) => {
          if (doc) profileToCache(firebaseUser.uid, doc);
        });
        return { success: true, user: sessionUser };
      } catch (err) {
        return { success: false, error: err };
      }
    }

    return this._localRegister({ username, email, password });
  },

  _localRegister({ username, email, password }) {
    const users = lsGet(LS_KEYS.USERS, {});
    const normalizedEmail = email.toLowerCase().trim();

    if (Object.values(users).some((u) => u.email === normalizedEmail)) {
      return { success: false, error: 'Bu e-posta zaten kayıtlı.' };
    }
    if (Object.values(users).some((u) => u.username.toLowerCase() === username.toLowerCase().trim())) {
      return { success: false, error: 'Bu kullanıcı adı alınmış.' };
    }

    const uid = genUid();
    const user = {
      uid,
      username: username.trim(),
      email: normalizedEmail,
      password: hashPassword(password),
      createdAt: Date.now(),
      avatar: '',
    };

    users[uid] = user;
    lsSet(LS_KEYS.USERS, users);
    dbService.initProfile(uid, username.trim());

    const sessionUser = { uid, username: user.username, email: user.email, avatar: user.avatar };
    cacheSessionUser(sessionUser);
    return { success: true, user: sessionUser };
  },

  /**
   * E-posta + şifre ile giriş — yalnızca Firebase Auth, Firestore giriş anında yok
   */
  async login({ email, password }) {
    if (isFirebaseConfigured) {
      try {
        const firebaseUser = await loginWithEmail({ email, password });
        const sessionUser = mergeSessionWithLocalProfile(sessionUserFromAuth(firebaseUser));
        cacheSessionUser(sessionUser);

        syncUserProfileInBackground(firebaseUser).then((doc) => {
          if (doc) profileToCache(firebaseUser.uid, doc);
        });

        return { success: true, user: sessionUser };
      } catch (err) {
        return { success: false, error: err };
      }
    }

    return this._localLogin({ email, password });
  },

  _localLogin({ email, password }) {
    const users = lsGet(LS_KEYS.USERS, {});
    const user = Object.values(users).find(
      (u) => u.email === email.toLowerCase().trim() && u.password === hashPassword(password),
    );

    if (!user) return { success: false, error: 'E-posta veya şifre hatalı.' };

    const sessionUser = { uid: user.uid, username: user.username, email: user.email, avatar: user.avatar };
    cacheSessionUser(sessionUser);
    return { success: true, user: sessionUser };
  },

  /**
   * Google / Apple sosyal giriş
   */
  async socialLogin(firebaseUser) {
    if (!firebaseUser) return { success: false, error: 'Kullanıcı bilgileri bulunamadı.' };

    if (isFirebaseConfigured) {
      const sessionUser = mergeSessionWithLocalProfile(sessionUserFromAuth(firebaseUser));
      cacheSessionUser(sessionUser);
      dbService.initProfile(sessionUser.uid, sessionUser.username);
      if (sessionUser.avatar) {
        dbService.updateProfile(sessionUser.uid, { avatar: sessionUser.avatar });
      }
      upsertUserDocument(firebaseUser).catch(() => {});
      syncUserProfileInBackground(firebaseUser).then((doc) => {
        if (doc) profileToCache(firebaseUser.uid, doc);
      });
      return { success: true, user: sessionUser };
    }

    const profile = {
      uid: firebaseUser.uid,
      username: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Kullanıcı',
      email: firebaseUser.email || '',
      avatar: firebaseUser.photoURL || '',
    };

    const users = lsGet(LS_KEYS.USERS, {});
    if (!users[profile.uid]) {
      users[profile.uid] = { ...profile, password: '', createdAt: Date.now() };
      lsSet(LS_KEYS.USERS, users);
      dbService.initProfile(profile.uid, profile.username);
      if (profile.avatar) dbService.updateProfile(profile.uid, { avatar: profile.avatar });
    }

    cacheSessionUser(profile);
    return { success: true, user: profile };
  },

  /**
   * Oturumu kapat — Firebase Auth oturumu da kapatılır
   */
  async logout() {
    cacheSessionUser(null);
    if (isFirebaseConfigured) {
      try {
        await firebaseSignOut();
      } catch (err) {
        console.warn('Firebase çıkış hatası:', err);
      }
    }
  },

  getCurrentUser() {
    return lsGet(LS_KEYS.CURRENT_USER, null);
  },

  deleteAccount(uid) {
    dbService.deleteProfile(uid);
    cacheSessionUser(null);
  },
};

/* ═══════════════════════════════════════════════════════════════
   dbService
═══════════════════════════════════════════════════════════════ */
export const dbService = {

  initProfile(uid, username) {
    const existing = lsGet(LS_KEYS.USER_PROFILE(uid));
    if (existing) {
      if (isFirebaseConfigured) {
        patchUserDocument(uid, { username: existing.username || username }).catch(() => {});
      }
      return existing;
    }

    const profile = {
      uid,
      username,
      totalPoints: 0,
      correct: 0,
      total: 0,
      badge: '',
      avatar: '',
      rank: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    lsSet(LS_KEYS.USER_PROFILE(uid), profile);

    if (isFirebaseConfigured) {
      patchUserDocument(uid, {
        username,
        totalPoints: 0,
        correct: 0,
        total: 0,
        badge: '',
        avatar: '',
      }).catch(() => {});
    }

    return profile;
  },

  getProfile(uid) {
    return lsGet(LS_KEYS.USER_PROFILE(uid), null);
  },

  updateProfile(uid, updates) {
    const profile = this.getProfile(uid) || {};
    const updated = { ...profile, ...updates, uid, updatedAt: Date.now() };
    lsSet(LS_KEYS.USER_PROFILE(uid), updated);

    if (isFirebaseConfigured) {
      const { uid: _u, createdAt, ...firestoreFields } = updated;
      patchUserDocument(uid, firestoreFields).catch(() => {});
    }

    return updated;
  },

  addPoints(uid, delta, correctDelta = 0) {
    const profile = this.getProfile(uid) || {};
    return this.updateProfile(uid, {
      totalPoints: (profile.totalPoints || 0) + delta,
      correct: (profile.correct || 0) + correctDelta,
      total: (profile.total || 0) + (correctDelta > 0 || delta > 0 ? 1 : 0),
    });
  },

  savePredictions(uid, predictions) {
    lsSet(LS_KEYS.USER_PREDS(uid), { ...predictions, _updatedAt: Date.now() });
  },

  getPredictions(uid) {
    const { _updatedAt: _, ...preds } = lsGet(LS_KEYS.USER_PREDS(uid), {});
    return preds;
  },

  saveAnswers(uid, answers) {
    lsSet(LS_KEYS.USER_ANSWERS(uid), { ...answers, _updatedAt: Date.now() });
  },

  getAnswers(uid) {
    const { _updatedAt: _, ...answers } = lsGet(LS_KEYS.USER_ANSWERS(uid), {});
    return answers;
  },

  deleteProfile(uid) {
    lsDel(LS_KEYS.USER_PROFILE(uid));
    lsDel(LS_KEYS.USER_PREDS(uid));
    lsDel(LS_KEYS.USER_ANSWERS(uid));

    const users = lsGet(LS_KEYS.USERS, {});
    if (users[uid]) {
      delete users[uid];
      lsSet(LS_KEYS.USERS, users);
    }

    lsDel(`vg_predict_history_${uid}`);
    lsDel(`vg_calculated_matches_${uid}`);
    lsDel(`vg_resolved_questions_${uid}`);
  },
};

export { roomService } from './roomService';
