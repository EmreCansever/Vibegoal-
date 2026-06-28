import { useState, useEffect } from 'react'
import { authService } from '../services/dataService'
import { signInWithGoogle, signInWithApple, sendPasswordReset } from '../services/firebase'
import { getAuthErrorMessage } from '../utils/authErrors'

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
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&display=swap');
    
    * { box-sizing: border-box; margin: 0; padding: 0; }
    
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
      0%, 100% { box-shadow: 0 0 20px rgba(0, 255, 136, 0.2), 0 0 40px rgba(0, 255, 136, 0.1); }
      50% { box-shadow: 0 0 35px rgba(0, 255, 136, 0.45), 0 0 70px rgba(0, 255, 136, 0.2); }
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
      transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1) !important;
    }
    .cyber-input:focus {
      border-color: #00ff88 !important;
      background: rgba(0, 255, 136, 0.03) !important;
      box-shadow: 0 0 20px rgba(0, 255, 136, 0.25), inset 0 0 8px rgba(0, 255, 136, 0.1) !important;
    }
    .cyber-input::placeholder {
      color: rgba(255, 255, 255, 0.25) !important;
    }
    
    /* Buttons */
    .cyber-social-btn {
      transition: all 0.25s cubic-bezier(0.25, 0.8, 0.25, 1);
    }
    .cyber-social-btn:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.08) !important;
      border-color: rgba(0, 255, 136, 0.4) !important;
      box-shadow: 0 0 15px rgba(0, 255, 136, 0.15);
      transform: translateY(-2px);
    }
    
    /* Custom Scrollbar for form just in case */
    .scroll-hide::-webkit-scrollbar { display: none; }
  `
  document.head.appendChild(styleTag)
}

/* ─────────────────────────────────────────────────
   CYBERPUNK NEON DRIFTING AURA EFFECT
───────────────────────────────────────────────── */
function NeonDriftingAura() {
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', zIndex: 0, pointerEvents: 'none' }}>
      {/* Glow Blob 1 (Top Right) */}
      <div style={{
        position: 'absolute', top: '-15%', right: '-10%',
        width: 550, height: 550, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(0, 255, 136, 0.14) 0%, transparent 70%)',
        filter: 'blur(80px)',
        animation: 'drift-fog-1 14s ease-in-out infinite',
      }} />

      {/* Glow Blob 2 (Bottom Left) */}
      <div style={{
        position: 'absolute', bottom: '-20%', left: '-15%',
        width: 600, height: 600, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(0, 204, 106, 0.12) 0%, transparent 70%)',
        filter: 'blur(90px)',
        animation: 'drift-fog-2 18s ease-in-out infinite',
      }} />

      {/* Soft Center Horizon Ambient */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 700, height: 400, borderRadius: '50%',
        background: 'radial-gradient(ellipse, rgba(0, 255, 136, 0.05) 0%, transparent 70%)',
        filter: 'blur(100px)',
      }} />

      {/* Grid Pattern overlay to give that cyberpunk look */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'linear-gradient(rgba(0, 255, 136, 0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 255, 136, 0.015) 1px, transparent 1px)',
        backgroundSize: '30px 30px',
        opacity: 0.7,
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

  // Form Fields
  const [username, setUsername]       = useState('')
  const [email, setEmail]             = useState('')
  const [password, setPassword]       = useState('')

  // Clean error and toggle fields on mode switch
  const switchMode = (targetMode) => {
    setMode(targetMode)
    setError('')
    setSuccessMsg('')
    setUsername('')
    setEmail('')
    setPassword('')
  }

  const triggerError = (msg) => {
    setError(msg)
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
      setSuccessMsg('Şifre sıfırlama bağlantısı e-posta adresinize gönderilmiştir.')
    } catch (err) {
      console.error('Password reset error:', err)
      triggerError(getAuthErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  // Handle Log In
  const handleLoginSubmit = (e) => {
    e.preventDefault()
    if (!email.trim() || !password.trim()) {
      return triggerError('Lütfen tüm zorunlu alanları doldurunuz.')
    }
    
    setLoading(true)
    setTimeout(() => {
      const res = authService.login({ email, password })
      setLoading(false)
      if (res.success) {
        onAuth(res.user)
      } else {
        triggerError(getAuthErrorMessage(res.error))
      }
    }, 700)
  }

  // Handle Registration
  const handleRegisterSubmit = (e) => {
    e.preventDefault()
    if (!username.trim() || !email.trim() || !password.trim()) {
      return triggerError('Lütfen tüm zorunlu alanları doldurunuz.')
    }
    if (password.length < 6) {
      return triggerError('Şifre çok zayıf. Şifreniz en az 6 karakterden oluşmalıdır.')
    }

    setLoading(true)
    setTimeout(() => {
      const res = authService.register({ username, email, password })
      setLoading(false)
      if (res.success) {
        onAuth(res.user)
      } else {
        triggerError(getAuthErrorMessage(res.error))
      }
    }, 850)
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

      const res = authService.socialLogin(firebaseUser)
      if (res.success) {
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
    <div style={{
      minHeight: '100vh',
      width: '100%',
      background: '#040406',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px',
      position: 'relative',
      fontFamily: "'Outfit', 'Inter', sans-serif",
      overflow: 'hidden',
    }}>
      <NeonDriftingAura />

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
            background: 'linear-gradient(135deg, #00ff88, #00b35e)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 36,
            animation: 'float-logo 4s ease-in-out infinite',
            boxShadow: '0 0 25px rgba(0, 255, 136, 0.4), 0 10px 30px rgba(0,0,0,0.5)',
          }}>⚽</div>
          
          <h1 style={{
            fontSize: 32, fontWeight: 900, color: '#fff',
            letterSpacing: '-1px', margin: 0, lineHeight: 1,
          }}>
            Vibe<span style={{
              background: 'linear-gradient(90deg, #00ff88, #00ffcc, #00ff88)',
              backgroundSize: '200% auto',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              animation: 'shimmer 2.5s linear infinite',
            }}>Goal</span>
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
          background: 'rgba(12, 12, 18, 0.45)',
          backdropFilter: 'blur(30px)',
          WebkitBackdropFilter: 'blur(30px)',
          border: '1px solid rgba(0, 255, 136, 0.22)',
          borderRadius: 24,
          padding: '30px 24px',
          boxShadow: '0 24px 80px rgba(0, 0, 0, 0.7), 0 0 40px rgba(0, 255, 136, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
          animation: shake ? 'shake-container 0.5s ease both' : 'none',
          position: 'relative',
        }}>
          
          {/* Neon accent corner cuts */}
          <div style={{ position: 'absolute', top: 0, left: 16, right: 16, height: 1, background: 'linear-gradient(90deg, transparent, rgba(0, 255, 136, 0.3), transparent)' }} />
          <div style={{ position: 'absolute', bottom: 0, left: 16, right: 16, height: 1, background: 'linear-gradient(90deg, transparent, rgba(0, 255, 136, 0.3), transparent)' }} />

          {/* Form Tabs */}
          {mode !== 'forgot' && (
            <div style={{
              display: 'flex', gap: 4, padding: '4px',
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.05)',
              borderRadius: 14, marginBottom: 24,
            }}>
              {[
                { id: 'login',    label: '🔑 Giriş Yap' },
                { id: 'register', label: '✨ Kayıt Ol' },
              ].map(tab => {
                const active = mode === tab.id
                return (
                  <button
                    key={tab.id}
                    onClick={() => switchMode(tab.id)}
                    style={{
                      flex: 1, padding: '12px 8px', borderRadius: 10, border: 'none',
                      background: active ? 'linear-gradient(135deg, rgba(0, 255, 136, 0.16), rgba(0, 255, 136, 0.08))' : 'transparent',
                      color: active ? '#00ff88' : '#777',
                      fontWeight: 700, fontSize: 13,
                      fontFamily: 'inherit',
                      cursor: 'pointer', transition: 'all 0.2s ease',
                      boxShadow: active ? 'inset 0 0 0 1px rgba(0, 255, 136, 0.2)' : 'none',
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
              background: 'rgba(0, 255, 136, 0.08)',
              border: '1px solid rgba(0, 255, 136, 0.25)',
              color: '#00ff88', fontSize: 13, fontWeight: 600,
              marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span>✅</span>
              <span style={{ textAlign: 'left' }}>{successMsg}</span>
            </div>
          )}

          {/* Form Content */}
          {mode === 'forgot' ? (
            <form onSubmit={handleForgotSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
                  background: 'linear-gradient(135deg, #00ff88, #00b35e)',
                  border: 'none', color: '#040406',
                  fontWeight: 800, fontSize: 14,
                  fontFamily: 'inherit',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.8 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  animation: 'glow-pulse 2.5s ease-in-out infinite',
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
            <form onSubmit={mode === 'login' ? handleLoginSubmit : handleRegisterSubmit}
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
                          ? (step <= 2 ? '#ff4d4d' : step === 3 ? '#ffaa00' : '#00ff88')
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
                  width: '100%', padding: '16px', borderRadius: 12,
                  background: 'linear-gradient(135deg, #00ff88, #00b35e)',
                  border: 'none', color: '#040406',
                  fontWeight: 800, fontSize: 14,
                  fontFamily: 'inherit',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.8 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  animation: 'glow-pulse 2.5s ease-in-out infinite',
                  transition: 'all 0.2s ease',
                  marginTop: 6,
                }}
                onMouseEnter={e => { if (!loading) e.currentTarget.style.transform = 'translateY(-1px) scale(1.01)' }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0) scale(1)' }}
              >
                {loading ? (
                  <span style={{ animation: 'spin-slow 0.8s linear infinite', display: 'inline-block' }}>⚽</span>
                ) : (
                  mode === 'login' ? <><span>🚀</span> Sahaya Gir</> : <><span>✨</span> Arena Hesabı Aç</>
                )}
              </button>

              {/* Forgot Password Link */}
              {mode === 'login' && (
                <div style={{ textAlign: 'center', marginTop: 10 }}>
                  <button
                    type="button"
                    onClick={() => switchMode('forgot')}
                    style={{
                      background: 'none', border: 'none', color: '#00ff88',
                      fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                      padding: 0, textDecoration: 'underline'
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
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.08)',
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
                  <span>Google ile Giriş Yap</span>
                  <div style={{ marginLeft: 'auto', fontSize: 9, color: 'rgba(0, 255, 136, 0.45)', fontWeight: 800, letterSpacing: 0.5 }}>⚡ Hızlı</div>
                </button>

                {/* Apple */}
                <button
                  id="apple-login"
                  className="cyber-social-btn"
                  onClick={() => handleSocialSignIn('apple')}
                  disabled={loading}
                  style={{
                    width: '100%', padding: '14px 16px', borderRadius: 12,
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: '#fff', fontSize: 13, fontWeight: 700,
                    fontFamily: 'inherit',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', gap: 12,
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="white" style={{ flexShrink: 0 }}>
                    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                  </svg>
                  <span>Apple ile Giriş Yap</span>
                  <div style={{ marginLeft: 'auto', fontSize: 9, color: 'rgba(0, 255, 136, 0.45)', fontWeight: 800, letterSpacing: 0.5 }}>⚡ Hızlı</div>
                </button>
              </div>

              {/* Bottom Switch text link */}
              <div style={{ textAlign: 'center', marginTop: 20, fontSize: 12.5, color: 'rgba(255, 255, 255, 0.4)' }}>
                {mode === 'login' ? (
                  <>Henüz hesabın yok mu?{' '}
                    <button
                      type="button"
                      onClick={() => switchMode('register')}
                      style={{ background: 'none', border: 'none', color: '#00ff88', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit' }}
                    >Kayıt Ol →</button>
                  </>
                ) : (
                  <>Zaten bir hesabın var mı?{' '}
                    <button
                      type="button"
                      onClick={() => switchMode('login')}
                      style={{ background: 'none', border: 'none', color: '#00ff88', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit' }}
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
