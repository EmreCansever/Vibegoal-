import { useState, useEffect, useCallback, useRef } from 'react'
import { THEMES, withGlowOpacity } from '../App'
import GroupChat from './GroupChat'
import {
  calculateMatchPoints,
  calculateQuestionPoints,
  getParticipationPoints,
  computeDynamicBadge,
  sortLeaderboard,
  getPointTierMeta,
  POINTS,
} from '../utils/scoringEngine'
import {
  fetchMatches,
  fetchLiveMatches,
  fetchWeeklyFixtures,
  LEAGUE_IDS,
  CURRENT_SEASON,
} from '../services/footballApi'
import { dbService } from '../services/dataService'

const PREDICT_HISTORY_KEY = (uid) => `vg_predict_history_${uid}`

function getPredictHistory(uid) {
  try {
    const data = localStorage.getItem(PREDICT_HISTORY_KEY(uid))
    return data ? JSON.parse(data) : []
  } catch (e) {
    return []
  }
}

function addPredictHistoryEntry(uid, entry) {
  try {
    let history = getPredictHistory(uid)
    history = history.filter(item => item.id !== entry.id)
    history.push({
      ...entry,
      timestamp: Date.now()
    })
    history = history.slice(-25)
    localStorage.setItem(PREDICT_HISTORY_KEY(uid), JSON.stringify(history))
  } catch (e) {}
}

function updatePredictHistoryStatus(uid, id, status, outcomeText) {
  try {
    let history = getPredictHistory(uid)
    history = history.map(item => {
      if (item.id === id) {
        return {
          ...item,
          status,
          outcomeText
        }
      }
      return item
    })
    localStorage.setItem(PREDICT_HISTORY_KEY(uid), JSON.stringify(history))
  } catch (e) {}
}


/* ─────────────────────────────────────────────────
   MOCK DATA
───────────────────────────────────────────────── */
const LEAGUES = [
  { id: 'wc2026', apiId: 1,   label: '🌍 Dünya Kupası 2026' },
  { id: 'ucl',    apiId: 2,   label: '⭐ Şampiyonlar Ligi' },
  { id: 'sl',     apiId: 203, label: '🇹🇷 Süper Lig' },
  { id: 'pl',     apiId: 39,  label: '🏴󠁧󠁢󠁥󠁮󠁧󠁿 Premier Lig' },
  { id: 'laliga', apiId: 140, label: '🇪🇸 La Liga' },
  { id: 'seriea', apiId: 135, label: '🇮🇹 Serie A' },
  { id: 'bundesliga', apiId: 78, label: '🇩🇪 Bundesliga' },
]

// Local question definitions persistence helpers to keep locked question text stable/frozen
function getLockedQuestionDefinitions(uid) {
  try {
    const data = localStorage.getItem(`vg_locked_questions_def_${uid}`)
    return data ? JSON.parse(data) : {}
  } catch {
    return {}
  }
}

function saveLockedQuestionDefinition(uid, question) {
  try {
    const current = getLockedQuestionDefinitions(uid)
    current[question.id] = question
    localStorage.setItem(`vg_locked_questions_def_${uid}`, JSON.stringify(current))
  } catch {}
}

function generateDynamicQuestions(liveMatches, uid) {
  const generated = []
  const lockedDefs = getLockedQuestionDefinitions(uid)

  liveMatches.forEach(match => {
    // Sadece henüz tamamlanmamış (FT dışındaki) canlı maçlar için soru üretilir
    if (match.status === 'FT') return

    const q1Id = `${match.id}_next_goal`
    const q2Id = `${match.id}_ends_at_score`
    const q3Id = `${match.id}_half_or_full_time`

    // Q1: Sıradaki Golü Kim Atar?
    if (lockedDefs[q1Id]) {
      generated.push(lockedDefs[q1Id])
    } else {
      generated.push({
        id: q1Id,
        matchId: match.id,
        text: `⚽ Sıradaki Gol: ${match.home} - ${match.away} maçında sıradaki golü kim atar?`,
        options: [
          { label: `🏠 ${match.home}`, value: 'home', reward: 15, points: '+15 Puan' },
          { label: `✈️ ${match.away}`, value: 'away', reward: 15, points: '+15 Puan' },
          { label: '🧱 Gol Olmaz', value: 'none', reward: 25, points: '+25 Puan' },
        ],
        deadline: 10,
        type: 'next_goal',
        savedScore: { home: match.homeScore, away: match.awayScore },
        savedMinute: match.minute
      })
    }

    // Q2: Maç bu skorla mı biter?
    if (lockedDefs[q2Id]) {
      generated.push(lockedDefs[q2Id])
    } else {
      generated.push({
        id: q2Id,
        matchId: match.id,
        text: `📊 Skor Korunur mu: Maçın şu anki skoru ${match.homeScore}-${match.awayScore}. Maç bu skorla mı biter?`,
        options: [
          { label: '✅ Evet (Skor değişmez)', value: 'yes', reward: 15, points: '+15 Puan' },
          { label: '💥 Hayır (En az 1 gol daha olur)', value: 'no', reward: 15, points: '+15 Puan' },
        ],
        deadline: 7,
        type: 'ends_at_score',
        savedScore: { home: match.homeScore, away: match.awayScore },
        savedMinute: match.minute
      })
    }

    // Q3: İlk yarı/Maç sonu skoru ne olur?
    if (lockedDefs[q3Id]) {
      generated.push(lockedDefs[q3Id])
    } else {
      const isFirstHalf = match.minute <= 45
      generated.push({
        id: q3Id,
        matchId: match.id,
        text: `⏱️ Skor Tahmini: Şu an dakika ${match.minute}. ${isFirstHalf ? 'İlk yarı' : 'Maç sonu'} skoru ne olur?`,
        options: [
          { label: `🏠 ${match.home} ${isFirstHalf ? 'Öne Geçer' : 'Kazanır'}`, value: 'home', reward: 20, points: '+20 Puan' },
          { label: `✈️ ${match.away} ${isFirstHalf ? 'Öne Geçer' : 'Kazanır'}`, value: 'away', reward: 20, points: '+20 Puan' },
          { label: '🤝 Beraberlik', value: 'draw', reward: 15, points: '+15 Puan' },
        ],
        deadline: 5,
        type: 'half_or_full_time',
        savedScore: { home: match.homeScore, away: match.awayScore },
        savedMinute: match.minute
      })
    }
  })

  return generated
}

function resolveDynamicCorrectAnswer(relatedQ, finishedMatch) {
  const { type, savedScore, savedMinute } = relatedQ
  const finalHome = Number(finishedMatch.homeScore)
  const finalAway = Number(finishedMatch.awayScore)

  if (type === 'next_goal') {
    const savedH = Number(savedScore.home)
    const savedA = Number(savedScore.away)

    if (finalHome === savedH && finalAway === savedA) {
      return 'none'
    }
    const deltaH = finalHome - savedH
    const deltaA = finalAway - savedA

    if (deltaH > deltaA) {
      return 'home'
    } else if (deltaA > deltaH) {
      return 'away'
    } else {
      return 'home'
    }
  }

  if (type === 'ends_at_score') {
    const savedH = Number(savedScore.home)
    const savedA = Number(savedScore.away)

    if (finalHome === savedH && finalAway === savedA) {
      return 'yes'
    } else {
      return 'no'
    }
  }

  if (type === 'half_or_full_time') {
    if (savedMinute <= 45) {
      const htHome = finishedMatch.halftimeScore?.home !== null && finishedMatch.halftimeScore?.home !== undefined
        ? Number(finishedMatch.halftimeScore.home)
        : finalHome
      const htAway = finishedMatch.halftimeScore?.away !== null && finishedMatch.halftimeScore?.away !== undefined
        ? Number(finishedMatch.halftimeScore.away)
        : finalAway

      if (htHome > htAway) return 'home'
      if (htAway > htHome) return 'away'
      return 'draw'
    } else {
      if (finalHome > finalAway) return 'home'
      if (finalAway > finalHome) return 'away'
      return 'draw'
    }
  }

  return 'none'
}

const BADGES = {
  suru:    { icon: '🐑', label: 'Sürü Psikolojisi Kurbanı', color: '#a78bfa' },
  hayal:   { icon: '🎈', label: 'Hayalperest Balon',         color: '#fb923c' },
  prof:    { icon: '📚', label: 'Futbol Profesörü',           color: '#34d399' },
  şanslı:  { icon: '🍀', label: 'Şanslı Dört Yaprak',        color: '#facc15' },
  kahraman:{ icon: '⚡', label: 'Son Dakika Kahramanı',       color: '#f43f5e' },
}

const LEADERBOARD_INIT = []

/* ─────────────────────────────────────────────────
   DYNAMIC LEADERBOARD LOADER
───────────────────────────────────────────────── */
function getDynamicLeaderboard(currentUserId) {
  try {
    const users = JSON.parse(localStorage.getItem('vg_users') || '{}')
    const leaderboardList = []
    
    Object.values(users).forEach(u => {
      const profileKey = `vg_profile_${u.uid}`
      const profileVal = localStorage.getItem(profileKey)
      let profile = profileVal ? JSON.parse(profileVal) : null
      
      if (!profile) {
        profile = {
          uid: u.uid,
          username: u.username,
          totalPoints: 0,
          correct: 0,
          total: 0,
          badge: '',
          avatar: u.avatar || '😎',
        }
      }
      
      leaderboardList.push({
        id: u.uid,
        name: u.username,
        points: profile.totalPoints || 0,
        correct: profile.correct || 0,
        total: profile.total || 0,
        badge: profile.badge || '',
        avatar: profile.avatar || u.avatar || '😎',
        isMe: u.uid === currentUserId
      })
    })
    
    // Sort leaderboard list
    const sorted = leaderboardList.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points
      return b.correct - a.correct
    })
    
    return sorted.map((p, i) => ({ ...p, rank: i + 1 }))
  } catch (e) {
    return []
  }
}

/* ─────────────────────────────────────────────────
   KEYFRAME INJECTION  (runs once)
───────────────────────────────────────────────── */
const STYLE_TAG_ID = 'vg-keyframes'
const STYLE_VAR_ID = 'vg-theme-vars'

/* CSS değişkenlerini gerçek zamanlı güncelle — tema değişiminde çağrılır */
export function updateThemeCSSVars(t) {
  let el = document.getElementById(STYLE_VAR_ID)
  if (!el) {
    el = document.createElement('style')
    el.id = STYLE_VAR_ID
    document.head.appendChild(el)
  }
  el.textContent = `:root {
    --vg-accent:      ${t.accent};
    --vg-accent-alt:  ${t.accentAlt};
    --vg-glow:        ${t.glow};
    --vg-glow-soft:   ${t.glowSoft};
    --vg-bg:          ${t.bg};
    --vg-tab-text:    ${t.tabActiveText};
  }`
}

