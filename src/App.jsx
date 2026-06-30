import { useState, useEffect, lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import AuthScreen from './components/AuthScreen'
import SplashScreen from './components/SplashScreen'
import { authService } from './services/dataService'

const Dashboard = lazy(() => import('./components/Dashboard'))
const RoomScreen = lazy(() => import('./components/RoomScreen'))
const MatchDetail = lazy(() => import('./components/MatchDetail'))

function RouteFallback() {
  return (
    <div style={{ minHeight: '100svh', background: '#18181b' }} aria-hidden="true" />
  )
}

/* ═══════════════════════════════════════════════════════════════
   2 TEMALİ MOTOR — Tüm inline-style'lar bu objeyi dinler.
   Tema anahtarı: 'slate' | 'carbon'
═══════════════════════════════════════════════════════════════ */
export const THEMES = {
  /**
   * Zinc — Varsayılan tema (Neon Yeşil / Antrasit)
   * Çok koyu asil antrasit zemin (zinc-900), kartlar zinc-800,
   * canlı neon-lime (#a3e635) aksan. Modern, flat, "şık" çizgi.
   */
  slate: {
    id:           'slate',
    label:        'Neon Yeşil',
    bg:           '#18181b',
    bgGrad:       'linear-gradient(165deg,#18181b 0%,#1c1c20 100%)',
    surface:      '#27272a',
    surfaceHover: '#3f3f46',
    accent:       '#a3e635',
    accentAlt:    '#84cc16',
    accentSoft:   'rgba(163,230,53,0.12)',
    accentBorder: 'rgba(163,230,53,0.30)',
    glow:         'rgba(163,230,53,0.28)',
    glowSoft:     'rgba(163,230,53,0.10)',
    neon:         'rgba(163,230,53,0.06)',
    text:         '#fafafa',
    textMuted:    '#a1a1aa',
    textFaint:    '#52525b',
    border:       'rgba(63,63,70,0.7)',
    borderStrong: 'rgba(82,82,91,0.8)',
    ticker:       'rgba(163,230,53,0.05)',
    tickerB:      'rgba(163,230,53,0.10)',
    liveBtn:      'linear-gradient(135deg,#ef4444,#dc2626)',
    duelGlow:     'rgba(239,68,68,0.22)',
    tabActive:    '#a3e635',
    tabActiveText:'#18181b',
    pulseAnim:    'none',
  },

  /**
   * Carbon — Neon Kırmızı tema
   * Çok koyu nötr zemin, canlı neon kırmızı (#ff3b47) aksan.
   * Agresif, "esports/gaming" enerjisi ama flat ve şık.
   */
  carbon: {
    id:           'carbon',
    label:        'Neon Kırmızı',
    bg:           '#171416',
    bgGrad:       'linear-gradient(165deg,#171416 0%,#1b1719 100%)',
    surface:      '#241e20',
    surfaceHover: '#2e2629',
    accent:       '#ff3b47',
    accentAlt:    '#e11d2e',
    accentSoft:   'rgba(255,59,71,0.12)',
    accentBorder: 'rgba(255,59,71,0.30)',
    glow:         'rgba(255,59,71,0.28)',
    glowSoft:     'rgba(255,59,71,0.10)',
    neon:         'rgba(255,59,71,0.06)',
    text:         '#faf1f2',
    textMuted:    '#a89ca0',
    textFaint:    '#564b4e',
    border:       'rgba(68,60,63,0.7)',
    borderStrong: 'rgba(92,80,84,0.8)',
    ticker:       'rgba(255,59,71,0.05)',
    tickerB:      'rgba(255,59,71,0.10)',
    liveBtn:      'linear-gradient(135deg,#ff3b47,#e11d2e)',
    duelGlow:     'rgba(255,59,71,0.24)',
    tabActive:    '#ff3b47',
    tabActiveText:'#ffffff',
    pulseAnim:    'none',
  },

  /**
   * Gray — Profesyonel Gri tema
   * Antrasit zemin, mat asil gri-beyaz (gümüş) aksan, neon yok.
   * Sade, kurumsal, "premium SaaS" çizgisi.
   */
  gray: {
    id:           'gray',
    label:        'Gri',
    bg:           '#161618',
    bgGrad:       'linear-gradient(165deg,#161618 0%,#1a1a1d 100%)',
    surface:      '#242427',
    surfaceHover: '#2e2e32',
    accent:       '#d4d4d8',
    accentAlt:    '#a1a1aa',
    accentSoft:   'rgba(212,212,216,0.10)',
    accentBorder: 'rgba(212,212,216,0.24)',
    glow:         'rgba(212,212,216,0.14)',
    glowSoft:     'rgba(212,212,216,0.06)',
    neon:         'rgba(212,212,216,0.04)',
    text:         '#fafafa',
    textMuted:    '#9ca0a8',
    textFaint:    '#52525b',
    border:       'rgba(63,63,70,0.7)',
    borderStrong: 'rgba(82,82,91,0.8)',
    ticker:       'rgba(212,212,216,0.04)',
    tickerB:      'rgba(212,212,216,0.08)',
    liveBtn:      'linear-gradient(135deg,#ef4444,#dc2626)',
    duelGlow:     'rgba(239,68,68,0.20)',
    tabActive:    '#d4d4d8',
    tabActiveText:'#18181b',
    pulseAnim:    'none',
  },
}

/** rgba(...) son opaklık değerini tema-bağımsız değiştirir */
export function withGlowOpacity(glowSoft, opacity) {
  if (!glowSoft || typeof glowSoft !== 'string') return glowSoft
  return glowSoft.replace(/,\s*[\d.]+\s*\)$/, `, ${opacity})`)
}

