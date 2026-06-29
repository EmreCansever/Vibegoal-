/* ═══════════════════════════════════════════════════════════════
   VibeGoal — Soyutlanmış Veri Servis Katmanı
   LocalStorage Bridge — Firebase'e geçişte sadece bu dosya değişir.

   authService  → Giriş / Kayıt / Çıkış / Oturum kontrolü
   dbService    → Kullanıcı profili, puanlar, tahminler CRUD
   sessionService → Aktif oturum yönetimi
═══════════════════════════════════════════════════════════════ */

const LS_KEYS = {
  USERS:        'vg_users',
  CURRENT_USER: 'vg_current_user',
  USER_PROFILE: (uid) => `vg_profile_${uid}`,
  USER_PREDS:   (uid) => `vg_predictions_${uid}`,
  USER_ANSWERS: (uid) => `vg_answers_${uid}`,
}

/* ── Yardımcı fonksiyonlar ─────────────────────────────────── */
function lsGet(key, fallback = null) {
  try {
    const val = localStorage.getItem(key)
    return val ? JSON.parse(val) : fallback
  } catch {
    return fallback
  }
}
function lsSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* quota */ }
}
function lsDel(key) {
  try { localStorage.removeItem(key) } catch { /* ignore */ }
}
function genUid() {
  return `uid_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}
function hashPassword(pw) {
  // Basit obfuscation — gerçek projede server-side hashing yapılır
  return btoa(pw + '_vg_salt_2026')
}

/* ═══════════════════════════════════════════════════════════════
   authService
═══════════════════════════════════════════════════════════════ */
export const authService = {

  /**
   * Kullanıcı kaydı
   * @returns {{ success, user, error }}
   */
  register({ username, email, password }) {
    const users = lsGet(LS_KEYS.USERS, {})

    // E-posta kontrolü
    const emailExists = Object.values(users).some(u => u.email === email.toLowerCase().trim())
    if (emailExists) return { success: false, error: 'Bu e-posta zaten kayıtlı.' }

    // Kullanıcı adı kontrolü
    const uNameExists = Object.values(users).some(
      u => u.username.toLowerCase() === username.toLowerCase().trim()
    )
    if (uNameExists) return { success: false, error: 'Bu kullanıcı adı alınmış.' }

    const uid = genUid()
    const user = {
      uid,
      username: username.trim(),
      email:    email.toLowerCase().trim(),
      password: hashPassword(password),
      createdAt: Date.now(),
      avatar: '',
    }

    users[uid] = user
    lsSet(LS_KEYS.USERS, users)

    // Varsayılan profil oluştur
    dbService.initProfile(uid, username.trim())

    // Oturumu başlat
    const sessionUser = { uid, username: user.username, email: user.email, avatar: user.avatar }
    lsSet(LS_KEYS.CURRENT_USER, sessionUser)

    return { success: true, user: sessionUser }
  },

  /**
   * E-posta + Şifre ile giriş
   * @returns {{ success, user, error }}
   */
  login({ email, password }) {
    const users = lsGet(LS_KEYS.USERS, {})
    const user = Object.values(users).find(
      u => u.email === email.toLowerCase().trim() && u.password === hashPassword(password)
    )

    if (!user) return { success: false, error: 'E-posta veya şifre hatalı.' }

    const sessionUser = { uid: user.uid, username: user.username, email: user.email, avatar: user.avatar }
    lsSet(LS_KEYS.CURRENT_USER, sessionUser)

    return { success: true, user: sessionUser }
  },

  /**
   * Google / Apple sosyal giriş — Firebase kullanıcısı ile sisteme bağlar
   * @param {object} firebaseUser
   * @returns {{ success, user }}
   */
  socialLogin(firebaseUser) {
    if (!firebaseUser) return { success: false, error: 'Kullanıcı bilgileri bulunamadı.' }

    const profile = {
      uid:      firebaseUser.uid,
      username: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Kullanıcı',
      email:    firebaseUser.email || '',
      avatar:   firebaseUser.photoURL || '',
    }

    // Eğer daha önce kayıtlı değilse oluştur
    const users = lsGet(LS_KEYS.USERS, {})
    if (!users[profile.uid]) {
      users[profile.uid] = { ...profile, password: '', createdAt: Date.now() }
      lsSet(LS_KEYS.USERS, users)
      dbService.initProfile(profile.uid, profile.username)
      if (profile.avatar) {
        dbService.updateProfile(profile.uid, { avatar: profile.avatar })
      }
    } else {
      const localProfile = dbService.getProfile(profile.uid)
      if (localProfile) {
        dbService.updateProfile(profile.uid, {
          username: profile.username || localProfile.username,
          avatar: profile.avatar || localProfile.avatar
        })
      }
    }

    lsSet(LS_KEYS.CURRENT_USER, profile)
    return { success: true, user: profile }
  },

  /**
   * Oturumu kapat
   */
  logout() {
    lsDel(LS_KEYS.CURRENT_USER)
  },

  /**
   * Aktif oturumu getir — sayfa yenilemede bile çalışır
   * @returns {user | null}
   */
  getCurrentUser() {
    return lsGet(LS_KEYS.CURRENT_USER, null)
  },

  /**
   * Hesabı siler ve oturumu kapatır
   */
  deleteAccount(uid) {
    dbService.deleteProfile(uid)
    this.logout()
  },
}

/* ═══════════════════════════════════════════════════════════════
   dbService
═══════════════════════════════════════════════════════════════ */
export const dbService = {

  /**
   * Yeni kullanıcı için varsayılan profil oluştur
   */
  initProfile(uid, username) {
    const existing = lsGet(LS_KEYS.USER_PROFILE(uid))
    if (existing) return existing

    const profile = {
      uid,
      username,
      totalPoints: 0,
      correct:     0,
      total:       0,
      badge:       '',
      avatar:      '',
      rank:        1,
      createdAt:   Date.now(),
      updatedAt:   Date.now(),
    }
    lsSet(LS_KEYS.USER_PROFILE(uid), profile)
    return profile
  },


  /**
   * Kullanıcı profilini getir
   * @returns {profile | null}
   */
  getProfile(uid) {
    return lsGet(LS_KEYS.USER_PROFILE(uid), null)
  },

  /**
   * Profili güncelle (kısmi)
   */
  updateProfile(uid, updates) {
    const profile = this.getProfile(uid) || {}
    const updated = { ...profile, ...updates, uid, updatedAt: Date.now() }
    lsSet(LS_KEYS.USER_PROFILE(uid), updated)
    return updated
  },

  /**
   * Puan ekle
   */
  addPoints(uid, delta, correctDelta = 0) {
    const profile = this.getProfile(uid) || {}
    return this.updateProfile(uid, {
      totalPoints: (profile.totalPoints || 0) + delta,
      correct:     (profile.correct     || 0) + correctDelta,
      total:       (profile.total       || 0) + (correctDelta > 0 || delta > 0 ? 1 : 0),
    })
  },

  /**
   * Kullanıcının tüm tahminlerini kaydet
   */
  savePredictions(uid, predictions) {
    lsSet(LS_KEYS.USER_PREDS(uid), { ...predictions, _updatedAt: Date.now() })
  },

  /**
   * Tahminleri getir
   */
  getPredictions(uid) {
    const { _updatedAt: _, ...preds } = lsGet(LS_KEYS.USER_PREDS(uid), {})
    return preds
  },

  /**
   * Anlık soru cevaplarını kaydet
   */
  saveAnswers(uid, answers) {
    lsSet(LS_KEYS.USER_ANSWERS(uid), { ...answers, _updatedAt: Date.now() })
  },

  /**
   * Anlık soru cevaplarını getir
   */
  getAnswers(uid) {
    const { _updatedAt: _, ...answers } = lsGet(LS_KEYS.USER_ANSWERS(uid), {})
    return answers
  },

  /**
   * Kullanıcı verilerini LocalStorage'dan siler
   */
  deleteProfile(uid) {
    lsDel(LS_KEYS.USER_PROFILE(uid))
    lsDel(LS_KEYS.USER_PREDS(uid))
    lsDel(LS_KEYS.USER_ANSWERS(uid))

    // Kullanıcı listesinden çıkar
    const users = lsGet(LS_KEYS.USERS, {})
    if (users[uid]) {
      delete users[uid]
      lsSet(LS_KEYS.USERS, users)
    }

    // Ekstra kullanıcıya ait profile, predictions, answers ve calculate cache'leri temizle
    lsDel(`vg_predict_history_${uid}`)
    lsDel(`vg_calculated_matches_${uid}`)
    lsDel(`vg_resolved_questions_${uid}`)
  },
}