function injectKeyframes() {
  if (document.getElementById(STYLE_TAG_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_TAG_ID
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #121212; font-family: 'Inter', sans-serif; overflow-x: hidden; }

    @keyframes pulse-purple {
      0%, 100% { box-shadow: 0 0 12px #c084fc44, 0 0 24px #c084fc22; }
      50%       { box-shadow: 0 0 20px #c084fc88, 0 0 40px #c084fc44; }
    }
    @keyframes firework-pop {
      0%   { transform: scale(0) rotate(0deg); opacity: 1; }
      80%  { transform: scale(1.2) rotate(360deg); opacity: 1; }
      100% { transform: scale(1) rotate(360deg); opacity: 0; }
    }
    @keyframes confetti-fall {
      0%   { transform: translateY(-20px) rotate(0deg); opacity: 1; }
      100% { transform: translateY(120px) rotate(720deg); opacity: 0; }
    }
    @keyframes trophy-bounce {
      0%, 100% { transform: scale(1) translateY(0); }
      30%       { transform: scale(1.3) translateY(-10px); }
      60%       { transform: scale(0.95) translateY(0); }
    }
    @keyframes debt-shake {
      0%,100% { transform: translateX(0) rotate(0); }
      20%      { transform: translateX(-6px) rotate(-3deg); }
      40%      { transform: translateX(6px) rotate(3deg); }
      60%      { transform: translateX(-4px) rotate(-2deg); }
      80%      { transform: translateX(4px) rotate(2deg); }
    }
    @keyframes pulse-glow {
      0%, 100% { box-shadow: 0 0 12px #00ff8844, 0 0 24px #00ff8822; }
      50%       { box-shadow: 0 0 20px #00ff8888, 0 0 40px #00ff8844; }
    }
    @keyframes pulse-red {
      0%, 100% { box-shadow: 0 0 12px #ff003344, 0 0 24px #ff003322; }
      50%       { box-shadow: 0 0 20px #ff003388, 0 0 40px #ff003344; }
    }
    @keyframes live-dot {
      0%, 100% { opacity: 1; transform: scale(1); }
      50%       { opacity: 0.4; transform: scale(1.4); }
    }
    @keyframes slide-in {
      from { opacity: 0; transform: translateY(16px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes badge-pop {
      0%   { transform: scale(0.8); opacity: 0; }
      70%  { transform: scale(1.1); }
      100% { transform: scale(1);   opacity: 1; }
    }
    @keyframes ticker {
      0%   { transform: translateX(0); }
      100% { transform: translateX(-50%); }
    }
    @keyframes shimmer {
      0%   { background-position: -200% center; }
      100% { background-position:  200% center; }
    }
    @keyframes skeleton-wave {
      0%   { background-position: -400px 0; }
      100% { background-position:  400px 0; }
    }
    .skeleton-card {
      background: linear-gradient(
        90deg,
        rgba(255,255,255,0.04) 25%,
        rgba(255,255,255,0.09) 50%,
        rgba(255,255,255,0.04) 75%
      );
      background-size: 400px 100%;
      animation: skeleton-wave 1.4s ease-in-out infinite;
      border-radius: 16px;
    }
    @keyframes float {
      0%, 100% { transform: translateY(0px); }
      50%       { transform: translateY(-6px); }
    }
    @keyframes countdown-pulse {
      0%, 100% { color: #ff4444; }
      50%       { color: #ff8888; }
    }
    @keyframes pop-in {
      0%   { opacity: 0; transform: translateY(60px) scale(0.94); }
      65%  { transform: translateY(-6px) scale(1.02); }
      100% { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes pop-out {
      from { opacity: 1; transform: translateY(0) scale(1); }
      to   { opacity: 0; transform: translateY(40px) scale(0.95); }
    }
    @keyframes modal-in {
      from { opacity: 0; transform: translateY(40px) scale(0.96); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes overlay-in {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
    @keyframes spin-slow {
      from { transform: rotate(0deg); }
      to   { transform: rotate(360deg); }
    }
    /* Tema-aware CSS class'ları — CSS değişkenlerini okur */
    .live-card:hover { transform: translateY(-3px) scale(1.02) !important; }
    .q-option:hover  { background: color-mix(in srgb, var(--vg-accent) 18%, transparent) !important; border-color: var(--vg-accent) !important; transform: scale(1.03); }
    .q-option.selected { background: color-mix(in srgb, var(--vg-accent) 25%, transparent) !important; border-color: var(--vg-accent) !important; }
    .q-option.red-option:hover { background: rgba(255,68,68,0.18) !important; border-color: #ff4444 !important; }
    .copy-btn:hover  { background: color-mix(in srgb, var(--vg-accent) 25%, transparent) !important; transform: scale(1.04); }
    .duel-btn:hover  { transform: scale(1.04); filter: brightness(1.15); }
    .tab-btn:hover   { background: rgba(255,255,255,0.08) !important; }
    .tab-btn.active  { background: var(--vg-accent) !important; color: var(--vg-tab-text) !important; }
    .scroll-hide::-webkit-scrollbar { display: none; }
    .leader-row:hover { background: rgba(255,255,255,0.05) !important; }
    .main-tab-btn.active { background: var(--vg-accent) !important; color: var(--vg-tab-text) !important; }
  `
  document.head.appendChild(style)
}

/* ─────────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────────── */
function Countdown({ seconds }) {
  const [left, setLeft] = useState(seconds * 60)
  useEffect(() => {
    const t = setInterval(() => setLeft(p => Math.max(0, p - 1)), 1000)
    return () => clearInterval(t)
  }, [])
  const m = String(Math.floor(left / 60)).padStart(2, '0')
  const s = String(left % 60).padStart(2, '0')
  return (
    <span style={{ fontWeight: 800, fontSize: 13, animation: left < 60 ? 'countdown-pulse 1s infinite' : 'none', color: left < 60 ? '#ff4444' : '#facc15' }}>
      ⏱ {m}:{s}
    </span>
  )
}

function LiveDot() {
  return (
    <span style={{
      width: 8, height: 8, borderRadius: '50%',
      background: '#ff4444', display: 'inline-block',
      animation: 'live-dot 1.2s ease-in-out infinite',
      flexShrink: 0,
    }} />
  )
}

/* ─────────────────────────────────────────────────
   SKELETON LOADING CARD
───────────────────────────────────────────────── */
function MatchSkeletonCard() {
  return (
    <div style={{
      minWidth: 200, flexShrink: 0,
      borderRadius: 16, overflow: 'hidden',
      border: '1px solid rgba(255,255,255,0.06)',
      boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
    }}>
      <div className="skeleton-card" style={{
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        padding: '14px 16px',
      }}>
        {/* Live badge placeholder */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, alignItems: 'center' }}>
          <div style={{ width: 8,  height: 8,  borderRadius: '50%',  background: 'rgba(255,68,68,0.25)' }} />
          <div style={{ width: 32, height: 8,  borderRadius: 4, background: 'rgba(255,255,255,0.06)' }} />
          <div style={{ width: 20, height: 8,  borderRadius: 4, background: 'rgba(255,255,255,0.04)', marginLeft: 'auto' }} />
        </div>
        {/* Teams + score row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />
            <div style={{ width: 56, height: 8,  borderRadius: 4, background: 'rgba(255,255,255,0.05)' }} />
          </div>
          <div style={{
            width: 56, height: 38, borderRadius: 10,
            background: 'rgba(0,255,136,0.06)',
            border: '1px solid rgba(0,255,136,0.1)',
          }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />
            <div style={{ width: 56, height: 8,  borderRadius: 4, background: 'rgba(255,255,255,0.05)' }} />
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────
   SUB-COMPONENTS
───────────────────────────────────────────────── */

function Header({ league, setLeague, totalPoints, onNavigate, theme, onCycleTheme, currentUser, onLogout, hideLeagues, onLogoClick }) {
  const current = LEAGUES.find(l => l.id === league)
  const t = theme || THEMES.night

  return (
    <header style={{
      padding: '20px 20px 0',
      position: 'sticky', top: 0, zIndex: 100,
      background: `linear-gradient(180deg,${t.bg} 70%,transparent)`,
    }}>
      {/* Top row */}
      <div style={{ display: 'flex', alignItems: 'center', justifycontent: 'space-between', marginBottom: 18, gap: 8 }}>
        {/* Logo */}
        <div 
          onClick={onLogoClick}
          style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, cursor: 'pointer' }}
        >
          <div style={{
            width: 40, height: 40, borderRadius: 12, flexShrink: 0,
            background: `linear-gradient(135deg,${t.accent},${t.accentAlt})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, animation: 'float 3s ease-in-out infinite',
            boxShadow: `0 0 20px ${t.glowSoft}`,
          }}>⚽</div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: '-0.5px', color: '#fff' }}>
              Vibe<span style={{ color: t.accent }}>Goal</span>
            </div>
            <div style={{ fontSize: 10, color: '#555', letterSpacing: 2, textTransform: 'uppercase' }}>Live Prediction Arena</div>
          </div>
        </div>

        {/* Theme switcher icon */}
        <button
          id="theme-switcher"
          onClick={onCycleTheme}
          title={`Tema: ${t.label}`}
          style={{
            flexShrink: 0,
            width: 38, height: 38, borderRadius: 11,
            background: t.glowSoft,
            border: `1px solid ${t.accent}55`,
            color: t.accent, fontSize: 16,
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.2s ease',
            animation: `${t.pulseAnim} 3s ease-in-out infinite`,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = withGlowOpacity(t.glowSoft, 0.22); e.currentTarget.style.transform = 'scale(1.1) rotate(30deg)' }}
          onMouseLeave={e => { e.currentTarget.style.background = t.glowSoft; e.currentTarget.style.transform = 'scale(1) rotate(0deg)' }}
        >
          {t.id === 'night' ? '🌙' : t.id === 'hell' ? '🔥' : '🕹️'}
        </button>

        {/* Logout Button */}
        <button
          onClick={onLogout}
          title="Çıkış Yap"
          style={{
            flexShrink: 0,
            width: 38, height: 38, borderRadius: 11,
            background: 'rgba(244, 63, 94, 0.1)',
            border: '1px solid rgba(244, 63, 94, 0.35)',
            color: '#f43f5e', fontSize: 16,
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(244, 63, 94, 0.18)'; e.currentTarget.style.transform = 'scale(1.1)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(244, 63, 94, 0.1)'; e.currentTarget.style.transform = 'scale(1)' }}
        >
          🚪
        </button>

        {/* Rooms nav button */}
        <button
          onClick={() => onNavigate && onNavigate('rooms')}
          title="Oda Yönetimi"
          style={{
            flexShrink: 0,
            padding: '9px 14px', borderRadius: 12,
            background: 'rgba(255,255,255,0.07)',
            border: '1px solid rgba(255,255,255,0.12)',
            color: '#e5e7eb', fontSize: 12, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'Inter,sans-serif',
            transition: 'all 0.2s ease',
            display: 'flex', alignItems: 'center', gap: 6,
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = `${t.glowSoft}`; e.currentTarget.style.borderColor = `${t.accent}55`; e.currentTarget.style.color = t.accent }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; e.currentTarget.style.color = '#e5e7eb' }}
        >
          <span style={{ fontSize: 16 }}>🏠</span> Odalar
        </button>

        {/* Points badge */}
        <div style={{
          flexShrink: 0,
          padding: '8px 14px', borderRadius: 50,
          background: t.glowSoft,
          border: `1px solid ${t.accent}66`,
          animation: `${t.pulseAnim} 2.5s ease-in-out infinite`,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 16 }}>🏆</span>
          <div>
            <div style={{
              fontSize: 18, fontWeight: 900, color: t.accent,
              backgroundImage: `linear-gradient(90deg,${t.accent},${t.accentAlt},${t.accent})`,
              backgroundSize: '200% auto',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              animation: 'shimmer 2s linear infinite',
            }}>{totalPoints.toLocaleString()}</div>
            <div style={{ fontSize: 9, color: '#666', letterSpacing: 1 }}>TOPLAM PUAN</div>
          </div>
        </div>
      </div>

      {/* League tabs */}
      {!hideLeagues && (
        <div style={{ overflowX: 'auto', whiteSpace: 'nowrap', paddingBottom: 4 }} className="scroll-hide">
          <div style={{ display: 'inline-flex', gap: 8 }}>
            {LEAGUES.map(l => (
              <button
                key={l.id}
                className={`tab-btn${league === l.id ? ' active' : ''}`}
                onClick={() => setLeague(l.id)}
                style={{
                  padding: '8px 16px', borderRadius: 50, border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: 600, fontFamily: 'Inter,sans-serif',
                  background: league === l.id ? t.accent : 'rgba(255,255,255,0.06)',
                  color: league === l.id ? t.tabActiveText : '#aaa',
                  transition: 'all 0.2s ease', whiteSpace: 'nowrap',
                }}
              >{l.label}</button>
            ))}
          </div>
        </div>
      )}

      {/* Divider */}
      <div style={{ height: 1, background: 'linear-gradient(90deg,transparent,#333,transparent)', margin: '14px 0 0' }} />
    </header>
  )
}

function LiveMatchCard({ match, prediction, theme }) {
  const t = theme || THEMES.night
  return (
    <div className="live-card" style={{
      background: 'linear-gradient(135deg,rgba(30,30,40,0.95),rgba(20,20,30,0.95))',
      border: `1px solid ${t.border}`,
      borderRadius: 16,
      padding: '14px 16px',
      minWidth: 200,
      flexShrink: 0,
      cursor: 'pointer',
      transition: 'transform 0.25s ease, box-shadow 0.25s ease',
      boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
      position: 'relative',
      overflow: 'hidden',
      animation: 'slide-in 0.4s ease both',
    }}>
      {/* glow accent */}
      <div style={{
        position: 'absolute', top: -30, right: -30,
        width: 80, height: 80, borderRadius: '50%',
        background: `radial-gradient(circle,${t.glowSoft},transparent)`,
        pointerEvents: 'none',
      }} />

      {/* Live indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <LiveDot />
        <span style={{ fontSize: 10, color: '#ff4444', fontWeight: 700, letterSpacing: 1 }}>CANLI</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#facc15', fontWeight: 700 }}>
          {match.minute}'
        </span>
      </div>

      {/* Teams */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ fontSize: 24, marginBottom: 2 }}>{match.homeFlag}</div>
          <div style={{ fontSize: 11, color: '#ccc', fontWeight: 600, lineHeight: 1.2 }}>{match.home}</div>
        </div>

        <div style={{
          padding: '6px 14px', borderRadius: 10,
          background: t.neon,
          border: `1px solid ${t.accent}44`,
          textAlign: 'center',
          boxShadow: `0 0 16px ${t.glowSoft}`,
        }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', lineHeight: 1 }}>
            {match.homeScore} <span style={{ color: '#444', fontSize: 16 }}>:</span> {match.awayScore}
          </div>
        </div>

        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ fontSize: 24, marginBottom: 2 }}>{match.awayFlag}</div>
          <div style={{ fontSize: 11, color: '#ccc', fontWeight: 600, lineHeight: 1.2 }}>{match.away}</div>
        </div>
      </div>

      {/* User Prediction Badge */}
      {prediction && (
        <div style={{
          marginTop: 12,
          textAlign: 'center',
          fontSize: 10,
          fontWeight: 700,
          color: t.accent,
          background: withGlowOpacity(t.glowSoft, 0.15),
          border: `1px solid ${t.accent}40`,
          borderRadius: 8,
          padding: '4px 8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
        }}>
          <span>🎯</span> Tahminin: {prediction.homeScore} - {prediction.awayScore}
        </div>
      )}
    </div>
  )
}

function LiveFeed({ matches, predictions = {}, loading, error, onRetry, theme, onMatchClick }) {
  const t = theme || THEMES.night
  /* ── Loading: 3 skeleton kart göster ─── */
  if (loading) {
    return (
      <section style={{ padding: '20px 20px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <LiveDot />
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>Maçlar Yükleniyor...</span>
          <span style={{
            marginLeft: 6, padding: '2px 10px', borderRadius: 50,
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: '#666', fontSize: 10, fontWeight: 800,
          }}>⏳ API</span>
        </div>
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 6 }} className="scroll-hide">
          {[1, 2, 3].map(i => <MatchSkeletonCard key={i} />)}
        </div>
      </section>
    )
  }

  /* ── Hata durumu ─── */
  if (error) {
    return (
      <section style={{ padding: '20px 20px 0' }}>
        <div style={{
          padding: '20px 18px', borderRadius: 16,
          background: 'rgba(244,63,94,0.08)',
          border: '1px solid rgba(244,63,94,0.2)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
          animation: 'slide-in 0.3s ease both',
        }}>
          <div style={{ fontSize: 28 }}>⚠️</div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: '#f43f5e', fontWeight: 700, fontSize: 14 }}>API Bağlantı Hatası</div>
            <div style={{ color: '#666', fontSize: 11, marginTop: 4 }}>{error}</div>
          </div>
          <button
            onClick={onRetry}
            style={{
              padding: '8px 20px', borderRadius: 10,
              background: 'rgba(244,63,94,0.15)',
              border: '1px solid rgba(244,63,94,0.35)',
              color: '#f43f5e', fontSize: 12, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'Inter,sans-serif',
            }}
          >🔄 Tekrar Dene</button>
        </div>
      </section>
    )
  }

  /* ── Normal durum ─── */
  return (
    <section style={{ padding: '20px 20px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <LiveDot />
        <span style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>Canlı Maçlar</span>
        <span style={{
          marginLeft: 6, padding: '2px 10px', borderRadius: 50,
          background: '#ff4444', color: '#fff', fontSize: 10, fontWeight: 800,
        }}>{matches.length} MAÇ</span>
      </div>
      {matches.length === 0 ? (
        <div style={{
          padding: '30px 20px', borderRadius: 20, textAlign: 'center',
          background: 'rgba(255,255,255,0.02)',
          border: `1px solid ${t.accent}26`,
          backdropFilter: 'blur(10px)',
          animation: 'slide-in 0.35s ease both',
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🏟️</div>
          <div style={{ color: '#fff', fontSize: 14, fontWeight: 700, lineHeight: 1.5 }}>
            Bu ligde şu anda canlı maç bulunmuyor bra.
          </div>
          <div style={{ color: '#888', fontSize: 12, marginTop: 6 }}>
            Diğer ligleri kontrol et veya yeni maçların başlamasını bekle!
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 6 }} className="scroll-hide">
          {matches.map(m => (
            <div key={m.id} onClick={() => onMatchClick && onMatchClick(m)} style={{ flexShrink: 0 }}>
              <LiveMatchCard match={m} prediction={predictions[m.id]} theme={t} />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function QuestionPanel({ questions, answers, setAnswers, theme }) {
  const t = theme || THEMES.night
  const [activeIdx, setActiveIdx] = useState(0)
  const q = questions[activeIdx]

  function pick(qid, val) {
    setAnswers(prev => ({ ...prev, [qid]: val }))
  }

  return (
    <section style={{ padding: '24px 20px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>⚡</span>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>Anlık Sorular</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {questions.map((_, i) => (
            <button
              key={i}
              onClick={() => setActiveIdx(i)}
              style={{
                width: 8, height: 8, borderRadius: '50%', border: 'none', cursor: 'pointer',
                background: i === activeIdx ? t.accent : '#333',
                transition: 'background 0.2s',
                padding: 0,
              }}
            />
          ))}
        </div>
      </div>

      {q && (
        <div style={{
          background: `linear-gradient(135deg,${t.neon},rgba(0,0,0,0.4))`,
          border: `1px solid ${t.accent}33`,
          borderRadius: 20,
          padding: '20px 18px',
          animation: 'slide-in 0.35s ease both',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* corner accent */}
          <div style={{
            position: 'absolute', bottom: -40, right: -40,
            width: 100, height: 100, borderRadius: '50%',
            background: `radial-gradient(circle,${t.neon},transparent)`,
            pointerEvents: 'none',
          }} />

          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
            <p style={{ color: '#e5e7eb', fontSize: 14, fontWeight: 600, lineHeight: 1.5 }}>{q.text}</p>
            <Countdown seconds={q.deadline} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {q.options.map(opt => {
              const selected = answers[q.id] === opt.value
              return (
                <button
                  key={opt.value}
                  className={`q-option${selected ? ' selected' : ''}`}
                  onClick={() => pick(q.id, opt.value)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 16px', borderRadius: 12,
                    border: `1px solid ${selected ? t.accent : 'rgba(255,255,255,0.1)'}`,
                    background: selected ? `${t.accent}26` : 'rgba(255,255,255,0.04)',
                    cursor: 'pointer', color: '#fff',
                    fontFamily: 'Inter,sans-serif',
                    fontWeight: 600, fontSize: 13,
                    transition: 'all 0.2s ease',
                  }}
                >
                  <span>{opt.label}</span>
                  <span style={{
                    padding: '3px 10px', borderRadius: 50,
                    background: selected ? `${t.accent}4d` : 'rgba(255,255,255,0.08)',
                    fontSize: 11, color: selected ? t.accent : '#aaa',
                    fontWeight: 700,
                  }}>{opt.points}</span>
                </button>
              )
            })}
          </div>

          {/* nav arrows */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
            <button
              onClick={() => setActiveIdx(i => Math.max(0, i - 1))}
              disabled={activeIdx === 0}
              style={{
                background: 'none', border: '1px solid #333', borderRadius: 8,
                color: activeIdx === 0 ? '#444' : '#aaa', padding: '6px 14px',
                cursor: activeIdx === 0 ? 'default' : 'pointer',
                fontFamily: 'Inter,sans-serif', fontSize: 12,
              }}
            >← Önceki</button>
            <button
              onClick={() => setActiveIdx(i => Math.min(questions.length - 1, i + 1))}
              disabled={activeIdx === questions.length - 1}
              style={{
                background: 'none', border: '1px solid #333', borderRadius: 8,
                color: activeIdx === questions.length - 1 ? '#444' : '#aaa', padding: '6px 14px',
                cursor: activeIdx === questions.length - 1 ? 'default' : 'pointer',
                fontFamily: 'Inter,sans-serif', fontSize: 12,
              }}
            >Sonraki →</button>
          </div>
        </div>
      )}
    </section>
  )
}

function BadgeChip({ badge }) {
  const b = BADGES[badge]
  if (!b) return null
  return (
    <div
      title={b.label}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '3px 10px', borderRadius: 50,
        background: `${b.color}18`,
        border: `1px solid ${b.color}44`,
        fontSize: 11, color: b.color, fontWeight: 700,
        animation: 'badge-pop 0.4s ease both',
        whiteSpace: 'nowrap',
        cursor: 'default',
      }}
    >
      <span>{b.icon}</span>
      <span style={{ maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 10 }}>{b.label}</span>
    </div>
  )
}



function BottomActions({ copied, setCopied, onDuel, theme }) {
  const t = theme || THEMES.night
  const [duelPulse, setDuelPulse] = useState(false)

  function shareRoom(roomId = 'elazig-tayfa-abc123') {
    const link = `https://tahminator.app/join/${roomId}`
    navigator.clipboard.writeText(link).catch(() => {
      // Fallback: execCommand
      try {
        const ta = document.createElement('textarea')
        ta.value = link
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.focus(); ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      } catch (_) {}
    })
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleDuel() {
    setDuelPulse(true)
    setTimeout(() => setDuelPulse(false), 600)
    onDuel && onDuel()
  }

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      padding: '16px 20px',
      background: `linear-gradient(0deg,${t.bg} 60%,transparent)`,
      display: 'flex', gap: 12, zIndex: 200,
      maxWidth: 600, margin: '0 auto',
    }}>
      {/* Copy link */}
      <button
        className="copy-btn"
        onClick={() => shareRoom()}
        style={{
          flex: 1, padding: '15px 20px', borderRadius: 16,
          background: copied
            ? `linear-gradient(135deg,${t.accent}40,${t.accentAlt}33)`
            : 'rgba(255,255,255,0.07)',
          border: `1px solid ${copied ? t.accent : 'rgba(255,255,255,0.12)'}`,
          color: copied ? t.accent : '#e5e7eb',
          fontFamily: 'Inter,sans-serif',
          fontWeight: 700, fontSize: 13,
          cursor: 'pointer', transition: 'all 0.25s ease',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          boxShadow: copied ? `0 0 20px ${t.glow}, 0 0 40px ${t.glowSoft}` : 'none',
        }}
      >
        <span style={{ fontSize: 18 }}>{copied ? '✅' : '🔗'}</span>
        <span style={{
          backgroundImage: copied
            ? `linear-gradient(90deg,${t.accent},${t.accentAlt},${t.accent})`
            : 'none',
          backgroundSize: '200% auto',
          WebkitBackgroundClip: copied ? 'text' : undefined,
          WebkitTextFillColor: copied ? 'transparent' : undefined,
          animation: copied ? 'shimmer 1.5s linear infinite' : 'none',
        }}>
          {copied ? 'Link Kopyalandı! 🚀' : 'Grup Linki Kopyala'}
        </span>
      </button>

      {/* Duel */}
      <button
        className="duel-btn"
        onClick={handleDuel}
        style={{
          flex: 1, padding: '15px 20px', borderRadius: 16,
          background: duelPulse
            ? 'linear-gradient(135deg,#ff6666,#ff0033)'
            : t.liveBtn,
          border: `1px solid ${t.duelGlow}`,
          color: '#fff',
          fontFamily: 'Inter,sans-serif',
          fontWeight: 800, fontSize: 13,
          cursor: 'pointer', transition: 'all 0.25s ease',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          animation: 'pulse-red 2.5s ease-in-out infinite',
          boxShadow: `0 4px 24px ${t.duelGlow}`,
        }}
      >
        <span style={{ fontSize: 18 }}>⚔️</span>
        Birebir Düello Başlat
      </button>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   DUEL SCREEN — BİREBİR DÜELLO MODU
   Aşaması:  setup → confirmed → result
═══════════════════════════════════════════════════════════════ */

const DUEL_MATCHES = [
  { id: 'dm1', label: 'Galatasaray vs Fenerbahçe', league: '🇹🇷 Süper Lig' },
  { id: 'dm2', label: 'Real Madrid vs Man City',    league: '⭐ Şampiyonlar Ligi' },
  { id: 'dm3', label: 'Türkiye vs Brezilya',       league: '🌍 Dünya Kupası 2026' },
  { id: 'dm4', label: 'Arsenal vs Liverpool',       league: '🏴󠁧󠁢󠁥󠁮󠁧󠁿 Premier Lig' },
  { id: 'dm5', label: 'Real Madrid vs Barcelona',   league: '🇪🇸 La Liga' },
  { id: 'dm6', label: 'Juventus vs AC Milan',       league: '🇮🇹 Serie A' },
  { id: 'dm7', label: 'Bayern Münih vs Dortmund',   league: '🇩🇪 Bundesliga' },
]

function DuelScreen({ onClose, leaderboard = [], totalPoints = 1320, onWin, theme }) {
  const [phase, setPhase]         = useState('setup')   // setup | confirmed | result
  const [opponent, setOpponent]   = useState(null)
  const [penalty, setPenalty]     = useState('')
  const [matchId, setMatchId]     = useState('dm1')
  const [confirming, setConfirming] = useState(false)
  const [winnerIsMe, setWinnerIsMe] = useState(null)
  const [duelStatus, setDuelStatus] = useState('waiting') // 'waiting' | 'live' | 'done'
  const duelTimerRef = useRef(null)
  const t = theme || THEMES.night

  const opponents = leaderboard.filter(p => !p.isMe)

  function handleConfirm() {
    if (!opponent || !penalty.trim()) return
    setConfirming(true)
    setTimeout(() => {
      setConfirming(false)
      setPhase('confirmed')
      setDuelStatus('waiting')
      // Simüle: 3sn sonra maç canlı olsun
      setTimeout(() => setDuelStatus('live'), 3000)
    }, 900)
  }

  // Maç 'live' olduktan 5sn sonra otomatik FT → sonuç
  useEffect(() => {
    if (duelStatus !== 'live') return
    duelTimerRef.current = setTimeout(() => {
      const winner = Math.random() > 0.4
      setWinnerIsMe(winner)
      setDuelStatus('done')
      setPhase('result')
      if (winner && onWin) onWin()
    }, 5000)
    return () => clearTimeout(duelTimerRef.current)
  }, [duelStatus])

  const selectedMatch = DUEL_MATCHES.find(m => m.id === matchId)
  const opp           = opponents.find(o => o.id === opponent)

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 400,
          background: 'rgba(0,0,0,0.82)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          animation: 'overlay-in 0.2s ease both',
        }}
      />

      {/* Panel */}
      <div style={{
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: 600,
        zIndex: 401,
        background: 'linear-gradient(180deg,#1a0a1e,#120812)',
        borderRadius: '28px 28px 0 0',
        border: '1px solid rgba(255,30,30,0.25)',
        borderBottom: 'none',
        padding: '0 0 40px',
        animation: 'modal-in 0.35s cubic-bezier(.22,.61,.36,1) both',
        boxShadow: '0 -20px 80px rgba(255,0,51,0.2)',
        maxHeight: '92vh',
        overflowY: 'auto',
      }}>
        {/* Handle */}
        <div style={{ width: 40, height: 4, borderRadius: 99, background: 'rgba(255,80,80,0.3)', margin: '16px auto 0' }} />

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 22px 16px',
          borderBottom: '1px solid rgba(255,30,30,0.15)',
        }}>
          <div>
            <div style={{
              fontSize: 20, fontWeight: 900, color: '#fff',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{ animation: 'float 2s ease-in-out infinite', display: 'inline-block' }}>⚔️</span>
              {phase === 'result'
                ? (winnerIsMe ? '🏆 DÜELLO KAZANILDI!' : '😤 Düello Kaybedildi')
                : 'Birebir Düello Başlat'
              }
            </div>
            <div style={{ fontSize: 11, color: '#666', marginTop: 3 }}>
              {phase === 'setup' && 'Rakibini seç, iddiayı koy, düelloyu başlat!'}
              {phase === 'confirmed' && 'Düello onaylandı — maç bekleniyor...'}
              {phase === 'result' && (winnerIsMe ? 'Tebrikler, istatistiklerin daha iyiydi!' : 'Rakibini bu sefer yenemeding.')}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 34, height: 34, borderRadius: 10,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#888', fontSize: 16, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >✕</button>
        </div>

        <div style={{ padding: '20px 22px 0' }}>

          {/* ══════ PHASE: SETUP ══════ */}
          {phase === 'setup' && (
            <>
              {/* Rakip Seçimi */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, color: '#888', fontWeight: 700, letterSpacing: 1, marginBottom: 12 }}>
                  RAKİBİNİ SEÇ
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {opponents.map(op => {
                    const sel = opponent === op.id
                    return (
                      <div
                        key={op.id}
                        onClick={() => setOpponent(op.id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 14,
                          padding: '12px 16px', borderRadius: 14,
                          background: sel ? 'rgba(255,30,30,0.12)' : 'rgba(255,255,255,0.04)',
                          border: `1px solid ${sel ? 'rgba(255,60,60,0.5)' : 'rgba(255,255,255,0.08)'}`,
                          cursor: 'pointer', transition: 'all 0.2s ease',
                          boxShadow: sel ? '0 0 16px rgba(255,30,30,0.2)' : 'none',
                          animation: 'slide-in 0.3s ease both',
                        }}
                      >
                        <div style={{
                          width: 40, height: 40, borderRadius: 12,
                          background: sel ? 'rgba(255,30,30,0.18)' : 'rgba(255,255,255,0.06)',
                          border: `1.5px solid ${sel ? 'rgba(255,60,60,0.4)' : 'rgba(255,255,255,0.1)'}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 20, flexShrink: 0,
                          overflow: 'hidden',
                        }}>
                          {op.avatar && op.avatar.startsWith('http') ? (
                            <img src={op.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.target.src = '😎' }} />
                          ) : (
                            op.avatar
                          )}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: 13, color: sel ? '#ff6666' : '#e5e7eb' }}>
                            {op.name}
                          </div>
                          <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>
                            {op.badge} · {op.points.toLocaleString()} puan
                          </div>
                        </div>
                        {sel && (
                          <div style={{
                            width: 22, height: 22, borderRadius: '50%',
                            background: '#ff3333',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 12, color: '#fff',
                          }}>⚔</div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Kader Maçı Seçimi */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, color: '#888', fontWeight: 700, letterSpacing: 1, marginBottom: 10 }}>
                  KADER MAÇI
                </div>
                <div style={{ position: 'relative' }}>
                  <select
                    value={matchId}
                    onChange={e => setMatchId(e.target.value)}
                    style={{
                      width: '100%', padding: '13px 40px 13px 16px', borderRadius: 14,
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,60,60,0.25)',
                      color: '#fff', fontSize: 13, fontFamily: 'Inter,sans-serif',
                      appearance: 'none', WebkitAppearance: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    {DUEL_MATCHES.map(m => (
                      <option key={m.id} value={m.id} style={{ background: '#1a0a1e' }}>
                        {m.league} · {m.label}
                      </option>
                    ))}
                  </select>
                  <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: '#ff4444', fontSize: 12, pointerEvents: 'none' }}>▼</span>
                </div>
              </div>

              {/* Ceza / İddia Alanı */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 11, color: '#888', fontWeight: 700, letterSpacing: 1, marginBottom: 10 }}>
                  KAYBEDEN NE YAPAR? (İddia)
                </div>
                <textarea
                  value={penalty}
                  onChange={e => setPenalty(e.target.value)}
                  placeholder={'Örn: "Kaybeden tüm gruba Elazığ usulü gömme yemek ısmarlar 🍖"'}
                  rows={2}
                  maxLength={120}
                  style={{
                    width: '100%', padding: '13px 16px', borderRadius: 14,
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,60,60,0.2)',
                    color: '#e5e7eb', fontSize: 13, fontFamily: 'Inter,sans-serif',
                    resize: 'none', lineHeight: 1.5,
                    transition: 'border-color 0.2s',
                    boxSizing: 'border-box',
                  }}
                  onFocus={e => { e.target.style.borderColor = 'rgba(255,60,60,0.5)' }}
                  onBlur={e => { e.target.style.borderColor = 'rgba(255,60,60,0.2)' }}
                />
                <div style={{ textAlign: 'right', fontSize: 10, color: '#444', marginTop: 4 }}>
                  {penalty.length}/120
                </div>
              </div>

              {/* Confirm Button */}
              <button
                onClick={handleConfirm}
                disabled={!opponent || !penalty.trim() || confirming}
                style={{
                  width: '100%', padding: '16px', borderRadius: 16,
                  background: opponent && penalty.trim()
                    ? 'linear-gradient(135deg,#ff1a1a,#cc0000)'
                    : 'rgba(255,255,255,0.07)',
                  border: opponent && penalty.trim()
                    ? '1px solid rgba(255,80,80,0.5)'
                    : '1px solid rgba(255,255,255,0.06)',
                  color: opponent && penalty.trim() ? '#fff' : '#444',
                  fontFamily: 'Inter,sans-serif', fontWeight: 800, fontSize: 15,
                  cursor: opponent && penalty.trim() ? 'pointer' : 'default',
                  transition: 'all 0.25s ease',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  boxShadow: opponent && penalty.trim() ? '0 0 30px rgba(255,0,51,0.4)' : 'none',
                  animation: opponent && penalty.trim() ? 'pulse-red 2.5s ease-in-out infinite' : 'none',
                }}
              >
                {confirming
                  ? <span style={{ animation: 'spin-slow 0.8s linear infinite', display: 'inline-block' }}>⚔️</span>
                  : <><span>⚔️</span> Düelloyu Onayla!</>
                }
              </button>
            </>
          )}

          {/* ══════ PHASE: CONFIRMED — VS Kartı ══════ */}
          {phase === 'confirmed' && opp && (
            <div style={{ animation: 'badge-pop 0.45s ease both' }}>
              {/* Maç bilgisi */}
              <div style={{
                textAlign: 'center', marginBottom: 20,
                padding: '10px 16px', borderRadius: 12,
                background: 'rgba(255,30,30,0.08)',
                border: '1px solid rgba(255,30,30,0.2)',
              }}>
                <div style={{ fontSize: 11, color: '#ff6666', fontWeight: 700, letterSpacing: 1 }}>KADER MAÇI</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', marginTop: 4 }}>{selectedMatch?.label}</div>
                <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>{selectedMatch?.league}</div>
              </div>

              {/* VS Kartı — Buzlu cam + Şimşek */}
              <div style={{
                position: 'relative',
                borderRadius: 20,
                background: 'linear-gradient(135deg,rgba(255,10,10,0.12),rgba(18,8,18,0.95),rgba(255,10,10,0.12))',
                border: '1px solid rgba(255,30,30,0.3)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                padding: '28px 20px',
                boxShadow: '0 0 60px rgba(255,0,51,0.2), inset 0 1px 0 rgba(255,100,100,0.1)',
                overflow: 'hidden',
                marginBottom: 20,
              }}>
                {/* Arka plan glow'ları */}
                <div style={{
                  position: 'absolute', top: -30, left: -30,
                  width: 120, height: 120, borderRadius: '50%',
                  background: 'radial-gradient(circle,rgba(0,255,136,0.15),transparent)',
                  pointerEvents: 'none',
                }} />
                <div style={{
                  position: 'absolute', top: -30, right: -30,
                  width: 120, height: 120, borderRadius: '50%',
                  background: 'radial-gradient(circle,rgba(255,30,30,0.2),transparent)',
                  pointerEvents: 'none',
                }} />

                {/* Oyuncu satırı */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                  {/* Sol: Ben */}
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{
                      width: 64, height: 64, borderRadius: 18, margin: '0 auto 10px',
                      background: 'rgba(0,255,136,0.15)',
                      border: '2px solid rgba(0,255,136,0.4)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 30,
                      boxShadow: '0 0 20px rgba(0,255,136,0.25)',
                      animation: 'float 3s ease-in-out infinite',
                    }}>😎</div>
                    <div style={{ fontWeight: 800, fontSize: 14, color: '#00ff88' }}>Sen (Ahmet)</div>
                    <div style={{ fontSize: 11, color: '#555', marginTop: 3 }}>
                      {totalPoints.toLocaleString()} puan
                    </div>
                  </div>

                  {/* Orta: VS + Şimşek */}
                  <div style={{ textAlign: 'center', flexShrink: 0, position: 'relative' }}>
                    {/* Kırmızı dikey çizgi */}
                    <div style={{
                      position: 'absolute', top: -28, left: '50%', transform: 'translateX(-50%)',
                      width: 2, height: '140%',
                      background: 'linear-gradient(180deg,transparent,#ff3333,#ff6666,#ff3333,transparent)',
                      opacity: 0.6,
                      zIndex: 0,
                    }} />
                    <div style={{
                      position: 'relative', zIndex: 1,
                      width: 50, height: 50, borderRadius: '50%',
                      background: 'linear-gradient(135deg,#ff1a1a,#cc0000)',
                      border: '2px solid rgba(255,100,100,0.5)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 18, fontWeight: 900, color: '#fff',
                      boxShadow: '0 0 24px rgba(255,0,51,0.6)',
                      animation: 'pulse-red 1.8s ease-in-out infinite',
                    }}>⚡</div>
                    <div style={{
                      fontSize: 13, fontWeight: 900, color: '#ff4444',
                      letterSpacing: 2, marginTop: 8, position: 'relative', zIndex: 1,
                    }}>VS</div>
                  </div>

                  {/* Sağ: Rakip */}
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{
                      width: 64, height: 64, borderRadius: 18, margin: '0 auto 10px',
                      background: 'rgba(255,30,30,0.15)',
                      border: '2px solid rgba(255,60,60,0.4)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 30,
                      boxShadow: '0 0 20px rgba(255,30,30,0.25)',
                      animation: 'float 3s ease-in-out infinite 1.5s',
                      overflow: 'hidden',
                    }}>
                      {opp.avatar && opp.avatar.startsWith('http') ? (
                        <img src={opp.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.target.src = '😎' }} />
                      ) : (
                        opp.avatar
                      )}
                    </div>
                    <div style={{ fontWeight: 800, fontSize: 14, color: '#ff6666' }}>{opp.name}</div>
                    <div style={{ fontSize: 11, color: '#555', marginTop: 3 }}>
                      {opp.points.toLocaleString()} puan
                    </div>
                  </div>
                </div>

                {/* İddia Şeridi */}
                <div style={{
                  marginTop: 22,
                  padding: '10px 14px', borderRadius: 10,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  textAlign: 'center',
                }}>
                  <div style={{ fontSize: 10, color: '#555', fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>
                    🏆 KAZANANI ÖDER
                  </div>
                  <div style={{ fontSize: 13, color: '#e5e7eb', fontStyle: 'italic', lineHeight: 1.5 }}>
                    "{penalty}"
                  </div>
                </div>
              </div>

              {/* Otomatik Düello Durumu — buton yok, sistem halleder */}
              <div style={{
                padding: '14px 18px', borderRadius: 14,
                background: duelStatus === 'live'
                  ? 'rgba(255,165,0,0.1)'
                  : 'rgba(255,255,255,0.04)',
                border: `1px solid ${
                  duelStatus === 'live'
                    ? 'rgba(255,165,0,0.35)'
                    : 'rgba(255,255,255,0.08)'
                }`,
                display: 'flex', alignItems: 'center', gap: 12,
                animation: duelStatus === 'live' ? 'pulse-red 1.8s ease-in-out infinite' : 'none',
              }}>
                <span style={{ fontSize: 22 }}>
                  {duelStatus === 'waiting' ? '⏳' : '🏃‍♂️'}
                </span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: duelStatus === 'live' ? '#ff8800' : '#aaa' }}>
                    {duelStatus === 'waiting' ? 'Maç Bekleniyor...' : '🏃‍♂️ Düello Canlı!'}
                  </div>
                  <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>
                    {duelStatus === 'waiting'
                      ? 'Maç başladığında düello otomatik aktif olur'
                      : 'Maç biter bitmez sonuç açıklanacak ⚡'
                    }
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ══════ PHASE: RESULT ══════ */}
          {phase === 'result' && opp && (
            <div style={{ animation: 'badge-pop 0.5s cubic-bezier(.22,.61,.36,1) both' }}>
              {/* 🎆 Havai Fişek Efekti — kazanınca */}
              {winnerIsMe && (
                <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 10 }}>
                  {['🎆','🎇','✨','🌟','💥','🎉','🏆','⭐'].map((em, i) => (
                    <div key={i} style={{
                      position: 'absolute',
                      left: `${10 + i * 12}%`,
                      top: `${5 + (i % 3) * 15}%`,
                      fontSize: 24 + (i % 3) * 8,
                      animation: `firework-pop 0.8s ease ${i * 0.12}s both`,
                    }}>{em}</div>
                  ))}
                  {['🎊','⚡','🔥','💫','✨','🎯'].map((em, i) => (
                    <div key={'c' + i} style={{
                      position: 'absolute',
                      left: `${5 + i * 16}%`,
                      top: '40%',
                      fontSize: 18,
                      animation: `confetti-fall 1s ease ${0.3 + i * 0.1}s both`,
                    }}>{em}</div>
                  ))}
                </div>
              )}

              {/* Sonuç Banner */}
              <div style={{
                textAlign: 'center',
                padding: '28px 20px',
                borderRadius: 20,
                background: winnerIsMe
                  ? 'linear-gradient(135deg,rgba(0,255,136,0.12),rgba(0,204,100,0.08))'
                  : 'linear-gradient(135deg,rgba(255,30,30,0.12),rgba(180,0,0,0.08))',
                border: `1px solid ${winnerIsMe ? 'rgba(0,255,136,0.3)' : 'rgba(255,30,30,0.3)'}`,
                boxShadow: winnerIsMe
                  ? '0 0 40px rgba(0,255,136,0.15)'
                  : '0 0 40px rgba(255,0,51,0.15)',
                marginBottom: 20,
                position: 'relative',
              }}>
                <div style={{
                  fontSize: 64, marginBottom: 12,
                  animation: winnerIsMe ? 'trophy-bounce 0.8s ease both' : 'debt-shake 0.7s ease both',
                }}>
                  {winnerIsMe ? '🏆' : '😤'}
                </div>
                <div style={{
                  fontSize: 22, fontWeight: 900,
                  color: winnerIsMe ? '#00ff88' : '#ff4444',
                  marginBottom: 8, letterSpacing: '-0.5px',
                }}>
                  {winnerIsMe ? '🏆 DÜELLO KAZANILDI!' : '😤 Borcunu Öde!'}
                </div>
                <div style={{ fontSize: 13, color: '#888', lineHeight: 1.6 }}>
                  {winnerIsMe
                    ? `${opp.name} ile rekabette istatistiklerin daha iyiydi. Hak ettin! 🎯`
                    : `${opp.name} bu sefer senden daha iyi tahmin etti. İddiayı öde! 💸`
                  }
                </div>

                {/* İddia hatırlatma */}
                <div style={{
                  marginTop: 16, padding: '10px 14px', borderRadius: 10,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}>
                  <div style={{ fontSize: 11, color: winnerIsMe ? '#00ff88' : '#ff6666', fontWeight: 700 }}>
                    {winnerIsMe ? `🍖 ${opp.name} şimdi borçlu!` : '🍖 Senin ödemen gerekiyor!'}
                  </div>
                  <div style={{ fontSize: 12, color: '#aaa', marginTop: 4, fontStyle: 'italic' }}>
                    "{penalty}"
                  </div>
                </div>

                {/* Puan değişimi */}
                {winnerIsMe && (
                  <div style={{
                    marginTop: 14, padding: '8px 16px', borderRadius: 10,
                    background: 'rgba(0,255,136,0.1)',
                    border: '1px solid rgba(0,255,136,0.2)',
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                  }}>
                    <span style={{ fontSize: 18 }}>🏆</span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: '#00ff88' }}>+50 Düello Puanı</span>
                  </div>
                )}
              </div>

              {/* VS Mini Kartı */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 16,
                padding: '14px 20px', borderRadius: 16,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.07)',
                marginBottom: 20,
              }}>
                <div style={{ textAlign: 'center', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: 'rgba(255,255,255,0.05)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 24, overflow: 'hidden',
                  }}>
                    {userProfile?.avatar && userProfile.avatar.startsWith('http') ? (
                      <img src={userProfile.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.target.src = '😎' }} />
                    ) : (
                      userProfile?.avatar || '😎'
                    )}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: winnerIsMe ? '#00ff88' : '#888', marginTop: 4 }}>
                    Sen {winnerIsMe ? '👑' : ''}
                  </div>
                </div>
                <div style={{ fontSize: 18, color: '#ff4444', fontWeight: 900 }}>⚡</div>
                <div style={{ textAlign: 'center', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: 'rgba(255,255,255,0.05)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 24, overflow: 'hidden',
                  }}>
                    {opp.avatar && opp.avatar.startsWith('http') ? (
                      <img src={opp.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.target.src = '😎' }} />
                    ) : (
                      opp.avatar
                    )}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: !winnerIsMe ? '#ff6666' : '#888', marginTop: 4 }}>
                    {opp.name} {!winnerIsMe ? '👑' : ''}
                  </div>
                </div>
              </div>

              {/* Kapatma / Yeni Düello */}
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => { setPhase('setup'); setOpponent(null); setPenalty(''); setWinnerIsMe(null) }}
                  style={{
                    flex: 1, padding: '13px', borderRadius: 14,
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#aaa', fontFamily: 'Inter,sans-serif', fontWeight: 700, fontSize: 13,
                    cursor: 'pointer',
                  }}
                >⚔️ Yeniden Düello</button>
                <button
                  onClick={onClose}
                  style={{
                    flex: 1, padding: '13px', borderRadius: 14,
                    background: 'rgba(0,255,136,0.12)',
                    border: '1px solid rgba(0,255,136,0.3)',
                    color: '#00ff88', fontFamily: 'Inter,sans-serif', fontWeight: 700, fontSize: 13,
                    cursor: 'pointer',
                  }}
                >✅ Tamam</button>
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  )
}

function StatsTicker({ theme }) {
  const t = theme || THEMES.night
  const stats = [
    '🌍 2026 Dünya Kupası · 48 Takım',
    '⚡ 2.347 aktif tahmin şu an',
    '🏆 Liderlik koltuğu yeni sahiplerini bekliyor!',
    '🔥 Galatasaray - Fener derbisi başlamak üzere!',
    '📈 Toplam 18.240 tahmin bugün yapıldı',
  ]
  const text = stats.join('   ·   ')
  return (
    <div style={{
      background: t.ticker,
      borderBottom: `1px solid ${t.tickerB}`,
      overflow: 'hidden',
      height: 34,
      display: 'flex', alignItems: 'center',
      transition: 'background 0.4s ease',
    }}>
      <div style={{
        display: 'inline-block',
        whiteSpace: 'nowrap',
        animation: 'ticker 28s linear infinite',
        fontSize: 11, color: '#666', fontWeight: 500,
        paddingLeft: '100%',
      }}>
        {text}{'   ·   '}{text}
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────
   CANLI SORU POP-UP
   Maç esnasında ekrana düşen interaktif anlık soru kartı.
   Kullanıcı cevap seçince kilitlenir, sistem sonuçlandırınca puan eklenir.
───────────────────────────────────────────────── */
function LiveQuestionPopup({ question, onAnswer, onClose }) {
  const [selected, setSelected]   = useState(null)
  const [locked,   setLocked]     = useState(false)
  const [resolved, setResolved]   = useState(false)  // otomatik sonuç gösterimi
  const [closing,  setClosing]    = useState(false)

  function pick(opt) {
    if (locked) return
    setSelected(opt.value)
    setLocked(true)
    // puanı hemen parent'a ilet; gerçek doğrulamayı onAnswer halleder
    onAnswer && onAnswer({ questionId: question.id, value: opt.value, reward: opt.reward })
  }

  function dismiss() {
    setClosing(true)
    setTimeout(() => onClose && onClose(), 320)
  }

  // Auto-resolve animasyonu (sistem çözülmüş gibi)
  useEffect(() => {
    if (!locked) return
    const t = setTimeout(() => setResolved(true), 2000)
    return () => clearTimeout(t)
  }, [locked])

  // Resolved olunca 3 saniye sonra kendi kendine kapan
  useEffect(() => {
    if (!resolved) return
    const t = setTimeout(() => dismiss(), 3000)
    return () => clearTimeout(t)
  }, [resolved])

  return (
    <div style={{
      position: 'fixed', bottom: 90, left: '50%',
      transform: 'translateX(-50%)',
      width: 'calc(100% - 32px)', maxWidth: 540,
      zIndex: 450,
      animation: closing ? 'pop-out 0.32s ease both' : 'pop-in 0.45s cubic-bezier(.22,.61,.36,1) both',
    }}>
      {/* Buzlu cam kart */}
      <div style={{
        borderRadius: 22,
        background: 'linear-gradient(135deg,rgba(18,18,30,0.97),rgba(10,10,20,0.97))',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border: '1px solid rgba(0,255,136,0.22)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(0,255,136,0.08)',
        overflow: 'hidden',
        position: 'relative',
      }}>
        {/* Glow bleed */}
        <div style={{
          position: 'absolute', top: -40, right: -40,
          width: 140, height: 140, borderRadius: '50%',
          background: 'radial-gradient(circle,rgba(0,255,136,0.14),transparent)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', bottom: -30, left: -30,
          width: 100, height: 100, borderRadius: '50%',
          background: 'radial-gradient(circle,rgba(255,68,68,0.1),transparent)',
          pointerEvents: 'none',
        }} />

        {/* Header bar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '14px 16px 10px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: '#ff4444',
            animation: 'live-dot 1.2s ease-in-out infinite',
            flexShrink: 0,
          }} />
          <span style={{ fontSize: 10, color: '#ff4444', fontWeight: 700, letterSpacing: 1 }}>CANLI SORU</span>
          <span style={{
            marginLeft: 'auto', fontSize: 10, color: '#555', fontWeight: 600,
          }}>{question.subText}</span>
          {!locked && (
            <button
              onClick={dismiss}
              style={{
                background: 'none', border: 'none', color: '#444',
                fontSize: 14, cursor: 'pointer', padding: '0 2px',
                marginLeft: 4, lineHeight: 1,
              }}
            >✕</button>
          )}
        </div>

        {/* Body */}
        <div style={{ padding: '16px 16px 18px' }}>
          <p style={{
            color: '#f1f5f9', fontSize: 15, fontWeight: 700,
            lineHeight: 1.45, marginBottom: 16,
          }}>{question.text}</p>

          {/* Options */}
          {!resolved ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {question.options.map(opt => {
                const isSel = selected === opt.value
                return (
                  <button
                    key={opt.value}
                    onClick={() => pick(opt)}
                    disabled={locked}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '13px 16px', borderRadius: 14,
                      border: `1px solid ${isSel ? opt.color : locked ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.1)'}`,
                      background: isSel
                        ? `${opt.color}1a`
                        : locked ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.05)',
                      cursor: locked ? 'not-allowed' : 'pointer',
                      color: locked && !isSel ? '#444' : '#fff',
                      fontFamily: 'Inter,sans-serif', fontWeight: 700, fontSize: 14,
                      transition: 'all 0.2s ease',
                      opacity: locked && !isSel ? 0.4 : 1,
                      boxShadow: isSel ? `0 0 16px ${opt.color}33` : 'none',
                    }}
                  >
                    <span>{opt.label}</span>
                    <span style={{
                      padding: '4px 12px', borderRadius: 50,
                      background: isSel ? `${opt.color}25` : 'rgba(255,255,255,0.07)',
                      fontSize: 12, fontWeight: 800,
                      color: isSel ? opt.color : '#666',
                    }}>{opt.reward > 0 ? `+${opt.reward} P` : `${opt.reward} P`}</span>
                  </button>
                )
              })}
              {locked && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 14px', borderRadius: 12,
                  background: 'rgba(0,255,136,0.07)',
                  border: '1px solid rgba(0,255,136,0.15)',
                  animation: 'slide-in 0.3s ease both',
                }}>
                  <span style={{ fontSize: 14 }}>🔒</span>
                  <span style={{ fontSize: 12, color: '#00ff88', fontWeight: 600 }}>
                    Tahmin kilitlendi — sonuç bekleniyor...
                  </span>
                  <span style={{
                    marginLeft: 'auto', fontSize: 10, color: '#444',
                    animation: 'countdown-pulse 1s infinite',
                  }}>⏳</span>
                </div>
              )}
            </div>
          ) : (
            /* Resolved state */
            <div style={{
              textAlign: 'center', padding: '16px 0 8px',
              animation: 'badge-pop 0.4s ease both',
            }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>
                {selected === question.correctAnswer ? '🎯' : '😔'}
              </div>
              <div style={{
                fontSize: 15, fontWeight: 800,
                color: selected === question.correctAnswer ? '#00ff88' : '#f43f5e',
              }}>
                {selected === question.correctAnswer
                  ? `Doğru! +${question.options.find(o => o.value === selected)?.reward || 0} Puan 🚀`
                  : 'Bu seferlik olmadı 😤'
                }
              </div>
              <div style={{ fontSize: 11, color: '#555', marginTop: 6 }}>
                {selected ? 'Tahminin işlendi' : 'Süre doldu'}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────
   PUAN KAZANMA TOAST
───────────────────────────────────────────────── */
function PointToast({ event, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2800)
    return () => clearTimeout(t)
  }, [])

  const tierMeta = getPointTierMeta(event.tier)

  return (
    <div style={{
      position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)',
      zIndex: 500,
      padding: '12px 22px', borderRadius: 16,
      background: tierMeta.bg,
      backdropFilter: 'blur(14px)',
      border: `1px solid ${tierMeta.color}44`,
      display: 'flex', alignItems: 'center', gap: 12,
      boxShadow: `0 8px 40px rgba(0,0,0,0.5), 0 0 0 1px ${tierMeta.color}22`,
      animation: 'badge-pop 0.35s cubic-bezier(.22,.61,.36,1) both',
      maxWidth: '90vw',
    }}>
      <div style={{ fontSize: 28 }}>
        {event.tier === 'exact' ? '🎯' : event.tier === 'result' ? '✅' : '❌'}
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 800, color: tierMeta.color }}>{tierMeta.label}</div>
        <div style={{ fontSize: 12, color: '#aaa', marginTop: 1 }}>{event.reason}</div>
      </div>
      <div style={{
        fontSize: 22, fontWeight: 900,
        color: tierMeta.color,
        marginLeft: 6,
      }}>+{event.points}</div>
    </div>
  )
}

/* ─────────────────────────────────────────────────
   SCORING BREAKDOWN PANEL
   Anlık soru için seçim yapılınca gösterilir
───────────────────────────────────────────────── */
function ScoringBreakdown({ breakdown }) {
  if (!breakdown) return null
  const { participation, question, total } = breakdown
  return (
    <div style={{
      margin: '12px 0 0',
      padding: '12px 14px',
      borderRadius: 12,
      background: 'rgba(0,255,136,0.06)',
      border: '1px solid rgba(0,255,136,0.15)',
      animation: 'slide-in 0.3s ease both',
    }}>
      <div style={{ fontSize: 11, color: '#555', fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>PUAN DÖKÜMÜ</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {[
          { label: '📋 Katılım Puanı', val: `+${participation}`, color: '#60a5fa' },
          { label: '⚡ Cevap Puanı (bekleniyor)', val: `+${question}`, color: '#facc15' },
          { label: '🧮 Toplam Kazanım', val: `+${total}`, color: '#00ff88' },
        ].map(row => (
          <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: '#888' }}>{row.label}</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: row.color }}>{row.val}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────
   MAIN DASHBOARD
───────────────────────────────────────────────── */
export default function Dashboard({ onNavigate, params = {}, theme, onCycleTheme, currentUser, onLogout }) {
  const t = theme || THEMES.night
  useEffect(() => { injectKeyframes(); updateThemeCSSVars(t) }, [])
  // Tema değişince CSS değişkenlerini anında güncelle
  useEffect(() => { updateThemeCSSVars(t) }, [t.id])

  /* ── Core state ─────────────────────────────── */
  const [league, setLeague]           = useState(params.leagueId || 'wc2026')
  const [copied, setCopied]           = useState(false)
  const [activeTab, setActiveTab]     = useState('matches') // 'matches' | 'chat'
  const [duelOpen, setDuelOpen]       = useState(false)
  const [selectedPredictMatch, setSelectedPredictMatch] = useState(null)

  /* ── Sidebar drawer state ────────────────────── */
  const [sidebarOpen, setSidebarOpen]   = useState(false)
  const [sidebarTab, setSidebarTab]     = useState('profile') // 'profile' | 'history' | 'settings'

  // Profile fields state
  const [userProfile, setUserProfile]   = useState(() => {
    return dbService.getProfile(currentUser.uid) || dbService.initProfile(currentUser.uid, currentUser.username)
  })
  const [usernameInput, setUsernameInput] = useState(userProfile?.username || '')
  const [avatarInput, setAvatarInput]     = useState(userProfile?.avatar || '😎')
  const [bioInput, setBioInput]           = useState(userProfile?.bio || '')

  // Password fields state
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword]         = useState('')
  const [passwordError, setPasswordError]     = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState('')

  // Toggles state
  const [soundEnabled, setSoundEnabled] = useState(() => {
    return localStorage.getItem('vg_settings_sound') !== 'false'
  })
  const [notifEnabled, setNotifEnabled] = useState(() => {
    return localStorage.getItem('vg_settings_notif') !== 'false'
  })

  function handleUpdateProfile(updates) {
    const prof = dbService.getProfile(currentUser.uid) || dbService.initProfile(currentUser.uid, currentUser.username)
    const updatedProf = { ...prof, ...updates }
    dbService.updateProfile(currentUser.uid, updatedProf)
    setUserProfile(updatedProf)

    const curUser = localStorage.getItem('vg_current_user')
    if (curUser) {
      const parsed = JSON.parse(curUser)
      const updatedUser = { ...parsed, ...updates }
      localStorage.setItem('vg_current_user', JSON.stringify(updatedUser))
    }

    // Sync to vg_users as well
    try {
      const users = JSON.parse(localStorage.getItem('vg_users') || '{}')
      if (users[currentUser.uid]) {
        users[currentUser.uid] = { ...users[currentUser.uid], ...updates }
        localStorage.setItem('vg_users', JSON.stringify(users))
      }
    } catch (e) {}

    setLeaderboard(prev => prev.map(p => {
      if (p.isMe) {
        return {
          ...p,
          name: updates.username || p.name,
          avatar: updates.avatar || p.avatar
        }
      }
      return p
    }))
  }

  /* ── API / Match state ───────────────────────── */
  const [matches, setMatches]         = useState([])  // LiveMatchCard'lara giden veri
  const [dynamicQuestions, setDynamicQuestions] = useState([])
  const [matchesLoading, setLoading]  = useState(false)
  const [matchesError, setError]      = useState(null)
  const [retryCount, setRetryCount]   = useState(0)  // retry trigger

  /* ── Scoring state ───────────────────────────── */
  const [answers, setAnswers]           = useState({})       // { qId: choiceValue }
  const [lockedAnswers, setLocked]      = useState(new Set()) // kilitli soru ID'leri
  const [scoringBreakdowns, setBreaks]  = useState({})       // { qId: breakdown }
  const [toastEvent, setToastEvent]     = useState(null)
  const [totalPoints, setTotalPoints]   = useState(0)
  const [leaderboard, setLeaderboard]   = useState(() => getDynamicLeaderboard(currentUser.uid))

  /* ── userPredictions — maç bazlı skor tahmini ── */
  // { [matchId]: { homeScore: number, awayScore: number } }
  const [matchPredictions, setMatchPredictions] = useState({})

  // Persistent tracking helpers to prevent double-scoring on refreshes
  const getCalculatedMatches = useCallback((uid) => {
    try {
      const data = localStorage.getItem(`vg_calculated_matches_${uid}`)
      return data ? JSON.parse(data) : []
    } catch {
      return []
    }
  }, [])

  const saveCalculatedMatch = useCallback((uid, matchId) => {
    try {
      const current = getCalculatedMatches(uid)
      if (!current.includes(matchId)) {
        localStorage.setItem(`vg_calculated_matches_${uid}`, JSON.stringify([...current, matchId]))
      }
    } catch {}
  }, [getCalculatedMatches])

  const getResolvedQuestions = useCallback((uid) => {
    try {
      const data = localStorage.getItem(`vg_resolved_questions_${uid}`)
      return data ? JSON.parse(data) : []
    } catch {
      return []
    }
  }, [])

  const saveResolvedQuestion = useCallback((uid, qId) => {
    try {
      const current = getResolvedQuestions(uid)
      if (!current.includes(qId)) {
        localStorage.setItem(`vg_resolved_questions_${uid}`, JSON.stringify([...current, qId]))
      }
    } catch {}
  }, [getResolvedQuestions])

  /* ── Sync profile, predictions and answers on mount/user change ── */
  useEffect(() => {
    const profile = dbService.getProfile(currentUser.uid) || dbService.initProfile(currentUser.uid, currentUser.username)
    setTotalPoints(profile.totalPoints)
    
    // Dynamically build the leaderboard from registered users
    const dynLeaderboard = getDynamicLeaderboard(currentUser.uid)
    setLeaderboard(dynLeaderboard)

    const savedPreds = dbService.getPredictions(currentUser.uid)
    setMatchPredictions(savedPreds)

    const savedAns = dbService.getAnswers(currentUser.uid)
    setAnswers(savedAns)
    
    // Set locked answers based on saved answers
    const lockedSet = new Set(Object.keys(savedAns))
    setLocked(lockedSet)
  }, [currentUser])

  /* ── Dynamic leaderboard: recompute on point change and save to dbService ─ */
  const updateMyPoints = useCallback((delta, correctDelta = 0) => {
    dbService.addPoints(currentUser.uid, delta, correctDelta)
    setLeaderboard(prev => {
      const updated = prev.map(p => {
        if (!p.isMe) return p
        const newCorrect = p.correct + correctDelta
        const newTotal   = p.total   + (correctDelta > 0 || delta > 0 ? 1 : 0)
        const newPoints  = p.points  + delta
        const dynBadge   = computeDynamicBadge({ total: newTotal, correct: newCorrect })
        return {
          ...p,
          points:  newPoints,
          correct: newCorrect,
          total:   newTotal,
          badge:   dynBadge || p.badge,
        }
      })
      const sorted = sortLeaderboard(updated)
      return sorted.map((p, i) => ({ ...p, rank: i + 1 }))
    })
  }, [currentUser])

  /* ────────────────────────────────────────────────
     useEffect: Lig değişince veya retry tetiklenince
     API'den maçları çek ve 45s aralıklarla sessizce arka planda güncelle
  ─────────────────────────────────────────────── */
  useEffect(() => {
    const selectedLeague = LEAGUES.find(l => l.id === league)
    if (!selectedLeague) return

    const apiId = selectedLeague.apiId
    let cancelled = false

    async function loadMatches(isPoll = false) {
      if (!isPoll) setLoading(true)
      try {
        // Sadece canlı maçları dene!
        const data = await fetchLiveMatches(apiId)
        if (cancelled) return

        const calculatedList = getCalculatedMatches(currentUser.uid)
        const mappedData = data.map(m => ({
          ...m,
          isCalculated: m.isCalculated || calculatedList.includes(m.id)
        }))

        setMatches(mappedData)

        // Dinamik soruları üret
        const questionsList = generateDynamicQuestions(mappedData, currentUser.uid)
        setDynamicQuestions(questionsList)

        setError(null)
      } catch (err) {
        if (cancelled) return
        console.error('[VibeGoal API]', err)
        if (!isPoll) {
          setError(err.message || 'Bağlantı hatası')
          setMatches([])
          setDynamicQuestions([])
        }
      } finally {
        if (!cancelled && !isPoll) setLoading(false)
      }
    }

    // Initial fetch
    loadMatches(false)

    // Polling interval
    const pollInterval = setInterval(() => {
      loadMatches(true)
    }, 45000)

    return () => {
      cancelled = true
      clearInterval(pollInterval)
    }
  }, [league, retryCount, currentUser, getCalculatedMatches])

  /* ── checkPredictions — API'den FT gelen maç için
     kullanıcının tahminini kontrol et ve puan ver. ── */
  const checkPredictions = useCallback((finishedMatch) => {
    if (!finishedMatch || finishedMatch.status !== 'FT') return

    // Double check persistent calculated list
    const calculatedList = getCalculatedMatches(currentUser.uid)
    if (calculatedList.includes(finishedMatch.id)) return

    const userPred = matchPredictions[finishedMatch.id]

    // Kullanıcı bu maça tahmin yapmışsa puanla
    if (userPred) {
      const result = calculateMatchPoints(
        { homeScore: userPred.homeScore, awayScore: userPred.awayScore },
        { homeScore: finishedMatch.homeScore, awayScore: finishedMatch.awayScore }
      )

      if (result.points > 0) {
        setToastEvent({ points: result.points, reason: result.reason, tier: result.tier })
        setTotalPoints(p => p + result.points)
        updateMyPoints(result.points, result.tier !== 'wrong' ? 1 : 0)
      }

      updatePredictHistoryStatus(
        currentUser.uid,
        `match_${finishedMatch.id}`,
        result.points > 0 ? 'won' : 'lost',
        `Sonuç: ${finishedMatch.homeScore} - ${finishedMatch.awayScore}`
      )
    }

    // Persist this calculated match to storage immediately
    saveCalculatedMatch(currentUser.uid, finishedMatch.id)

    // Anlık soru puanlaması — kilitli cevapları da kontrol et
    const lockedDefs = getLockedQuestionDefinitions(currentUser.uid)
    lockedAnswers.forEach(qId => {
      const resolvedList = getResolvedQuestions(currentUser.uid)
      if (resolvedList.includes(qId)) return

      const prediction = answers[qId]
      if (!prediction) return

      // Bu soru bu maça aitse sonucu hesapla
      const relatedQ = lockedDefs[qId]
      if (!relatedQ || relatedQ.matchId !== finishedMatch.id) return

      const correctAnswer = resolveDynamicCorrectAnswer(relatedQ, finishedMatch)
      const selectedOpt = relatedQ.options.find(o => o.value === prediction)
      const qResult = calculateQuestionPoints(
        prediction,
        correctAnswer,
        selectedOpt?.reward ?? 15
      )

      saveResolvedQuestion(currentUser.uid, qId)

      const isWon = qResult.points > 0
      const correctOptLabel = relatedQ.options.find(o => o.value === correctAnswer)?.label || correctAnswer
      updatePredictHistoryStatus(
        currentUser.uid,
        `q_${qId}`,
        isWon ? 'won' : 'lost',
        `Doğru: ${correctOptLabel}`
      )

      if (qResult.points > 0) {
        setToastEvent({
          points: qResult.points,
          reason: `Anlık Soru Doğru! ${qResult.correct ? 'Tebrikler' : ''} 🎯`,
          tier: 'exact',
        })
        setTotalPoints(p => p + qResult.points)
        updateMyPoints(qResult.points, 1)
      }
    })

    // Update state isCalculated flag
    setMatches(prev =>
      prev.map(m =>
        m.id === finishedMatch.id ? { ...m, isCalculated: true } : m
      )
    )
  }, [matchPredictions, lockedAnswers, answers, currentUser, updateMyPoints, getCalculatedMatches, saveCalculatedMatch, getResolvedQuestions, saveResolvedQuestion])

  /* ────────────────────────────────────────────────
     useEffect: FT olan maçları periyodik kontrol et
     Her 30 saniyede bir çalışır, status=FT maçları
     checkPredictions'a gönderir.
  ─────────────────────────────────────────────── */
  useEffect(() => {
    const interval = setInterval(() => {
      matches.forEach(match => {
        if (match.status === 'FT') {
          const calculatedList = getCalculatedMatches(currentUser.uid)
          if (!calculatedList.includes(match.id)) {
            checkPredictions(match)
          }
        }
      })
    }, 30000)
    return () => clearInterval(interval)
  }, [matches, currentUser, checkPredictions, getCalculatedMatches])

  /* ── Answer handler — sadece 1 kez +5, sonra kilitli ── */
  function handleAnswer(qId, value) {
    if (lockedAnswers.has(qId)) return
    setAnswers(prev => ({ ...prev, [qId]: value }))
  }

  /* ── Tahmini kaydet ve KILITLE ─────── */
  function commitAnswer(qId) {
    const value = answers[qId]
    if (!value || lockedAnswers.has(qId)) return

    const newAnswers = { ...answers, [qId]: value }
    setAnswers(newAnswers)
    dbService.saveAnswers(currentUser.uid, newAnswers)

    setLocked(prev => new Set([...prev, qId]))

    // Save question definition to keep text frozen
    const qObj = dynamicQuestions.find(q => q.id === qId)
    if (qObj) {
      saveLockedQuestionDefinition(currentUser.uid, qObj)
    }

    const match = matches.find(m => m.id === qObj?.matchId)
    const matchName = match ? `${match.home} vs ${match.away}` : 'Canlı Soru'
    const selectedOptLabel = qObj?.options.find(o => o.value === value)?.label || value

    addPredictHistoryEntry(currentUser.uid, {
      id: `q_${qId}`,
      matchName: `${matchName} (Soru)`,
      predictionText: `Tahmin: ${selectedOptLabel}`,
      status: 'pending',
      outcomeText: ''
    })

    const participation = getParticipationPoints()
    const questionBonus = qObj?.options.find(o => o.value === value)?.reward ?? 15

    setBreaks(prev => ({
      ...prev,
      [qId]: { participation, question: questionBonus, total: participation + questionBonus },
    }))
    setTotalPoints(p => p + participation)
    setToastEvent({
      points: participation,
      reason: 'Tahmin kilitlendi — maç sonucu bekleniyor!',
      tier: 'result',
    })
    updateMyPoints(participation, 0)
  }

  /* ── Tahmin Girişi Kaydetme ── */
  function saveMatchPrediction(matchId, homeScore, awayScore) {
    const updated = {
      ...matchPredictions,
      [matchId]: { homeScore: Number(homeScore), awayScore: Number(awayScore) }
    }
    setMatchPredictions(updated)
    dbService.savePredictions(currentUser.uid, updated)

    const match = matches.find(m => m.id === matchId)
    const matchName = match ? `${match.home} vs ${match.away}` : `Maç #${matchId}`
    addPredictHistoryEntry(currentUser.uid, {
      id: `match_${matchId}`,
      matchName,
      predictionText: `Skor: ${homeScore} - ${awayScore}`,
      status: 'pending',
      outcomeText: ''
    })

    // Katılım ödülü (+5 puan)
    const delta = getParticipationPoints()
    setTotalPoints(p => p + delta)
    updateMyPoints(delta, 0)
    setToastEvent({
      points: delta,
      reason: 'Skor tahmini kaydedildi! (+5 Katılım Puanı) 🎯',
      tier: 'result'
    })
  }

  /* ── Retry handler ─── */
  function handleRetry() {
    setRetryCount(c => c + 1)
    setError(null)
    setLoading(true)
  }

  const questions = dynamicQuestions

  // Dynamic stats
  const myPlayer    = leaderboard.find(p => p.isMe)
  const successRate = myPlayer ? Math.round((myPlayer.correct / Math.max(myPlayer.total, 1)) * 100) : 68
  const dynBadge    = computeDynamicBadge({ total: myPlayer?.total || 51, correct: myPlayer?.correct || 35 })

  const roomName = params.roomName || 'Elazığ Tayfa'

  return (
    <div style={{
      minHeight: '100vh',
      background: t.bg,
      fontFamily: 'Inter, sans-serif',
      color: '#fff',
      maxWidth: 600,
      margin: '0 auto',
      paddingBottom: 100,
      position: 'relative',
      transition: 'background 0.4s ease',
    }}>
      {/* Ambient circles — tema rengine göre değişir */}
      <div style={{
        position: 'fixed', top: '5%', right: '-15%',
        width: 300, height: 300, borderRadius: '50%',
        background: `radial-gradient(circle,${withGlowOpacity(t.glowSoft, 0.07)},transparent 70%)`,
        pointerEvents: 'none', zIndex: 0,
        transition: 'background 0.4s ease',
      }} />
      <div style={{
        position: 'fixed', bottom: '20%', left: '-20%',
        width: 350, height: 350, borderRadius: '50%',
        background: `radial-gradient(circle,${withGlowOpacity(t.glowSoft, 0.05)},transparent 70%)`,
        pointerEvents: 'none', zIndex: 0,
        transition: 'background 0.4s ease',
      }} />

      {/* Point toast */}
      {toastEvent && (
        <PointToast event={toastEvent} onDone={() => setToastEvent(null)} />
      )}



      {/* Düello Modu */}
      {duelOpen && (
        <DuelScreen
          onClose={() => setDuelOpen(false)}
          leaderboard={leaderboard}
          totalPoints={totalPoints}
          theme={t}
          onWin={() => {
            setTotalPoints(p => p + 50)
            setToastEvent({ points: 50, reason: '🏆 Düello Kazanıldı!', tier: 'exact' })
            updateMyPoints(50, 1)
          }}
        />
      )}

      <div style={{ position: 'relative', zIndex: 1 }}>
        <StatsTicker theme={t} />
        <Header
          league={league} setLeague={setLeague}
          totalPoints={totalPoints} onNavigate={onNavigate}
          theme={t} onCycleTheme={onCycleTheme}
          currentUser={currentUser} onLogout={onLogout}
          hideLeagues={!!params.roomId}
          onLogoClick={() => setSidebarOpen(true)}
        />

        {/* ── Room context bar ────────────────── */}
        {params.roomName && (
          <div style={{
            margin: '12px 20px 0',
            padding: '10px 16px',
            borderRadius: 12,
            background: t.neon,
            border: `1px solid ${t.accent}2e`,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ fontSize: 18 }}>🏠</span>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: t.accent }}>{params.roomName}</div>
              <div style={{ fontSize: 10, color: '#666' }}>Aktif oda görünümü</div>
            </div>
          </div>
        )}

        {/* ── Main tabs: Maçlar / Sohbet ──────── */}
        <div style={{ padding: '16px 20px 0' }}>
          <div style={{
            display: 'flex', gap: 4, padding: '4px',
            background: 'rgba(255,255,255,0.05)',
            borderRadius: 14,
          }}>
            {[
              { id: 'matches', label: '⚽ Maçlar & Skorlar' },
              { id: 'chat',    label: '💬 Grup Sohbeti' },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                style={{
                  flex: 1, padding: '11px 8px', borderRadius: 10, border: 'none',
                  background: activeTab === t.id ? '#00ff88' : 'transparent',
                  color: activeTab === t.id ? '#121212' : '#888',
                  fontFamily: 'Inter,sans-serif', fontWeight: 700, fontSize: 13,
                  cursor: 'pointer', transition: 'all 0.22s ease',
                }}
              >{t.label}</button>
            ))}
          </div>
        </div>

        {/* ── TAB: MATCHES ─────────────────────── */}
        {activeTab === 'matches' && (
          <>
            <LiveFeed
              matches={matches}
              predictions={matchPredictions}
              loading={matchesLoading}
              error={matchesError}
              onRetry={handleRetry}
              theme={t}
              onMatchClick={(m) => setSelectedPredictMatch(m)}
            />

            {/* Enhanced QuestionPanel with scoring */}
            <section style={{ padding: '24px 20px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <span style={{ fontSize: 18 }}>⚡</span>
                <span style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>Anlık Sorular</span>
                <span style={{
                  padding: '2px 10px', borderRadius: 50,
                  background: t.glowSoft,
                  border: `1px solid ${t.accent}40`,
                  fontSize: 10, color: t.accent, fontWeight: 700,
                }}>+{POINTS.PARTICIPATION} katılım · +{POINTS.EXACT_SCORE} birebir · +{POINTS.CORRECT_RESULT} sonuç</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {questions.length === 0 ? (
                  <div style={{
                    padding: '24px 18px', borderRadius: 20, textAlign: 'center',
                    background: 'rgba(255,255,255,0.02)',
                    border: `1px solid ${t.accent}1f`,
                    color: '#666', fontSize: 13, fontWeight: 600,
                  }}>
                    📭 Canlı maç bulunmadığı için şu an anlık soru bulunmuyor bra.
                  </div>
                ) : (
                  questions.map((q, qi) => (
                    <div key={q.id} style={{
                      background: `linear-gradient(135deg,${t.neon},rgba(0,0,0,0.4))`,
                      border: `1px solid ${answers[q.id] ? t.accent + '4d' : t.accent + '26'}`,
                      borderRadius: 20, padding: '18px 16px',
                      animation: `slide-in ${0.1 + qi * 0.08}s ease both`,
                      position: 'relative', overflow: 'hidden',
                    }}>
                      <div style={{ position: 'absolute', bottom: -40, right: -40, width: 100, height: 100, borderRadius: '50%', background: `radial-gradient(circle,${t.neon},transparent)`, pointerEvents: 'none' }} />

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 14 }}>
                        <p style={{ color: '#e5e7eb', fontSize: 14, fontWeight: 600, lineHeight: 1.5, margin: 0 }}>{q.text}</p>
                        <Countdown seconds={q.deadline} />
                      </div>

                      {/* FIX #2: Seçenekler — kilitliyse disabled + opak */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {q.options.map(opt => {
                          const selected  = answers[q.id] === opt.value
                          const isLocked  = lockedAnswers.has(q.id)
                          return (
                            <button
                              key={opt.value}
                              className={`q-option${selected && !isLocked ? ' selected' : ''}`}
                              onClick={() => handleAnswer(q.id, opt.value)}
                              disabled={isLocked}
                              style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '12px 16px', borderRadius: 12,
                                border: `1px solid ${
                                  isLocked && selected ? t.accent + '66'
                                  : selected ? t.accent
                                  : 'rgba(255,255,255,0.1)'
                                }`,
                                background: isLocked && selected
                                  ? t.neon
                                  : selected ? `${t.accent}26` : 'rgba(255,255,255,0.04)',
                                cursor: isLocked ? 'not-allowed' : 'pointer',
                                color: isLocked ? '#666' : '#fff',
                                fontFamily: 'Inter,sans-serif', fontWeight: 600, fontSize: 13,
                                transition: 'all 0.25s ease',
                                opacity: isLocked && !selected ? 0.35 : 1,
                              }}
                            >
                              <span>{opt.label}</span>
                              <span style={{
                                padding: '3px 10px', borderRadius: 50,
                                background: selected && !isLocked ? `${t.accent}4d` : 'rgba(255,255,255,0.06)',
                                fontSize: 11,
                                color: isLocked && selected ? t.accent + '88' : selected ? t.accent : '#555',
                                fontWeight: 700,
                              }}>{opt.points}</span>
                            </button>
                          )
                        })}
                      </div>

                      {/* Scoring breakdown — kilitlenince görünür */}
                      {scoringBreakdowns[q.id] && (
                        <ScoringBreakdown breakdown={scoringBreakdowns[q.id]} />
                      )}

                      {/* FIX #2: Kaydet butonu — 1 kez çalışır, sonra kilitli görünür */}
                      <div style={{ marginTop: 12 }}>
                        {!lockedAnswers.has(q.id) ? (
                          <button
                            onClick={() => commitAnswer(q.id)}
                            disabled={!answers[q.id]}
                            style={{
                              width: '100%', padding: '12px', borderRadius: 12,
                              background: answers[q.id]
                                ? `linear-gradient(135deg,${t.accent}33,${t.accentAlt}26)`
                                : 'rgba(255,255,255,0.04)',
                              border: `1px solid ${answers[q.id] ? t.accent + '66' : 'rgba(255,255,255,0.08)'}`,
                              color: answers[q.id] ? t.accent : '#444',
                              fontFamily: 'Inter,sans-serif', fontWeight: 700, fontSize: 13,
                              cursor: answers[q.id] ? 'pointer' : 'not-allowed',
                              transition: 'all 0.2s ease',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                              boxShadow: answers[q.id] ? `0 0 12px ${t.glowSoft}` : 'none',
                            }}
                          >
                            <span>🔒</span>
                            {answers[q.id] ? 'Tahmini Kaydet (+5 Puan)' : 'Önce bir seçenek seç'}
                          </button>
                        ) : (
                          /* KİLİTLİ — disabled görünüm */
                          <div style={{
                            width: '100%', padding: '12px', borderRadius: 12,
                            background: t.neon,
                            border: `1px solid ${t.accent}33`,
                            color: t.accent + '88',
                            fontFamily: 'Inter,sans-serif', fontWeight: 700, fontSize: 13,
                            textAlign: 'center',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                            opacity: 0.7,
                            animation: 'slide-in 0.3s ease both',
                          }}>
                            <span>✅</span> Tahmin Kaydedildi · Maç sonucu bekleniyor...
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* Leaderboard with live scoring */}
            <section style={{ padding: '24px 20px 0' }}>
              <div style={{
                borderRadius: 24,
                background: 'rgba(255,255,255,0.04)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                border: `1px solid ${t.border}`,
                overflow: 'hidden',
                boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
              }}>
                <div style={{
                  padding: '18px 20px 14px',
                  background: `linear-gradient(135deg,${t.neon},rgba(0,0,0,0))`,
                  borderBottom: '1px solid rgba(255,255,255,0.07)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <div>
                    <div style={{ color: '#fff', fontWeight: 800, fontSize: 16 }}>🏠 {roomName}</div>
                    <div style={{ color: '#666', fontSize: 11, marginTop: 2 }}>Puan durumu canlı güncelleniyor</div>
                  </div>
                  {dynBadge && (
                    <BadgeChip badge={dynBadge} />
                  )}
                </div>

                {/* Col headers */}
                <div style={{
                  display: 'grid', gridTemplateColumns: '32px 1fr auto auto',
                  gap: 8, padding: '10px 20px',
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                }}>
                  <span style={{ color: '#555', fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>#</span>
                  <span style={{ color: '#555', fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>OYUNCU</span>
                  <span style={{ color: '#555', fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>TAH.</span>
                  <span style={{ color: '#555', fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>PUAN</span>
                </div>

                {leaderboard.map((p, idx) => {
                  const rankColor = p.rank === 1 ? '#facc15' : p.rank === 2 ? '#94a3b8' : p.rank === 3 ? '#fb923c' : '#555'
                  const rate = Math.round((p.correct / Math.max(p.total, 1)) * 100)
                  return (
                    <div
                      key={p.id}
                      className="leader-row"
                      style={{
                        display: 'grid', gridTemplateColumns: '32px 1fr auto auto',
                        gap: 8, padding: '14px 20px', alignItems: 'center',
                        borderBottom: idx < leaderboard.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                        background: p.isMe ? t.neon : 'transparent',
                        transition: 'background 0.2s',
                        animation: `slide-in ${0.2 + idx * 0.08}s ease both`,
                      }}
                    >
                      <div style={{
                        width: 28, height: 28, borderRadius: 8,
                        background: p.rank <= 3 ? `${rankColor}22` : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${p.rank <= 3 ? rankColor + '55' : 'transparent'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: p.rank <= 3 ? 14 : 12, color: rankColor, fontWeight: 800,
                      }}>
                        {p.rank <= 3 ? ['🥇','🥈','🥉'][p.rank - 1] : p.rank}
                      </div>

                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{
                            width: 22, height: 22, borderRadius: '50%',
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 14, overflow: 'hidden', flexShrink: 0,
                          }}>
                            {p.avatar && p.avatar.startsWith('http') ? (
                              <img src={p.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.target.src = '😎' }} />
                            ) : (
                              p.avatar || '😎'
                            )}
                          </span>
                          <span style={{ color: p.isMe ? t.accent : '#e5e7eb', fontWeight: p.isMe ? 700 : 500, fontSize: 13 }}>
                            {p.name}{p.isMe && ' 👈'}
                          </span>
                          {/* Rate pill */}
                          <span style={{
                            fontSize: 9, padding: '1px 6px', borderRadius: 99, fontWeight: 700,
                            background: rate >= 70 ? 'rgba(52,211,153,0.15)' : rate < 20 ? 'rgba(251,146,60,0.15)' : 'rgba(255,255,255,0.07)',
                            color: rate >= 70 ? '#34d399' : rate < 20 ? '#fb923c' : '#666',
                            border: `1px solid ${rate >= 70 ? 'rgba(52,211,153,0.3)' : rate < 20 ? 'rgba(251,146,60,0.3)' : 'transparent'}`,
                          }}>%{rate}</span>
                        </div>
                        <div style={{ marginTop: 4 }}>
                          <BadgeChip badge={p.badge} />
                        </div>
                      </div>

                      <div style={{ textAlign: 'center', color: '#34d399', fontWeight: 700, fontSize: 14 }}>{p.correct}</div>
                      <div style={{ textAlign: 'right', color: p.isMe ? t.accent : '#fff', fontWeight: 800, fontSize: 14 }}>{p.points.toLocaleString()}</div>
                    </div>
                  )
                })}
              </div>
            </section>

            {/* Quick stats */}
            <section style={{ padding: '20px 20px 0', display: 'flex', gap: 12 }}>
              {[
                { icon: '🎯', value: String(myPlayer?.correct || 35), sub: 'isabetli' },
                { icon: '📊', value: `%${successRate}`,               sub: 'başarı oranı' },
                { icon: '🔥', value: String(myPlayer?.total  || 51),  sub: 'toplam tahmin' },
              ].map(s => (
                <div key={s.sub} style={{
                  flex: 1, padding: '14px 12px', borderRadius: 16, textAlign: 'center',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.07)',
                }}>
                  <div style={{ fontSize: 22, marginBottom: 4 }}>{s.icon}</div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: '#fff' }}>{s.value}</div>
                  <div style={{ fontSize: 9, color: '#555', letterSpacing: 1 }}>{s.sub.toUpperCase()}</div>
                </div>
              ))}
            </section>
          </>
        )}

        {/* ── TAB: CHAT ────────────────────────── */}
        {activeTab === 'chat' && (
          <div style={{ marginTop: 16 }}>
            <GroupChat roomName={roomName} onlineCount={3} currentUser={currentUser} userProfile={userProfile} />
          </div>
        )}
      </div>

      <BottomActions copied={copied} setCopied={setCopied} onDuel={() => setDuelOpen(true)} theme={t} />

      {/* Match Prediction Modal */}
      {selectedPredictMatch && (
        <PredictionModal
          match={selectedPredictMatch}
          prediction={matchPredictions[selectedPredictMatch.id]}
          onSave={saveMatchPrediction}
          onClose={() => setSelectedPredictMatch(null)}
          theme={t}
        />
      )}

      {/* Sidebar Drawer Backdrop */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 500,
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            animation: 'overlay-in 0.25s ease both',
          }}
        />
      )}

      {/* Sidebar Drawer Panel */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        bottom: 0,
        width: '85%',
        maxWidth: 380,
        zIndex: 501,
        background: `linear-gradient(185deg, ${withGlowOpacity(t.bg, 0.95)}, rgba(10, 10, 15, 0.98))`,
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderRight: `1px solid ${t.accent}26`,
        boxShadow: sidebarOpen ? `10px 0 40px ${t.glowSoft}` : 'none',
        transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.3s ease',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'Inter, sans-serif',
      }}>
        {/* Drawer Header */}
        <div style={{
          padding: '24px 20px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: `linear-gradient(135deg,${t.accent},${t.accentAlt})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18,
            }}>⚽</div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 900, color: '#fff' }}>
                Vibe<span style={{ color: t.accent }}>Goal</span>
              </div>
              <div style={{ fontSize: 9, color: '#555', letterSpacing: 1.5, textTransform: 'uppercase' }}>Menü</div>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            style={{
              width: 28, height: 28, borderRadius: 8,
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
              color: '#888', fontSize: 12, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >✕</button>
        </div>

        {/* Drawer Tabs (Profile / History / Settings) */}
        <div style={{
          display: 'flex',
          padding: '12px 20px 8px',
          gap: 6,
          borderBottom: '1px solid rgba(255,255,255,0.04)',
        }}>
          {[
            { id: 'profile', label: 'Profil', icon: '👤' },
            { id: 'history', label: 'Tahminler', icon: '📜' },
            { id: 'settings', label: 'Ayarlar', icon: '⚙️' },
          ].map(tab => {
            const isActive = sidebarTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setSidebarTab(tab.id)}
                style={{
                  flex: 1,
                  padding: '8px 4px',
                  borderRadius: 10,
                  border: 'none',
                  background: isActive ? t.accent : 'rgba(255,255,255,0.04)',
                  color: isActive ? t.tabActiveText : '#aaa',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  transition: 'all 0.2s ease',
                }}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            )
          })}
        </div>

        {/* Drawer Content Area */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px',
        }} className="scroll-hide">

          {/* TAB: PROFILE */}
          {sidebarTab === 'profile' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* User Avatar & Info */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{
                  width: 80, height: 80, borderRadius: '50%',
                  background: 'rgba(255,255,255,0.05)',
                  border: `2px solid ${t.accent}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 42,
                  boxShadow: `0 0 20px ${t.glowSoft}`,
                }}>
                  {avatarInput && avatarInput.startsWith('http') ? (
                    <img src={avatarInput} alt="Avatar" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} onError={(e) => { e.target.src = '😎' }} />
                  ) : (
                    avatarInput || '😎'
                  )}
                </div>
                <div style={{ fontSize: 11, color: t.accent, fontWeight: 700 }}>{userProfile?.badge ? `🏆 ${BADGES[userProfile.badge]?.label || 'Çaylak'}` : 'Çaylak'}</div>
              </div>

              {/* Avatar Picker Emojis */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 11, color: '#666', fontWeight: 700, letterSpacing: 0.5 }}>AVATAR SEÇİN</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '10px', background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }}>
                  {['😎', '👨‍💼', '🧑‍🦱', '🧔', '🙄', '🦁', '⚽', '🏆', '🦖', '👾', '🛸', '👽', '👑'].map(emoji => (
                    <button
                      key={emoji}
                      onClick={() => {
                        setAvatarInput(emoji)
                        handleUpdateProfile({ avatar: emoji })
                      }}
                      style={{
                        width: 36, height: 36, borderRadius: 8,
                        background: avatarInput === emoji ? t.accent : 'transparent',
                        border: avatarInput === emoji ? `1px solid ${t.accent}` : '1.5px solid rgba(255,255,255,0.05)',
                        fontSize: 20, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Avatar URL */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 11, color: '#666', fontWeight: 700, letterSpacing: 0.5 }}>VEYA GÖRSEL URL GİRİN</label>
                <input
                  type="text"
                  placeholder="https://example.com/image.png"
                  value={avatarInput && avatarInput.startsWith('http') ? avatarInput : ''}
                  onChange={(e) => {
                    const val = e.target.value
                    setAvatarInput(val || '😎')
                    handleUpdateProfile({ avatar: val || '😎' })
                  }}
                  style={{
                    padding: '10px 14px', borderRadius: 12,
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: '#fff', fontSize: 12, outline: 'none',
                    fontFamily: 'Inter,sans-serif',
                  }}
                />
              </div>

              {/* Username Input */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 11, color: '#666', fontWeight: 700, letterSpacing: 0.5 }}>KULLANICI ADI</label>
                <input
                  type="text"
                  value={usernameInput}
                  onChange={(e) => {
                    const val = e.target.value
                    setUsernameInput(val)
                    if (val.trim()) {
                      handleUpdateProfile({ username: val.trim() })
                    }
                  }}
                  style={{
                    padding: '10px 14px', borderRadius: 12,
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: '#fff', fontSize: 13, outline: 'none',
                    fontFamily: 'Inter,sans-serif',
                  }}
                />
              </div>

              {/* Bio Textarea */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 11, color: '#666', fontWeight: 700, letterSpacing: 0.5 }}>BİYOGRAFİ</label>
                <textarea
                  rows="3"
                  placeholder="Kural tanımaz bir futbol analisti..."
                  value={bioInput}
                  onChange={(e) => {
                    const val = e.target.value
                    setBioInput(val)
                    handleUpdateProfile({ bio: val })
                  }}
                  style={{
                    padding: '10px 14px', borderRadius: 12,
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: '#fff', fontSize: 13, outline: 'none',
                    fontFamily: 'Inter,sans-serif',
                    resize: 'none',
                  }}
                />
              </div>
            </div>
          )}

          {/* TAB: PREDICTION HISTORY */}
          {sidebarTab === 'history' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 11, color: '#666', fontWeight: 700, letterSpacing: 0.5, marginBottom: 4 }}>SON 25 TAHMİNİNİZ</div>
              {getPredictHistory(currentUser.uid).length === 0 ? (
                <div style={{
                  padding: '20px', borderRadius: 12, textAlign: 'center',
                  background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
                  color: '#555', fontSize: 12, fontWeight: 600,
                }}>
                  Henüz tahmin yapmadınız bra!
                </div>
              ) : (
                [...getPredictHistory(currentUser.uid)].reverse().map(item => {
                  const statusColors = {
                    pending: { bg: 'rgba(250, 204, 21, 0.05)', border: 'rgba(250, 204, 21, 0.2)', text: '#facc15', icon: '⏳' },
                    won:     { bg: 'rgba(52, 211, 153, 0.05)', border: 'rgba(52, 211, 153, 0.2)', text: '#34d399', icon: '✅' },
                    lost:    { bg: 'rgba(244, 63, 94, 0.05)', border: 'rgba(244, 63, 94, 0.2)', text: '#f43f5e', icon: '❌' },
                  }
                  const st = statusColors[item.status] || statusColors.pending
                  return (
                    <div
                      key={item.id}
                      style={{
                        padding: '12px 14px', borderRadius: 12,
                        background: 'rgba(255,255,255,0.02)',
                        border: `1.5px solid ${st.border}`,
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1, marginRight: 8 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.matchName}</div>
                        <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{item.predictionText}</div>
                        {item.outcomeText && (
                          <div style={{ fontSize: 10, color: st.text, marginTop: 4, fontWeight: 600 }}>{item.outcomeText}</div>
                        )}
                      </div>
                      <div style={{
                        width: 28, height: 28, borderRadius: 8,
                        background: st.bg,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 14, flexShrink: 0,
                      }}>
                        {st.icon}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          )}

          {/* TAB: SETTINGS */}
          {sidebarTab === 'settings' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* Sound toggle */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 14px', borderRadius: 12,
                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Ses Efektleri</div>
                  <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>Tahmin ve başarı sesleri</div>
                </div>
                {/* Custom sliding pill toggle switch */}
                <div
                  onClick={() => {
                    const nextVal = !soundEnabled
                    setSoundEnabled(nextVal)
                    localStorage.setItem('vg_settings_sound', String(nextVal))
                  }}
                  style={{
                    width: 44, height: 24, borderRadius: 12,
                    background: soundEnabled ? t.accent : 'rgba(255,255,255,0.1)',
                    position: 'relative', cursor: 'pointer',
                    transition: 'background 0.2s ease',
                    boxShadow: soundEnabled ? `0 0 10px ${t.glowSoft}` : 'none',
                  }}
                >
                  <div style={{
                    width: 18, height: 18, borderRadius: '50%',
                    background: soundEnabled ? t.tabActiveText : '#aaa',
                    position: 'absolute', top: 3,
                    left: soundEnabled ? 23 : 3,
                    transition: 'left 0.2s cubic-bezier(0.16, 1, 0.3, 1), background 0.2s',
                  }} />
                </div>
              </div>

              {/* Notification Simulation toggle */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 14px', borderRadius: 12,
                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Simüle Bildirimler</div>
                  <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>Anlık puan güncellemeleri</div>
                </div>
                <div
                  onClick={() => {
                    const nextVal = !notifEnabled
                    setNotifEnabled(nextVal)
                    localStorage.setItem('vg_settings_notif', String(nextVal))
                  }}
                  style={{
                    width: 44, height: 24, borderRadius: 12,
                    background: notifEnabled ? t.accent : 'rgba(255,255,255,0.1)',
                    position: 'relative', cursor: 'pointer',
                    transition: 'background 0.2s ease',
                    boxShadow: notifEnabled ? `0 0 10px ${t.glowSoft}` : 'none',
                  }}
                >
                  <div style={{
                    width: 18, height: 18, borderRadius: '50%',
                    background: notifEnabled ? t.tabActiveText : '#aaa',
                    position: 'absolute', top: 3,
                    left: notifEnabled ? 23 : 3,
                    transition: 'left 0.2s cubic-bezier(0.16, 1, 0.3, 1), background 0.2s',
                  }} />
                </div>
              </div>

              {/* Password Change Section */}
              <div style={{
                display: 'flex', flexDirection: 'column', gap: 10,
                padding: '16px 14px', borderRadius: 14,
                background: 'rgba(244, 63, 94, 0.03)', border: '1px solid rgba(244, 63, 94, 0.15)',
              }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#f43f5e' }}>Şifre Değiştir</div>
                
                {/* Current password */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 10, color: '#888', fontWeight: 700 }}>MEVCUT ŞİFRE</label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => { setCurrentPassword(e.target.value); setPasswordError(''); setPasswordSuccess('') }}
                    style={{
                      padding: '8px 12px', borderRadius: 8,
                      background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)',
                      color: '#fff', fontSize: 12, outline: 'none',
                      fontFamily: 'Inter,sans-serif',
                    }}
                  />
                </div>

                {/* New password */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 10, color: '#888', fontWeight: 700 }}>YENİ ŞİFRE</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => { setNewPassword(e.target.value); setPasswordError(''); setPasswordSuccess('') }}
                    style={{
                      padding: '8px 12px', borderRadius: 8,
                      background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)',
                      color: '#fff', fontSize: 12, outline: 'none',
                      fontFamily: 'Inter,sans-serif',
                    }}
                  />
                </div>

                {passwordError && (
                  <div style={{ fontSize: 10, color: '#ff6b6b', fontWeight: 600 }}>{passwordError}</div>
                )}
                {passwordSuccess && (
                  <div style={{ fontSize: 10, color: '#34d399', fontWeight: 600 }}>{passwordSuccess}</div>
                )}

                <button
                  onClick={() => {
                    if (!currentPassword || !newPassword) {
                      setPasswordError('Lütfen tüm alanları doldurun bra.')
                      return
                    }
                    if (newPassword.length < 6) {
                      setPasswordError('Yeni şifre en az 6 karakter olmalıdır!')
                      return
                    }
                    const users = JSON.parse(localStorage.getItem('vg_users') || '{}')
                    const userRecord = users[currentUser.uid]
                    if (!userRecord) {
                      setPasswordError('Kullanıcı bulunamadı!')
                      return
                    }
                    
                    // Simple hash matching btoa(pw + '_vg_salt_2026')
                    const hashedCurrent = btoa(currentPassword + '_vg_salt_2026')
                    // Check if password match, if user registered through social login it might be empty
                    if (userRecord.password && userRecord.password !== hashedCurrent) {
                      setPasswordError('Mevcut şifre hatalı!')
                      return
                    }

                    // Success — update in database
                    userRecord.password = btoa(newPassword + '_vg_salt_2026')
                    users[currentUser.uid] = userRecord
                    localStorage.setItem('vg_users', JSON.stringify(users))

                    setCurrentPassword('')
                    setNewPassword('')
                    setPasswordError('')
                    setPasswordSuccess('Şifreniz başarıyla güncellendi! 🔑')
                  }}
                  style={{
                    marginTop: 6,
                    padding: '10px', borderRadius: 10,
                    background: 'rgba(244, 63, 94, 0.08)',
                    border: '1px solid rgba(244, 63, 94, 0.3)',
                    color: '#ff4466', fontSize: 12, fontWeight: 700,
                    cursor: 'pointer', transition: 'all 0.2s',
                    boxShadow: '0 0 10px rgba(244, 63, 94, 0.1)',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = 'rgba(244, 63, 94, 0.15)'
                    e.currentTarget.style.borderColor = 'rgba(244, 63, 94, 0.5)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'rgba(244, 63, 94, 0.08)'
                    e.currentTarget.style.borderColor = 'rgba(244, 63, 94, 0.3)'
                  }}
                >
                  Şifreyi Güncelle
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Drawer Footer / Logout Section */}
        <div style={{
          padding: '16px 20px 30px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}>
          {/* Neon Logout Button */}
          <button
            onClick={() => {
              setSidebarOpen(false)
              onLogout()
            }}
            style={{
              padding: '14px', borderRadius: 14,
              background: 'rgba(244, 63, 94, 0.08)',
              border: '1px solid rgba(244, 63, 94, 0.4)',
              color: '#ff4466', fontSize: 13, fontWeight: 800,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: 'all 0.2s ease',
              boxShadow: '0 0 14px rgba(244, 63, 94, 0.15)',
              fontFamily: 'Inter,sans-serif',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(244, 63, 94, 0.15)'
              e.currentTarget.style.boxShadow = '0 0 20px rgba(244, 63, 94, 0.35)'
              e.currentTarget.style.borderColor = 'rgba(244, 63, 94, 0.6)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(244, 63, 94, 0.08)'
              e.currentTarget.style.boxShadow = '0 0 14px rgba(244, 63, 94, 0.15)'
              e.currentTarget.style.borderColor = 'rgba(244, 63, 94, 0.4)'
            }}
          >
            <span>🚪</span> Çıkış Yap (Çıkış)
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────
   PREDICTION MODAL
   ───────────────────────────────────────────────── */
function PredictionModal({ match, prediction, onSave, onClose, theme }) {
  const t = theme || THEMES.night
  const [homeScore, setHomeScore] = useState(prediction ? String(prediction.homeScore) : '')
  const [awayScore, setAwayScore] = useState(prediction ? String(prediction.awayScore) : '')
  const [error, setError] = useState('')

  const isLiveOrFinished = match.status === 'FT' || match.status === '2H' || match.status === '1H' || match.status === 'HT'

  function handleSave() {
    if (homeScore.trim() === '' || awayScore.trim() === '') {
      setError('Lütfen her iki skoru da girin!')
      return
    }
    const h = parseInt(homeScore)
    const a = parseInt(awayScore)
    if (isNaN(h) || isNaN(a) || h < 0 || a < 0) {
      setError('Geçersiz skor girdiniz!')
      return
    }
    onSave(match.id, h, a)
    onClose()
  }

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 400,
          background: 'rgba(0,0,0,0.8)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          animation: 'overlay-in 0.2s ease both',
        }}
      />
      <div style={{
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: 600,
        zIndex: 401,
        background: 'linear-gradient(180deg,#1a1a2e,#121212)',
        borderRadius: '28px 28px 0 0',
        border: `1px solid ${t.accent}33`,
        borderBottom: 'none',
        padding: '24px 20px 40px',
        animation: 'modal-in 0.3s cubic-bezier(.22,.61,.36,1) both',
        boxShadow: `0 -10px 40px ${t.glowSoft}`,
      }}>
        {/* Handle */}
        <div style={{ width: 40, height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.15)', margin: '0 auto 20px' }} />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>🎯 Skor Tahmini Gir</div>
            <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
              {isLiveOrFinished ? 'Maç başladıktan veya bittikten sonra tahmin değiştirilemez' : 'Maç sonucunu doğru tahmin et, puanları kap!'}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32, height: 32, borderRadius: 10,
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
              color: '#888', fontSize: 14, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >✕</button>
        </div>

        {/* VS Display */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 16px', borderRadius: 16,
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)',
          marginBottom: 20,
        }}>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <span style={{ fontSize: 32 }}>{match.homeFlag}</span>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginTop: 6 }}>{match.home}</div>
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, color: t.accent }}>VS</div>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <span style={{ fontSize: 32 }}>{match.awayFlag}</span>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginTop: 6 }}>{match.away}</div>
          </div>
        </div>

        {/* Prediction Form */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 20 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#555', fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>EV SAHİBİ</div>
            <input
              type="number"
              min="0"
              max="20"
              disabled={isLiveOrFinished}
              value={homeScore}
              onChange={e => { setHomeScore(e.target.value); setError('') }}
              style={{
                width: 70, height: 60, borderRadius: 16,
                background: 'rgba(255,255,255,0.05)',
                border: `1.5px solid ${isLiveOrFinished ? 'rgba(255,255,255,0.05)' : t.accent + '44'}`,
                color: '#fff', fontSize: 28, fontWeight: 900, textAlign: 'center',
                fontFamily: 'Inter,sans-serif',
              }}
            />
          </div>
          <div style={{ fontSize: 24, fontWeight: 900, color: '#444', marginTop: 18 }}>-</div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#555', fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>DEPLASMAN</div>
            <input
              type="number"
              min="0"
              max="20"
              disabled={isLiveOrFinished}
              value={awayScore}
              onChange={e => { setAwayScore(e.target.value); setError('') }}
              style={{
                width: 70, height: 60, borderRadius: 16,
                background: 'rgba(255,255,255,0.05)',
                border: `1.5px solid ${isLiveOrFinished ? 'rgba(255,255,255,0.05)' : t.accent + '44'}`,
                color: '#fff', fontSize: 28, fontWeight: 900, textAlign: 'center',
                fontFamily: 'Inter,sans-serif',
              }}
            />
          </div>
        </div>

        {error && (
          <div style={{
            background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.25)',
            borderRadius: 12, padding: '10px 14px', fontSize: 12, color: '#ff6b6b',
            textAlign: 'center', marginBottom: 16, fontWeight: 600,
          }}>{error}</div>
        )}

        {/* Submit button */}
        {!isLiveOrFinished ? (
          <button
            onClick={handleSave}
            style={{
              width: '100%', padding: '16px', borderRadius: 16,
              background: `linear-gradient(135deg,${t.accent},${t.accentAlt})`,
              border: 'none', color: t.tabActiveText,
              fontFamily: 'Inter,sans-serif', fontWeight: 800, fontSize: 15,
              cursor: 'pointer', transition: 'all 0.2s ease',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: `0 0 20px ${t.glowSoft}`,
            }}
          >
            <span>💾</span> Tahmini Kaydet (+5 Katılım Puanı)
          </button>
        ) : (
          <div style={{
            padding: '14px', borderRadius: 14,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            textAlign: 'center', color: '#555', fontSize: 12, fontWeight: 600,
          }}>
            🔒 Bu maç başladı veya bitti. Tahminler kilitli.
          </div>
        )}
      </div>
    </>
  )
}
