import { useState, useEffect } from 'react'
import Dashboard from './components/Dashboard'
import RoomScreen from './components/RoomScreen'
import AuthScreen from './components/AuthScreen'
import { authService } from './services/dataService'

/* ═══════════════════════════════════════════════════════════════
   3 TEMALİ MOTOR — Tüm inline-style'lar bu objeyi dinler.
   Tema anahtarı: 'night' | 'hell' | 'retro'
═══════════════════════════════════════════════════════════════ */
export const THEMES = {
  night: {
    id:        'night',
    label:     '🌙 Derin Gece',
    bg:        '#121212',
    bgGrad:    'linear-gradient(135deg,#0a0a0f 0%,#0d1a12 50%,#0a0a0f 100%)',
    accent:    '#00ff88',
    accentAlt: '#00cc6a',
    glow:      'rgba(0,255,136,0.35)',
    glowSoft:  'rgba(0,255,136,0.12)',
    neon:      'rgba(0,255,136,0.08)',
    ticker:    'rgba(0,255,136,0.06)',
    tickerB:   'rgba(0,255,136,0.12)',
    liveBtn:   'linear-gradient(135deg,#ff1a1a,#cc0000)',
    duelGlow:  'rgba(255,0,51,0.35)',
    surface:   'rgba(255,255,255,0.04)',
    border:    'rgba(255,255,255,0.09)',
    tabActive: '#00ff88',
    tabActiveText: '#121212',
    pulseAnim: 'pulse-glow',
  },
  hell: {
    id:        'hell',
    label:     '🔥 Cehennem Odası',
    bg:        '#110808',
    bgGrad:    'linear-gradient(135deg,#110808 0%,#1a0808 50%,#0e0505 100%)',
    accent:    '#ff3300',
    accentAlt: '#cc2200',
    glow:      'rgba(255,51,0,0.45)',
    glowSoft:  'rgba(255,51,0,0.15)',
    neon:      'rgba(255,51,0,0.08)',
    ticker:    'rgba(255,80,0,0.06)',
    tickerB:   'rgba(255,80,0,0.14)',
    liveBtn:   'linear-gradient(135deg,#ff6600,#cc3300)',
    duelGlow:  'rgba(255,80,0,0.45)',
    surface:   'rgba(255,80,0,0.04)',
    border:    'rgba(255,80,0,0.12)',
    tabActive: '#ff3300',
    tabActiveText: '#fff',
    pulseAnim: 'pulse-red',
  },
  retro: {
    id:        'retro',
    label:     '🕹️ Retro Tribün',
    bg:        '#0a080f',
    bgGrad:    'linear-gradient(135deg,#0a080f 0%,#12081e 50%,#080a14 100%)',
    accent:    '#c084fc',
    accentAlt: '#a855f7',
    glow:      'rgba(192,132,252,0.4)',
    glowSoft:  'rgba(192,132,252,0.15)',
    neon:      'rgba(192,132,252,0.08)',
    ticker:    'rgba(96,165,250,0.06)',
    tickerB:   'rgba(96,165,250,0.14)',
    liveBtn:   'linear-gradient(135deg,#6d28d9,#4c1d95)',
    duelGlow:  'rgba(192,132,252,0.4)',
    surface:   'rgba(192,132,252,0.04)',
    border:    'rgba(192,132,252,0.12)',
    tabActive: '#c084fc',
    tabActiveText: '#0a080f',
    pulseAnim: 'pulse-purple',
  },
}

/** rgba(...) son opaklık değerini tema-bağımsız değiştirir */
export function withGlowOpacity(glowSoft, opacity) {
  if (!glowSoft || typeof glowSoft !== 'string') return glowSoft
  return glowSoft.replace(/,\s*[\d.]+\s*\)$/, `, ${opacity})`)
}

/* Tema değerini localStorage'a yaz/oku */
function loadTheme() {
  try { return localStorage.getItem('vg_theme') || 'night' } catch { return 'night' }
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
  const [screen, setScreen]           = useState(() => {
    const user = authService.getCurrentUser()
    return user ? 'dashboard' : 'auth'
  })
  const [params, setParams]           = useState({})
  const [themeId, setThemeId]         = useState(loadTheme)

  const theme = THEMES[themeId] || THEMES.night

  useEffect(() => {
    // Database Cleanup: Purge any remnants of mock/test users from localStorage
    try {
      const users = JSON.parse(localStorage.getItem('vg_users') || '{}')
      const updatedUsers = {}
      let changed = false
      const fakes = ['test', 'cyber', 'analyst', 'appleuser', 'googleuser', 'şans', 'uid_178', 'vibegoal']

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
          setScreen('auth')
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
  }, [])

  function navigate(to, extraParams = {}) {
    const activeUser = authService.getCurrentUser()
    // Authentication Wall: redirect to auth screen if trying to access protected views without credentials
    if (!activeUser && to !== 'auth') {
      setParams({})
      setScreen('auth')
      return
    }
    setParams(extraParams)
    setScreen(to)
  }

  function handleAuth(user) {
    setCurrentUser(user)
    setScreen('dashboard')
  }

  function handleLogout() {
    authService.logout()
    setCurrentUser(null)
    setScreen('auth')
  }

  function cycleTheme() {
    const ids = Object.keys(THEMES)
    const next = ids[(ids.indexOf(themeId) + 1) % ids.length]
    setThemeId(next)
    saveTheme(next)
  }

  // If there's no authenticated session, strictly lock the viewport to the AuthScreen
  if (!currentUser || screen === 'auth') {
    return <AuthScreen onAuth={handleAuth} />
  }

  // Room Screen
  if (screen === 'rooms') {
    return (
      <RoomScreen
        onNavigate={navigate}
        params={params}
        theme={theme}
        onCycleTheme={cycleTheme}
        currentUser={currentUser}
      />
    )
  }

  // Main Dashboard
  return (
    <Dashboard
      onNavigate={navigate}
      params={params}
      theme={theme}
      onCycleTheme={cycleTheme}
      currentUser={currentUser}
      onLogout={handleLogout}
    />
  )
}