/* Tema değerini localStorage'a yaz/oku */
function loadTheme() {
  try { return localStorage.getItem('vg_theme') || 'slate' } catch { return 'slate' }
}
function saveTheme(id) {
  try { localStorage.setItem('vg_theme', id) } catch { /* ignore */ }
}

/*
  Uygulama içi basit navigator.
  screen: 'auth' | 'dashboard' | 'rooms'
  params: ekrana geçirilen ekstra veriler
*/
export default function App() {
  // Lazily fetch the current user synchronously to prevent visual flickering on refresh
  const [currentUser, setCurrentUser] = useState(() => authService.getCurrentUser())
  const [params, setParams]           = useState({})
  const [themeId, setThemeId]         = useState(loadTheme)
  // Karşılama ekranı: yalnızca uygulama ilk açıldığında bir kez gösterilir
  const [showSplash, setShowSplash] = useState(() => {
    try { return sessionStorage.getItem('vg_splash_done') !== '1' } catch { return true }
  })

  const navigateHook = useNavigate()
  const location = useLocation()
  const theme = THEMES[themeId] || THEMES.slate

  // Global tema değişkenleri: her rotada (Dashboard mount olmasa da) güncel kalsın.
  // Bileşenlerdeki color-mix(var(--vg-accent) ...) kullanımları buna bağlı.
  useEffect(() => {
    const r = document.documentElement
    r.style.setProperty('--vg-accent', theme.accent)
    r.style.setProperty('--vg-accent-alt', theme.accentAlt)
    r.style.setProperty('--vg-glow', theme.glow)
    r.style.setProperty('--vg-glow-soft', theme.glowSoft)
    r.style.setProperty('--vg-bg', theme.bg)
    r.style.setProperty('--vg-surface', theme.surface)
    r.style.setProperty('--vg-tab-text', theme.tabActiveText)
    document.body.style.background = theme.bg
  }, [theme.id])

  useEffect(() => {
    let unsub = () => {}
    authService.initSessionListener((user) => {
      setCurrentUser(user)
    }).then((fn) => {
      unsub = typeof fn === 'function' ? fn : () => {}
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    const runCleanup = () => {
    // Database Cleanup: Purge any remnants of mock/test users from localStorage
    try {
      const users = JSON.parse(localStorage.getItem('vg_users') || '{}')
      const updatedUsers = {}
      let changed = false
      const fakes = ['test', 'cyber', 'analyst', 'appleuser', 'googleuser', 'şans', 'uid_178', 'vibegoal', 'demo', 'demouser', 'tematest']

      Object.keys(users).forEach(uid => {
        const u = users[uid]
        const usernameLower = (u.username || '').toLowerCase()
        const emailLower = (u.email || '').toLowerCase()
        const uidLower = uid.toLowerCase()

        const isFake = fakes.some(fake => 
          usernameLower.includes(fake) || 
          emailLower.includes(fake) || 
          uidLower.includes(fake)
        )

        if (isFake) {
          localStorage.removeItem(`vg_profile_${uid}`)
          localStorage.removeItem(`vg_predictions_${uid}`)
          localStorage.removeItem(`vg_answers_${uid}`)
          localStorage.removeItem(`vg_predict_history_${uid}`)
          localStorage.removeItem(`vg_calculated_matches_${uid}`)
          localStorage.removeItem(`vg_resolved_questions_${uid}`)
          changed = true
        } else {
          updatedUsers[uid] = u
        }
      })

      if (changed) {
        localStorage.setItem('vg_users', JSON.stringify(updatedUsers))
      }

      // If currently logged-in user is a fake/test user, force log out
      const activeUser = localStorage.getItem('vg_current_user')
      if (activeUser) {
        const parsed = JSON.parse(activeUser)
        const usernameLower = (parsed.username || '').toLowerCase()
        const emailLower = (parsed.email || '').toLowerCase()
        const uidLower = (parsed.uid || '').toLowerCase()
        
        const currentIsFake = fakes.some(fake => 
          usernameLower.includes(fake) || 
          emailLower.includes(fake) || 
          uidLower.includes(fake)
        )
        
        if (currentIsFake) {
          localStorage.removeItem('vg_current_user')
          setCurrentUser(null)
          navigateHook('/auth')
        }
      }

      // Clean up fake/test/vibegoal rooms from localStorage
      const filterRooms = (rooms) => {
        if (!Array.isArray(rooms)) return []
        return rooms.filter(r => {
          const nameLower = (r.name || '').toLowerCase()
          const idLower = (r.id || '').toLowerCase()
          return !nameLower.includes('elaz') && 
                 !nameLower.includes('test') && 
                 !nameLower.includes('deneme') &&
                 !nameLower.includes('sahte') &&
                 !nameLower.includes('fake') &&
                 !nameLower.includes('vibegoal') &&
                 !idLower.includes('elaz') &&
                 !idLower.includes('test') &&
                 !idLower.includes('deneme') &&
                 !idLower.includes('sahte') &&
                 !idLower.includes('fake') &&
                 !idLower.includes('vibegoal')
        })
      }

      const publicRooms = localStorage.getItem('vg_public_rooms')
      if (publicRooms) {
        localStorage.setItem('vg_public_rooms', JSON.stringify(filterRooms(JSON.parse(publicRooms))))
      }

      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('vg_my_rooms_')) {
          const saved = localStorage.getItem(key)
          if (saved) {
            localStorage.setItem(key, JSON.stringify(filterRooms(JSON.parse(saved))))
          }
        }
      })
    } catch (e) {
      console.error('Startup cleanup failed:', e)
    }

    // Geliştirici İpucu: Testleri kolaylaştırmak ve sıfır kilometreye dönmek için konsoldan çağrılabilir:
    window.resetApp = () => {
      localStorage.clear()
      window.location.reload()
    }
    }
    const id = setTimeout(runCleanup, 0)
    return () => clearTimeout(id)
  }, [])

  function navigate(to, extraParams = {}) {
    const activeUser = authService.getCurrentUser()
    // Authentication Wall: redirect to auth screen if trying to access protected views without credentials
    if (!activeUser && to !== 'auth') {
      setParams({})
      navigateHook('/auth')
      return
    }
    setParams(extraParams)
    if (to === 'dashboard') {
      navigateHook('/dashboard')
    } else if (to === 'rooms') {
      navigateHook('/rooms')
    } else if (to === 'auth') {
      navigateHook('/auth')
    } else if (to.startsWith('match/')) {
      const matchId = to.split('/')[1]
      navigateHook(`/match/${matchId}`)
    } else {
      navigateHook(`/${to}`)
    }
  }

  function handleAuth(user) {
    setCurrentUser(user)
    navigateHook('/dashboard')
  }

  async function handleLogout() {
    await authService.logout()
    setCurrentUser(null)
    navigateHook('/auth')
  }

  function cycleTheme() {
    const ids = Object.keys(THEMES)
    const next = ids[(ids.indexOf(themeId) + 1) % ids.length]
    setThemeId(next)
    saveTheme(next)
  }

  // Rota başına geçiş animasyonu için "kök segment"i anahtar olarak kullan.
  // (/match/123 → /match/456 gibi geçişlerde gereksiz remount yaşanmasın diye
  //  yalnızca üst segmente göre yeniden tetiklenir.)
  const routeKey = location.pathname.split('/')[1] || 'root'

  return (
    <>
    {showSplash && (
      <SplashScreen onFinish={() => {
        try { sessionStorage.setItem('vg_splash_done', '1') } catch { /* ignore */ }
        setShowSplash(false)
      }} />
    )}
    <div className="vg-route" key={routeKey}>
    <Suspense fallback={<RouteFallback />}>
    <Routes location={location}>
      <Route path="/auth" element={
        currentUser ? <Navigate to="/dashboard" replace /> : <AuthScreen onAuth={handleAuth} />
      } />
      <Route path="/dashboard" element={
        currentUser ? (
          <Dashboard
            onNavigate={navigate}
            params={params}
            theme={theme}
            onCycleTheme={cycleTheme}
            currentUser={currentUser}
            onLogout={handleLogout}
          />
        ) : (
          <Navigate to="/auth" replace />
        )
      } />
      <Route path="/rooms" element={
        currentUser ? (
          <RoomScreen
            onNavigate={navigate}
            params={params}
            theme={theme}
            onCycleTheme={cycleTheme}
            currentUser={currentUser}
          />
        ) : (
          <Navigate to="/auth" replace />
        )
      } />
      <Route path="/match/:id" element={
        currentUser ? (
          <MatchDetail
            theme={theme}
          />
        ) : (
          <Navigate to="/auth" replace />
        )
      } />
      <Route path="*" element={<Navigate to={currentUser ? "/dashboard" : "/auth"} replace />} />
    </Routes>
    </Suspense>
    </div>
    </>
  )
}
