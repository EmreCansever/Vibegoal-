import { useState, useEffect } from 'react'
import { authService } from '../services/dataService'
import { signInWithGoogle, signInWithApple, sendPasswordReset } from '../services/firebase'
import { getAuthErrorMessage } from '../utils/authErrors'
import { playSuccessSound, playErrorSound, playClickSound } from '../utils/audioEngine'

/* ─────────────────────────────────────────────────
   CYBERPUNK NEON GLOW STYLE INJECTION
   Injecting custom keyframes & utility classes
   specifically styled for the modern cyberpunk look.
───────────────────────────────────────────────── */
const AUTH_STYLE_ID = 'vg-auth-cyberpunk-styles'
function injectCyberpunkStyles() {
  if (document.getElementById(AUTH_STYLE_ID)) return
  const styleTag = document.createElement('style')
  styleTag.id = AUTH_STYLE_ID
  styleTag.textContent = `
    /* Cyberpunk floating keyframes for green aura */
    @keyframes drift-fog-1 {
      0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.25; }
      50% { transform: translate(60px, -80px) scale(1.3); opacity: 0.45; }
    }
    @keyframes drift-fog-2 {
      0%, 100% { transform: translate(0, 0) scale(1.2); opacity: 0.2; }
      50% { transform: translate(-80px, 60px) scale(0.9); opacity: 0.35; }
    }
    @keyframes spin-glow-ring {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    @keyframes glow-pulse {
      0%, 100% { box-shadow: 0 0 20px rgba(163, 230, 53, 0.2), 0 0 40px rgba(163, 230, 53, 0.1); }
      50% { box-shadow: 0 0 35px rgba(163, 230, 53, 0.45), 0 0 70px rgba(163, 230, 53, 0.2); }
    }
    @keyframes float-logo {
      0%, 100% { transform: translateY(0px) rotate(0deg); }
      50% { transform: translateY(-10px) rotate(4deg); }
    }
    @keyframes shake-container {
      0%, 100% { transform: translateX(0); }
      15%, 45%, 75% { transform: translateX(-8px); }
      30%, 60%, 90% { transform: translateX(8px); }
    }
    @keyframes text-shimmer {
      0% { background-position: -200% center; }
      100% { background-position: 200% center; }
    }

    /* Form control focus states */
    .cyber-input {
      outline: none;
      border: 1px solid rgba(255, 255, 255, 0.08) !important;
      background: rgba(255, 255, 255, 0.04) !important;
      transition: all 0.2s ease-in-out !important;
    }
    .cyber-input:focus {
      border-color: #a3e635 !important;
      background: rgba(163, 230, 53, 0.04) !important;
      box-shadow: 0 0 0 3px rgba(163, 230, 53, 0.16) !important;
    }
    .cyber-input::placeholder {
      color: rgba(255, 255, 255, 0.25) !important;
    }
    
    /* Buttons */
    .cyber-social-btn:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.05) !important;
      border-color: rgba(163, 230, 53, 0.45) !important;
      transform: translateY(-1px);
    }
    
    /* Custom Scrollbar for form just in case */
    .scroll-hide::-webkit-scrollbar { display: none; }
  `
  document.head.appendChild(styleTag)
}

/* ─────────────────────────────────────────────────
   SUBTLE AMBIENT BACKGROUND
───────────────────────────────────────────────── */
function NeonDriftingAura() {
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', zIndex: 0, pointerEvents: 'none' }}>
      {/* Top right soft glow */}
      <div style={{
        position: 'absolute', top: '-10%', right: '-10%',
        width: 500, height: 500, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(163, 230, 53, 0.08) 0%, transparent 70%)',
        filter: 'blur(60px)',
      }} />

      {/* Bottom left soft glow */}
      <div style={{
        position: 'absolute', bottom: '-15%', left: '-10%',
        width: 500, height: 500, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(132, 204, 22, 0.06) 0%, transparent 70%)',
        filter: 'blur(80px)',
      }} />
    </div>
  )
}

/* ─────────────────────────────────────────────────
   MAIN SCREEN COMPONENT
───────────────────────────────────────────────── */
export default function AuthScreen({ onAuth }) {
  useEffect(() => { injectCyberpunkStyles() }, [])

  const [mode, setMode]               = useState('login') // 'login' | 'register' | 'forgot'
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState('')
  const [successMsg, setSuccessMsg]   = useState('')
  const [shake, setShake]             = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [toast, setToast]             = useState(null) // { type, text }

  // Toast'u birkaç saniye sonra otomatik kapat
  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 5200)
    return () => clearTimeout(id)
  }, [toast])

  // Form Fields
  const [username, setUsername]       = useState('')
  const [email, setEmail]             = useState('')
  const [password, setPassword]       = useState('')

  // Clean error and toggle fields on mode switch
  const switchMode = (targetMode) => {
    playClickSound()
    setMode(targetMode)
    setError('')
    setSuccessMsg('')
    setUsername('')
    setEmail('')
    setPassword('')
  }

  const triggerError = (msg) => {
    setError(msg)
    playErrorSound()
    setShake(true)
    setTimeout(() => setShake(false), 550)
  }

  // Handle Password Reset Request
  const handleForgotSubmit = async (e) => {
    e.preventDefault()
    if (!email.trim()) {
      return triggerError('Lütfen e-posta adresinizi giriniz.')
    }
    setLoading(true)
    setError('')
    setSuccessMsg('')
    try {
      await sendPasswordReset(email)
      setMode('login')
      setToast({
        type: 'success',
        text: 'Şifre sıfırlama bağlantısı e-posta adresinize gönderildi. Gelen kutunuzu (ve spam klasörünü) kontrol edin.',
      })
    } catch (err) {
      console.error('Password reset error:', err)
      triggerError(getAuthErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  // Handle Log In
  const handleLoginSubmit = async (e) => {
    e.preventDefault()
    if (!email.trim() || !password.trim()) {
      return triggerError('Lütfen tüm zorunlu alanları doldurunuz.')
    }

    setLoading(true)
    try {
      const res = await authService.login({ email, password })
      if (res.success) {
        playSuccessSound()
        onAuth(res.user)
      } else {
        triggerError(getAuthErrorMessage(res.error))
      }
    } finally {
      setLoading(false)
    }
  }

  // Handle Registration
  const handleRegisterSubmit = async (e) => {
    e.preventDefault()
    if (!username.trim() || !email.trim() || !password.trim()) {
      return triggerError('Lütfen tüm zorunlu alanları doldurunuz.')
    }
    if (password.length < 6) {
      return triggerError('Şifre çok zayıf. Şifreniz en az 6 karakterden oluşmalıdır.')
    }

    setLoading(true)
    try {
      const res = await authService.register({ username, email, password })
      if (res.success) {
        playSuccessSound()
        onAuth(res.user)
      } else {
        triggerError(getAuthErrorMessage(res.error))
      }
    } finally {
      setLoading(false)
    }
  }

  // Handle Firebase Real Social Sign Ins (Google / Apple)
  const handleSocialSignIn = async (provider) => {
    setLoading(true)
    setError('')
    try {
      let firebaseUser
      if (provider === 'google') {
        firebaseUser = await signInWithGoogle()
      } else if (provider === 'apple') {
        firebaseUser = await signInWithApple()
      } else {
        throw new Error('Geçersiz giriş yöntemi.')
      }

      const res = await authService.socialLogin(firebaseUser)
      if (res.success) {
        playSuccessSound()
        onAuth(res.user)
      } else {
        triggerError(getAuthErrorMessage(res.error || 'Oturum açılamadı.'))
      }
    } catch (err) {
      console.error('Social login error:', err)
      triggerError(getAuthErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="vg-screen-fill vg-screen-standalone" style={{
      width: '100%',
      background: '#18181b',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px',
      position: 'relative',
      fontFamily: "'Inter', sans-serif",
      overflowY: 'auto',
      overflowX: 'hidden',
      boxSizing: 'border-box',
    }}>
      <NeonDriftingAura />

      {/* ── Şık Toast Bildirimi (şifre sıfırlama vb.) ── */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            top: 'calc(20px + env(safe-area-inset-top, 0px))',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 100000,
            maxWidth: 'calc(100vw - 32px)',
            width: 'max-content',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            padding: '13px 18px',
            borderRadius: 14,
            background: 'rgba(24, 24, 27, 0.94)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid rgba(163, 230, 53, 0.45)',
            boxShadow: '0 12px 32px rgba(0,0,0,0.5), 0 0 20px rgba(163, 230, 53, 0.22)',
            color: '#fafafa',
            fontSize: 13,
            fontWeight: 600,
            fontFamily: 'inherit',
            animation: 'vg-toast-in 0.35s cubic-bezier(0.22,0.61,0.36,1) both',
          }}
        >
          <span style={{ fontSize: 16, lineHeight: 1.3 }}>✅</span>
          <span style={{ textAlign: 'left', lineHeight: 1.45 }}>{toast.text}</span>
        </div>
      )}

      {/* Content wrapper */}
      <div style={{
        position: 'relative',
        zIndex: 1,
        width: '100%',
        maxWidth: 420,
      }}>

        {/* Logo / Header Area */}
        <div style={{ textAlign: 'center', marginBottom: 30 }}>
          <div style={{
            width: 76, height: 76, borderRadius: 22, margin: '0 auto 14px',
            background: 'linear-gradient(135deg, #a3e635, #84cc16)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 36,
            animation: 'float-logo 4s ease-in-out infinite',
            boxShadow: '0 10px 28px rgba(0,0,0,0.45), 0 4px 14px rgba(163, 230, 53, 0.28)',
          }}>⚽</div>
          
          <h1 style={{
            fontSize: 30, fontWeight: 800, color: '#f1f5f9',
            letterSpacing: '-0.8px', margin: 0, lineHeight: 1,
          }}>
            Vibe<span style={{ color: '#a3e635' }}>Goal</span>
          </h1>
          <p style={{
            fontSize: 10, color: 'rgba(255, 255, 255, 0.35)',
            letterSpacing: 3, textTransform: 'uppercase', marginTop: 6, fontWeight: 700,
          }}>
            Live Prediction Arena
          </p>
        </div>

        {/* Cyberpunk Glass Box */}
        <div style={{
          background: 'rgba(39, 39, 42, 0.82)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.07)',
          borderRadius: 20,
          padding: '28px 22px',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
          animation: shake ? 'shake-container 0.5s ease both' : 'none',
          position: 'relative',
        }}>
          

          {/* Form Tabs */}
          {mode !== 'forgot' && (
            <div style={{
              display: 'flex', gap: 4, padding: '4px',
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.05)',
              borderRadius: 14, marginBottom: 24,
            }}>
              {[
                { id: 'login',    label: 'Giriş Yap' },
                { id: 'register', label: 'Kayıt Ol' },
              ].map(tab => {
                const active = mode === tab.id
                return (
                  <button
                    key={tab.id}
                    onClick={() => switchMode(tab.id)}
                    style={{
                      flex: 1, padding: '10px 8px', borderRadius: 8, border: 'none',
                      background: active ? 'rgba(163, 230, 53, 0.12)' : 'transparent',
                      color: active ? '#bef264' : '#52525b',
                      fontWeight: 600, fontSize: 13,
                      fontFamily: 'inherit',
                      cursor: 'pointer', transition: 'all 0.18s ease',
                      boxShadow: active ? 'inset 0 0 0 1px rgba(163, 230, 53, 0.2)' : 'none',
                    }}
                  >{tab.label}</button>
                )
              })}
            </div>
          )}

          {/* Forgot Password Header */}
          {mode === 'forgot' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
              <button
                type="button"
                onClick={() => switchMode('login')}
                style={{
                  width: 34, height: 34, borderRadius: 10,
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#aaa', fontSize: 16, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background 0.28s ease',
                }}
              >←</button>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>Şifremi Unuttum</div>
                <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>Resmi şifre sıfırlama e-postası alacaksınız.</div>
              </div>
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div style={{
              padding: '12px 14px', borderRadius: 12,
              background: 'rgba(244, 63, 94, 0.08)',
              border: '1px solid rgba(244, 63, 94, 0.25)',
              color: '#f43f5e', fontSize: 13, fontWeight: 600,
              marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span>⚠️</span>
              <span style={{ textAlign: 'left' }}>{error}</span>
            </div>
          )}

          {/* Success Banner */}
          {successMsg && (
            <div style={{
              padding: '12px 14px', borderRadius: 12,
              background: 'rgba(163, 230, 53, 0.08)',
              border: '1px solid rgba(163, 230, 53, 0.25)',
              color: '#a3e635', fontSize: 13, fontWeight: 600,
              marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span>✅</span>
              <span style={{ textAlign: 'left' }}>{successMsg}</span>
            </div>
          )}

          {/* Form Content */}
          {mode === 'forgot' ? (
            <form key="form-forgot" className="vg-fade" onSubmit={handleForgotSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Email Field */}
              <div>
                <label style={{ display: 'block', fontSize: 10, color: 'rgba(255, 255, 255, 0.45)', fontWeight: 700, letterSpacing: 1.5, marginBottom: 8, textTransform: 'uppercase', textAlign: 'left' }}>
                  E-Posta Adresi
                </label>
                <input
                  id="forgot-email"
                  className="cyber-input"
                  type="email"
                  placeholder="ornek@vibe.com"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setError(''); setSuccessMsg('') }}
                  autoComplete="email"
                  style={{
                    width: '100%', padding: '14px 16px', borderRadius: 12,
                    color: '#fff', fontSize: 14, fontFamily: 'inherit',
                  }}
                />
              </div>

              {/* Submit Button */}
              <button
                id="forgot-submit"
                type="submit"
                disabled={loading}
                style={{
                  width: '100%', padding: '16px', borderRadius: 12,
                  background: '#a3e635',
                  border: 'none', color: '#18181b',
                  fontWeight: 800, fontSize: 14,
                  fontFamily: 'inherit',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.7 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  transition: 'all 0.2s ease',
                  marginTop: 6,
                }}
              >
                {loading ? (
                  <span style={{ animation: 'spin-slow 0.8s linear infinite', display: 'inline-block' }}>⚽</span>
                ) : (
                  <><span>✉️</span> Bağlantı Gönder</>
                )}
              </button>

              <button
                type="button"
                onClick={() => switchMode('login')}
                style={{
                  background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)',
                  fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                  marginTop: 10, textDecoration: 'underline'
                }}
              >
                Giriş Ekranına Dön
              </button>
            </form>
          ) : (
            <form key={`form-${mode}`} className="vg-fade" onSubmit={mode === 'login' ? handleLoginSubmit : handleRegisterSubmit}
                  style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Username Field (Register Only) */}
              {mode === 'register' && (
                <div>
                  <label style={{ display: 'block', fontSize: 10, color: 'rgba(255, 255, 255, 0.45)', fontWeight: 700, letterSpacing: 1.5, marginBottom: 8, textTransform: 'uppercase', textAlign: 'left' }}>
                    Kullanıcı Adı
                  </label>
                  <input
                    id="reg-username"
                    className="cyber-input"
                    type="text"
                    placeholder="SkorTahminci"
                    value={username}
                    onChange={e => { setUsername(e.target.value); setError('') }}
                    maxLength={20}
                    autoComplete="off"
                    style={{
                      width: '100%', padding: '14px 16px', borderRadius: 12,
                      color: '#fff', fontSize: 14, fontFamily: 'inherit',
                    }}
                  />
                </div>
              )}

              {/* Email Field */}
              <div>
                <label style={{ display: 'block', fontSize: 10, color: 'rgba(255, 255, 255, 0.45)', fontWeight: 700, letterSpacing: 1.5, marginBottom: 8, textTransform: 'uppercase', textAlign: 'left' }}>
                  E-Posta
                </label>
                <input
                  id={mode === 'login' ? 'login-email' : 'reg-email'}
                  className="cyber-input"
                  type="email"
                  placeholder="ornek@vibe.com"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setError('') }}
                  autoComplete="email"
                  style={{
                    width: '100%', padding: '14px 16px', borderRadius: 12,
                    color: '#fff', fontSize: 14, fontFamily: 'inherit',
                  }}
                />
              </div>

              {/* Password Field */}
              <div>
                <label style={{ display: 'block', fontSize: 10, color: 'rgba(255, 255, 255, 0.45)', fontWeight: 700, letterSpacing: 1.5, marginBottom: 8, textTransform: 'uppercase', textAlign: 'left' }}>
                  Şifre
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id={mode === 'login' ? 'login-password' : 'reg-password'}
                    className="cyber-input"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={e => { setPassword(e.target.value); setError('') }}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    style={{
                      width: '100%', padding: '14px 16px', borderRadius: 12,
                      color: '#fff', fontSize: 14, fontFamily: 'inherit',
                      paddingRight: 48,
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(p => !p)}
                    style={{
                      position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', color: 'rgba(255, 255, 255, 0.3)', cursor: 'pointer', fontSize: 16,
                    }}
                  >{showPassword ? '🙈' : '👁'}</button>
                </div>

                {/* Password strength bar indicator (Register only) */}
                {mode === 'register' && password.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                    {[1, 2, 3, 4].map(step => (
                      <div key={step} style={{
                        flex: 1, height: 3, borderRadius: 99,
                        background: password.length >= step * 2
                          ? (step <= 2 ? '#ff4d4d' : step === 3 ? '#ffaa00' : '#a3e635')
                          : 'rgba(255,255,255,0.06)',
                        transition: 'background 0.3s ease',
                      }} />
                    ))}
                  </div>
                )}
              </div>

              {/* Submit Button */}
              <button
                id={mode === 'login' ? 'login-submit' : 'register-submit'}
                type="submit"
                disabled={loading}
                style={{
                  width: '100%', padding: '14px', borderRadius: 10,
                  background: '#a3e635',
                  border: 'none', color: '#18181b',
                  fontWeight: 700, fontSize: 14,
                  fontFamily: 'inherit',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.7 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  transition: 'opacity 0.2s ease, filter 0.2s ease',
                  marginTop: 4,
                }}
              >
                {loading ? (
                  <span style={{ animation: 'spin-slow 0.8s linear infinite', display: 'inline-block' }}>⚽</span>
                ) : (
                  mode === 'login' ? 'Giriş Yap' : 'Hesap Oluştur'
                )}
              </button>

              {/* Forgot Password Link */}
              {mode === 'login' && (
                <div style={{ textAlign: 'center', marginTop: 10 }}>
                  <button
                    type="button"
                    onClick={() => switchMode('forgot')}
                    style={{
                      background: 'none', border: 'none', color: '#a3e635',
                      fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                      padding: 0,
                    }}
                  >
                    Şifremi Unuttum?
                  </button>
                </div>
              )}
            </form>
          )}

          {/* Social login elements (hidden in forgot password mode) */}
          {mode !== 'forgot' && (
            <>
              {/* Social login divider */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '22px 0' }}>
                <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.08))' }} />
                <span style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.25)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>veya</span>
                <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, rgba(255, 255, 255, 0.08), transparent)' }} />
              </div>

              {/* Social Sign-in grid */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Google */}
                <button
                  id="google-login"
                  className="cyber-social-btn"
                  onClick={() => handleSocialSignIn('google')}
                  disabled={loading}
                  style={{
                    width: '100%', padding: '14px 16px', borderRadius: 12,
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(63,63,70,0.8)',
                    color: '#fff', fontSize: 13, fontWeight: 700,
                    fontFamily: 'inherit',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', gap: 12,
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  Google ile Devam Et
                  <div style={{ marginLeft: 'auto', fontSize: 10, color: 'rgba(190, 242, 100, 0.6)', fontWeight: 700 }}>⚡</div>
                </button>

                {/* Apple */}
                <button
                  id="apple-login"
                  className="cyber-social-btn"
                  onClick={() => handleSocialSignIn('apple')}
                  disabled={loading}
                  style={{
                    width: '100%', padding: '14px 16px', borderRadius: 12,
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(63,63,70,0.8)',
                    color: '#fff', fontSize: 13, fontWeight: 700,
                    fontFamily: 'inherit',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', gap: 12,
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="white" style={{ flexShrink: 0 }}>
                    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                  </svg>
                  Apple ile Devam Et
                  <div style={{ marginLeft: 'auto', fontSize: 10, color: 'rgba(190, 242, 100, 0.6)', fontWeight: 700 }}>⚡</div>
                </button>
              </div>

              {/* Bottom Switch text link */}
              <div style={{ textAlign: 'center', marginTop: 20, fontSize: 12.5, color: 'rgba(255, 255, 255, 0.4)' }}>
                {mode === 'login' ? (
                  <>Henüz hesabın yok mu?{' '}
                    <button
                      type="button"
                      onClick={() => switchMode('register')}
                      style={{ background: 'none', border: 'none', color: '#bef264', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit' }}
                    >Kayıt Ol →</button>
                  </>
                ) : (
                  <>Zaten bir hesabın var mı?{' '}
                    <button
                      type="button"
                      onClick={() => switchMode('login')}
                      style={{ background: 'none', border: 'none', color: '#bef264', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit' }}
                    >Giriş Yap →</button>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer info text */}
        <div style={{ textAlign: 'center', marginTop: 24, fontSize: 11, color: 'rgba(255, 255, 255, 0.2)' }}>
          © 2026 VibeGoal · Tahmin Et, Yarış ve Grubu Sırtla ⚡
        </div>
      </div>
    </div>
  )
}
