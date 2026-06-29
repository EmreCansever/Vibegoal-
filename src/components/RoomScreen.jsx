import { useState, useEffect, useRef } from 'react'
import { THEMES, withGlowOpacity } from '../App'
import { dbService } from '../services/dataService'

/* ─────────────────────────────────────────────────
   MOCK DATA
───────────────────────────────────────────────── */
const MY_ROOMS = []

const PUBLIC_ROOMS = []

const LEAGUE_OPTIONS = [
  { id: 'wc2026', label: '🌍 Dünya Kupası 2026' },
  { id: 'ucl',   label: '⭐ Şampiyonlar Ligi' },
  { id: 'sl',    label: '🇹🇷 Süper Lig' },
  { id: 'pl',    label: '🏴󠁧󠁢󠁥󠁮󠁧󠁿 Premier Lig' },
  { id: 'laliga', label: '🇪🇸 La Liga' },
  { id: 'seriea', label: '🇮🇹 Serie A' },
  { id: 'bundesliga', label: '🇩🇪 Bundesliga' },
]

/* ─────────────────────────────────────────────────
   EXTRA KEYFRAMES (merged into existing tag)
───────────────────────────────────────────────── */
const ROOM_STYLE_ID = 'vg-room-keyframes'
function injectRoomStyles() {
  if (document.getElementById(ROOM_STYLE_ID)) return
  const s = document.createElement('style')
  s.id = ROOM_STYLE_ID
  s.textContent = `
    @keyframes modal-in {
      from { opacity: 0; transform: translate(-50%, 40px) scale(0.96); }
      to   { opacity: 1; transform: translate(-50%, 0)   scale(1); }
    }
    @keyframes overlay-in {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
    @keyframes room-card-in {
      from { opacity: 0; transform: translateX(-12px); }
      to   { opacity: 1; transform: translateX(0); }
    }
    @keyframes pulse-glow {
      0%,100% { box-shadow: 0 0 12px color-mix(in srgb, var(--vg-accent) 27%, transparent), 0 0 24px color-mix(in srgb, var(--vg-accent) 13%, transparent); }
      50%      { box-shadow: 0 0 20px color-mix(in srgb, var(--vg-accent) 53%, transparent), 0 0 40px color-mix(in srgb, var(--vg-accent) 27%, transparent); }
    }
    @keyframes pulse-red {
      0%,100% { box-shadow: 0 0 12px #ff003344, 0 0 24px #ff003322; }
      50%      { box-shadow: 0 0 20px #ff003388, 0 0 40px #ff003344; }
    }
    @keyframes float {
      0%,100% { transform: translateY(0px);  }
      50%      { transform: translateY(-6px); }
    }
    @keyframes shimmer {
      0%   { background-position: -200% center; }
      100% { background-position:  200% center; }
    }
    @keyframes spin-slow {
      from { transform: rotate(0deg);   }
      to   { transform: rotate(360deg); }
    }
    @keyframes join-success {
      0%   { transform: scale(0.8); opacity: 0; }
      60%  { transform: scale(1.15); }
      100% { transform: scale(1);   opacity: 1; }
    }

    .room-card:hover  { transform: translateX(4px) !important; background: rgba(255,255,255,0.07) !important; }
    .pub-card:hover   { transform: translateY(-2px) !important; border-color: rgba(255,255,255,0.2) !important; }
    .leave-btn:hover  { background: rgba(255,40,40,0.25) !important; border-color: #ff4444 !important; }
    .join-req-btn:hover { filter: brightness(1.15); transform: scale(1.03); }
    .join-req-btn.sent { background: color-mix(in srgb, var(--vg-accent) 15%, transparent) !important; border-color: var(--vg-accent) !important; color: var(--vg-accent) !important; cursor: default !important; }
    .create-btn-main:hover { filter: brightness(1.1); transform: scale(1.03); }
    .code-join-btn:hover   { filter: brightness(1.12); transform: scale(1.03); }
    .modal-close:hover { background: rgba(255,255,255,0.12) !important; }
    .form-input:focus  { outline: none; border-color: var(--vg-accent) !important; box-shadow: 0 0 0 3px color-mix(in srgb, var(--vg-accent) 15%, transparent); }
    .form-select:focus { outline: none; border-color: var(--vg-accent) !important; }
    .back-btn:hover    { background: rgba(255,255,255,0.08) !important; }
    .nav-tab:hover     { background: rgba(255,255,255,0.06) !important; }
    .nav-tab.active    { background: var(--vg-accent) !important; color: var(--vg-tab-text) !important; }
    .scroll-hide::-webkit-scrollbar { display: none; }
  `
  document.head.appendChild(s)
}

/* ─────────────────────────────────────────────────
   SHARED UI ATOMS
───────────────────────────────────────────────── */

function ProgressBar({ value, max, color = 'var(--vg-accent)' }) {
  const pct = Math.min(100, Math.round((value / max) * 100))
  return (
    <div style={{
      height: 4, borderRadius: 99,
      background: 'rgba(255,255,255,0.08)',
      overflow: 'hidden',
    }}>
      <div style={{
        height: '100%', width: `${pct}%`,
        background: color,
        borderRadius: 99,
        transition: 'width 0.6s ease',
      }} />
    </div>
  )
}

function GlassPanel({ children, style = {} }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      border: '1px solid rgba(255,255,255,0.09)',
      borderRadius: 20,
      overflow: 'hidden',
      ...style,
    }}>
      {children}
    </div>
  )
}

/* ─────────────────────────────────────────────────
   MY ROOMS TAB
───────────────────────────────────────────────── */

function MyRoomCard({ room, onEnter, onLeave, idx }) {
  const [leaving, setLeaving] = useState(false)

  function handleLeave(e) {
    e.stopPropagation()
    setLeaving(true)
    setTimeout(() => { setLeaving(false); onLeave(room.id) }, 400)
  }

  return (
    <div
      className="room-card"
      onClick={() => onEnter(room)}
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '16px 18px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        cursor: 'pointer',
        transition: 'all 0.22s ease',
        animation: `room-card-in ${0.15 + idx * 0.07}s ease both`,
        opacity: leaving ? 0.3 : 1,
        transform: leaving ? 'translateX(-30px)' : undefined,
      }}
    >
      {/* Avatar circle */}
      <div style={{
        width: 48, height: 48, borderRadius: 14, flexShrink: 0,
        background: `${room.color}18`,
        border: `1.5px solid ${room.color}44`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22,
        boxShadow: `0 0 14px ${room.color}22`,
      }}>
        {room.avatar}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {room.name}
          </span>
          {room.isAdmin && (
            <span style={{
              padding: '1px 7px', borderRadius: 50,
              background: 'rgba(250,204,21,0.15)', border: '1px solid rgba(250,204,21,0.3)',
              fontSize: 9, color: '#facc15', fontWeight: 700, letterSpacing: 0.5,
            }}>ADMİN</span>
          )}
        </div>
        <div style={{ fontSize: 11, color: '#666', marginBottom: 6 }}>
          {room.league} · {room.members}/{room.maxMembers} üye
        </div>
        <ProgressBar value={room.members} max={room.maxMembers} color={room.color} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 5 }}>
          <span style={{ fontSize: 10, color: '#555' }}>#{room.myRank} sırada · {room.totalPoints.toLocaleString()} puan</span>
          <span style={{ fontSize: 10, color: '#444' }}>{room.lastActivity}</span>
        </div>
      </div>

      {/* Leave btn */}
      <button
        className="leave-btn"
        onClick={handleLeave}
        title="Gruptan Çık"
        style={{
          flexShrink: 0,
          padding: '7px 12px', borderRadius: 10,
          background: 'rgba(255,40,40,0.1)',
          border: '1px solid rgba(255,40,40,0.25)',
          color: '#ff6b6b', fontSize: 11, fontWeight: 700,
          cursor: 'pointer',
          fontFamily: 'Inter,sans-serif',
          transition: 'all 0.2s ease',
          display: 'flex', alignItems: 'center', gap: 5,
          whiteSpace: 'nowrap',
        }}
      >
        <span>🚪</span> Çık
      </button>
    </div>
  )
}

function MyRoomsTab({ rooms, onEnter, onLeave }) {
  return (
    <div style={{ padding: '0 0 24px' }}>
      {rooms.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#555' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🏜️</div>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Henüz hiç odana yok</div>
          <div style={{ fontSize: 12 }}>Yeni bir grup oluştur veya arkadaşının linkiyle katıl.</div>
        </div>
      ) : (
        <GlassPanel style={{ margin: '0 20px', borderRadius: 20 }}>
          {rooms.map((r, i) => (
            <MyRoomCard key={r.id} room={r} onEnter={onEnter} onLeave={onLeave} idx={i} />
          ))}
        </GlassPanel>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────
   DISCOVER TAB
───────────────────────────────────────────────── */

function PublicRoomCard({ room, idx, onRequestSent }) {
  const [sent, setSent] = useState(room.requested)
  const fillPct = Math.round((room.members / room.maxMembers) * 100)
  const almostFull = fillPct >= 85

  function handleRequest() {
    if (sent) return
    setSent(true)
    onRequestSent && onRequestSent(room)
  }

  return (
    <div
      className="pub-card"
      style={{
        padding: '16px 18px',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 18,
        background: 'rgba(255,255,255,0.03)',
        transition: 'all 0.22s ease',
        animation: `room-card-in ${0.12 + idx * 0.06}s ease both`,
        cursor: 'default',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* glow bleed */}
      <div style={{
        position: 'absolute', top: -20, right: -20,
        width: 80, height: 80, borderRadius: '50%',
        background: `radial-gradient(circle,${room.color}15,transparent)`,
        pointerEvents: 'none',
      }} />

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        {/* Avatar */}
        <div style={{
          width: 46, height: 46, borderRadius: 13, flexShrink: 0,
          background: `${room.color}18`,
          border: `1.5px solid ${room.color}40`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22,
        }}>
          {room.avatar}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Name row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' }}>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>{room.name}</span>
            {room.hot && (
              <span style={{
                padding: '2px 8px', borderRadius: 50,
                background: 'rgba(244,63,94,0.2)', border: '1px solid rgba(244,63,94,0.4)',
                fontSize: 9, color: '#f43f5e', fontWeight: 800, letterSpacing: 0.5,
                animation: 'pulse-red 2.5s ease-in-out infinite',
              }}>🔥 TREND</span>
            )}
          </div>

          <div style={{ fontSize: 11, color: '#666', marginBottom: 6 }}>{room.league}</div>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 10, lineHeight: 1.5 }}>{room.description}</div>

          {/* Members progress */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <ProgressBar value={room.members} max={room.maxMembers} color={almostFull ? '#f43f5e' : room.color} />
            </div>
            <span style={{
              fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap',
              color: almostFull ? '#f43f5e' : '#666',
            }}>
              {room.members.toLocaleString()} / {room.maxMembers.toLocaleString()}
              {almostFull && ' 🔴'}
            </span>
          </div>

          {/* CTA */}
          <button
            className={`join-req-btn${sent ? ' sent' : ''}`}
            onClick={handleRequest}
            style={{
              width: '100%', padding: '11px 0', borderRadius: 12,
              border: sent ? '1px solid var(--vg-accent)' : `1px solid ${room.color}55`,
              background: sent ? 'color-mix(in srgb, var(--vg-accent) 12%, transparent)' : `${room.color}18`,
              color: sent ? 'var(--vg-accent)' : room.color,
              fontFamily: 'Inter,sans-serif',
              fontWeight: 700, fontSize: 13,
              cursor: sent ? 'default' : 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              animation: sent ? 'join-success 0.4s ease' : 'none',
            }}
          >
            {sent ? (
              <><span>✅</span> Katıldın!</>
            ) : (
              <><span>📩</span> Odaya Katıl</>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

function DiscoverTab({ theme, publicRooms = [], onJoinRoom }) {
  const t = theme || THEMES.slate
  const [filter, setFilter] = useState('all')
  const leagues = [
    { id: 'all', label: 'Tümü' },
    ...LEAGUE_OPTIONS.map(l => ({ id: l.id, label: l.label.split(' ').slice(1).join(' ') })),
  ]

  const filtered = filter === 'all'
    ? publicRooms
    : publicRooms.filter(r => {
        const opt = LEAGUE_OPTIONS.find(l => l.id === filter)
        return opt && r.league === opt.label
      })

  return (
    <div style={{ padding: '0 20px 24px' }}>
      {/* Filter chips */}
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, marginBottom: 16 }} className="scroll-hide">
        {leagues.map(l => (
          <button
            key={l.id}
            onClick={() => setFilter(l.id)}
            style={{
              padding: '7px 14px', borderRadius: 50, border: 'none',
              background: filter === l.id ? t.glowSoft : 'rgba(255,255,255,0.06)',
              border: filter === l.id ? `1px solid ${t.accent}66` : '1px solid transparent',
              color: filter === l.id ? t.accent : '#888',
              fontFamily: 'Inter,sans-serif', fontWeight: 600, fontSize: 11,
              cursor: 'pointer', transition: 'all 0.18s ease', whiteSpace: 'nowrap',
            }}
          >{l.label}</button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#555' }}>
            <div style={{ fontSize: 42, marginBottom: 12 }}>🏟️</div>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>Henüz açık keşfet odası yok</div>
            <div style={{ fontSize: 11 }}>Yeni bir grup oluştururken "Herkese Açık" seçeneğini aktif et!</div>
          </div>
        ) : (
          filtered.map((r, i) => (
            <PublicRoomCard key={r.id} room={r} idx={i} onRequestSent={onJoinRoom} />
          ))
        )}
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────
   CREATE ROOM MODAL
───────────────────────────────────────────────── */

function Toggle({ value, onChange, theme }) {
  const t = theme || THEMES.slate
  return (
    <button
      onClick={() => onChange(!value)}
      style={{
        width: 48, height: 26, borderRadius: 99,
        background: value ? t.accent : 'rgba(255,255,255,0.12)',
        border: 'none', cursor: 'pointer',
        position: 'relative', transition: 'background 0.25s ease',
        flexShrink: 0,
      }}
    >
      <div style={{
        position: 'absolute',
        top: 3, left: value ? 25 : 3,
        width: 20, height: 20, borderRadius: '50%',
        background: value ? t.tabActiveText : '#666',
        transition: 'left 0.25s ease, background 0.25s ease',
        boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
      }} />
    </button>
  )
}

function CreateRoomModal({ onClose, onCreated, theme }) {
  const t = theme || THEMES.slate
  const [name, setName]       = useState('')
  const [league, setLeague]   = useState('wc2026')
  const [isPublic, setPublic] = useState(false)
  const [loading, setLoading] = useState(false)
  const [done, setDone]       = useState(false)

  function handleCreate() {
    if (!name.trim()) return
    setLoading(true)
    setTimeout(() => {
      setLoading(false)
      setDone(true)
      setTimeout(() => { onCreated({ name: name.trim(), league, isPublic }); onClose() }, 1200)
    }, 900)
  }

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 300,
          background: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          animation: 'overlay-in 0.2s ease both',
        }}
      />

      {/* Modal card */}
      <div style={{
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: 600,
        zIndex: 301,
        background: 'linear-gradient(180deg,#1a1a2e,#121212)',
        borderRadius: '28px 28px 0 0',
        border: '1px solid rgba(255,255,255,0.1)',
        borderBottom: 'none',
        padding: '28px 20px 40px',
        animation: 'modal-in 0.3s cubic-bezier(.22,.61,.36,1) both',
        boxShadow: '0 -20px 60px rgba(0,0,0,0.6)',
        maxHeight: '90vh',
        overflowY: 'auto',
        boxSizing: 'border-box',
      }}>
        {/* Handle */}
        <div style={{
          width: 40, height: 4, borderRadius: 99,
          background: 'rgba(255,255,255,0.15)',
          margin: '0 auto 24px',
        }} />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 19, fontWeight: 800, color: '#fff' }}>✨ Yeni Grup Oluştur</div>
            <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>Arkadaşlarını davet et, iddia başlasın!</div>
          </div>
          <button
            className="modal-close"
            onClick={onClose}
            style={{
              width: 34, height: 34, borderRadius: 10,
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#aaa', fontSize: 16, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.18s ease',
            }}
          >✕</button>
        </div>

        {done ? (
          /* Success state */
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ fontSize: 56, marginBottom: 12, animation: 'join-success 0.5s ease' }}>🎉</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: t.accent, marginBottom: 6 }}>Grup Oluşturuldu!</div>
            <div style={{ fontSize: 13, color: '#666' }}>"{name}" odana hoş geldin!</div>
          </div>
        ) : (
          <>
            {/* Group name */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 11, color: '#888', fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>
                GRUP ADI
              </label>
              <input
                className="form-input"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Örn: Tribün Grubu, Yazılım Grubu..."
                maxLength={40}
                style={{
                  width: '100%', padding: '13px 16px', borderRadius: 14,
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#fff', fontSize: 14, fontFamily: 'Inter,sans-serif',
                  transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
                }}
              />
              <div style={{ textAlign: 'right', fontSize: 10, color: '#555', marginTop: 4 }}>{name.length}/40</div>
            </div>

            {/* League select */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 11, color: '#888', fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>
                LİG SEÇ
              </label>
              <div style={{ position: 'relative' }}>
                <select
                  className="form-select"
                  value={league}
                  onChange={e => setLeague(e.target.value)}
                  style={{
                    width: '100%', padding: '13px 40px 13px 16px', borderRadius: 14,
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#fff', fontSize: 14, fontFamily: 'Inter,sans-serif',
                    appearance: 'none', WebkitAppearance: 'none',
                    cursor: 'pointer', transition: 'border-color 0.2s ease',
                  }}
                >
                  {LEAGUE_OPTIONS.map(l => (
                    <option key={l.id} value={l.id} style={{ background: '#1a1a2e' }}>
                      {l.label}
                    </option>
                  ))}
                </select>
                <span style={{
                  position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
                  color: '#666', fontSize: 12, pointerEvents: 'none',
                }}>▼</span>
              </div>
            </div>

            {/* Privacy toggle */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 16px', borderRadius: 14,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              marginBottom: 24,
            }}>
              <div>
                <div style={{ fontSize: 13, color: '#e5e7eb', fontWeight: 600 }}>
                  {isPublic ? '🌐 Herkese Açık Keşfet Odası' : '🔒 Gizli Oda'}
                </div>
                <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
                  {isPublic ? 'Keşfet sekmesinde görünür, herkes başvurabilir.' : 'Sadece davet linki ile katılınır.'}
                </div>
              </div>
              <Toggle value={isPublic} onChange={setPublic} theme={t} />
            </div>

            {/* Create button */}
            <button
              className="create-btn-main"
              onClick={handleCreate}
              disabled={!name.trim() || loading}
              style={{
                width: '100%', padding: '16px', borderRadius: 16,
                background: name.trim()
                  ? `linear-gradient(135deg,${t.accent},${t.accentAlt})`
                  : 'rgba(255,255,255,0.08)',
                border: 'none',
                color: name.trim() ? t.tabActiveText : '#555',
                fontFamily: 'Inter,sans-serif', fontWeight: 800, fontSize: 15,
                cursor: name.trim() ? 'pointer' : 'default',
                transition: 'all 0.2s ease',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                boxShadow: name.trim() ? `0 0 24px ${t.glow}` : 'none',
              }}
            >
              {loading ? (
                <span style={{ animation: 'spin-slow 1s linear infinite', display: 'inline-block' }}>⚙️</span>
              ) : (
                <><span>🚀</span> Grubu Oluştur</>
              )}
            </button>
          </>
        )}
      </div>
    </>
  )
}

/* ─────────────────────────────────────────────────
   JOIN BY CODE PANEL
───────────────────────────────────────────────── */

function buildRoomFromCode(rawCode) {
  const normalized = rawCode.trim().toUpperCase()
  const slug = normalized.replace(/^VG-?/, '').split('-')[0] || 'ODA'
  const name = slug === 'TRIBUN' ? 'Tribün Grubu' : `Grup ${slug}`
  return {
    id: `joined-${normalized}`,
    name,
    league: '🌍 Dünya Kupası 2026',
    leagueId: 'wc2026',
    members: 1,
    maxMembers: 20,
    myRank: 1,
    totalPoints: 0,
    avatar: '🔑',
    color: 'var(--vg-accent)',
    lastActivity: 'şimdi',
    isAdmin: false,
  }
}

function JoinByCode({ onJoined, theme }) {
  const t = theme || THEMES.slate
  const [code, setCode]     = useState('')
  const [status, setStatus] = useState('idle') // idle | loading | success | error
  const inputRef = useRef(null)

  function handleJoin() {
    if (!code.trim()) return
    setStatus('loading')
    setTimeout(() => {
      const ok = code.trim().toUpperCase().startsWith('VG')
      if (ok) {
        setStatus('success')
        onJoined && onJoined(buildRoomFromCode(code))
      } else {
        setStatus('error')
        setTimeout(() => setStatus('idle'), 3000)
      }
    }, 900)
  }

  const borderColor = status === 'success'
    ? t.accent
    : status === 'error'
      ? '#ff4444'
      : code
        ? withGlowOpacity(t.glowSoft, 0.3)
        : 'rgba(255,255,255,0.1)'
  const bgColor = status === 'success'
    ? withGlowOpacity(t.glowSoft, 0.08)
    : status === 'error'
      ? 'rgba(255,68,68,0.08)'
      : 'rgba(255,255,255,0.04)'

  return (
    <div style={{ margin: '0 20px 24px' }}>
      <GlassPanel style={{ padding: '20px 18px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'color-mix(in srgb, var(--vg-accent) 15%, transparent)',
            border: '1px solid color-mix(in srgb, var(--vg-accent) 30%, transparent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18,
          }}>🔑</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Kod ile Odaya Katıl</div>
            <div style={{ fontSize: 11, color: '#666' }}>Davet linkini veya oda kodunu yapıştır</div>
          </div>
        </div>

        {/* Input row */}
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <input
              ref={inputRef}
              className="form-input"
              value={code}
              onChange={e => { setCode(e.target.value); setStatus('idle') }}
              onKeyDown={e => e.key === 'Enter' && handleJoin()}
              placeholder="VG-TRIBUN-2026 veya https://..."
              style={{
                width: '100%', padding: '13px 16px', borderRadius: 12,
                background: bgColor,
                border: `1px solid ${borderColor}`,
                color: '#fff', fontSize: 13, fontFamily: 'Inter,sans-serif',
                transition: 'all 0.22s ease',
                letterSpacing: code.length > 0 && !code.includes('http') ? 1 : 0,
              }}
            />
            {code.length > 0 && (
              <button
                onClick={() => { setCode(''); setStatus('idle'); inputRef.current?.focus() }}
                style={{
                  position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 16,
                }}
              >✕</button>
            )}
          </div>

          <button
            className="code-join-btn"
            onClick={handleJoin}
            disabled={!code.trim() || status === 'loading'}
            style={{
              padding: '13px 18px', borderRadius: 12, border: 'none',
              background: code.trim()
                ? 'linear-gradient(135deg,var(--vg-accent-alt),var(--vg-accent))'
                : 'rgba(255,255,255,0.07)',
              color: code.trim() ? '#fff' : '#555',
              fontFamily: 'Inter,sans-serif', fontWeight: 700, fontSize: 13,
              cursor: code.trim() ? 'pointer' : 'default',
              transition: 'all 0.2s ease', flexShrink: 0,
              minWidth: 64,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            {status === 'loading'
              ? <span style={{ animation: 'spin-slow 0.8s linear infinite', display: 'inline-block' }}>⏳</span>
              : '→ Gir'
            }
          </button>
        </div>

        {/* Feedback */}
        {status === 'success' && (
          <div style={{
            marginTop: 12, padding: '10px 14px', borderRadius: 10,
            background: withGlowOpacity(t.glowSoft, 0.1), border: `1px solid ${withGlowOpacity(t.glowSoft, 0.25)}`,
            fontSize: 12, color: t.accent, fontWeight: 600,
            animation: 'join-success 0.4s ease',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span>🎉</span> Odaya başarıyla katıldın! Dashboard açılıyor...
          </div>
        )}
        {status === 'error' && (
          <div style={{
            marginTop: 12, padding: '10px 14px', borderRadius: 10,
            background: 'rgba(255,68,68,0.1)', border: '1px solid rgba(255,68,68,0.25)',
            fontSize: 12, color: '#ff6b6b', fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span>❌</span> Geçersiz kod veya link. Tekrar dene!
          </div>
        )}

        <div style={{ marginTop: 10, fontSize: 10, color: '#444', textAlign: 'center' }}>
          Örnek kod formatı: <span style={{ color: '#555', fontFamily: 'monospace' }}>VG-TRIBUN-2026</span>
        </div>
      </GlassPanel>
    </div>
  )
}

/* ─────────────────────────────────────────────────
   MAIN ROOM SCREEN
───────────────────────────────────────────────── */

function filterFakeRooms(rooms) {
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

export default function RoomScreen({ onNavigate, theme, currentUser }) {
  useEffect(() => { injectRoomStyles() }, [])
  const t = theme || THEMES.slate

  const [myRooms, setMyRooms]       = useState(() => {
    try {
      const saved = localStorage.getItem(`vg_my_rooms_${currentUser?.uid}`)
      return saved ? filterFakeRooms(JSON.parse(saved)) : []
    } catch {
      return []
    }
  })

  const [publicRooms, setPublicRooms] = useState(() => {
    try {
      const saved = localStorage.getItem('vg_public_rooms')
      return saved ? filterFakeRooms(JSON.parse(saved)) : []
    } catch {
      return []
    }
  })

  const [activeTab, setActiveTab]   = useState('mine')
  const [showCreate, setShowCreate] = useState(false)
  const [toast, setToast]           = useState(null)

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem(`vg_my_rooms_${currentUser.uid}`, JSON.stringify(myRooms))
    }
  }, [myRooms, currentUser])

  useEffect(() => {
    localStorage.setItem('vg_public_rooms', JSON.stringify(publicRooms))
  }, [publicRooms])

  const LEAGUE_MAPPING = {
    '🌍 Dünya Kupası 2026': 'wc2026',
    '⭐ Şampiyonlar Ligi': 'ucl',
    '🇹🇷 Süper Lig': 'sl',
    '🏴󠁧󠁢󠁥󠁮󠁧󠁿 Premier Lig': 'pl',
    '🇪🇸 La Liga': 'laliga',
    '🇮🇹 Serie A': 'seriea',
    '🇩🇪 Bundesliga': 'bundesliga'
  }

  function handleEnterRoom(room) {
    const leagueId = room.leagueId || LEAGUE_MAPPING[room.league] || 'wc2026'
    onNavigate('dashboard', { roomId: room.id, roomName: room.name, leagueId })
  }

  function handleLeaveRoom(id) {
    setMyRooms(prev => prev.filter(r => r.id !== id))
    setPublicRooms(prev => prev.filter(r => r.id !== id))
  }

  function handleCreated(roomData) {
    const leagueOpt = LEAGUE_OPTIONS.find(l => l.id === roomData.league)
    const userPoints = currentUser ? (dbService.getProfile(currentUser.uid)?.totalPoints || 0) : 0
    const newRoom = {
      id: `r-${Date.now()}`,
      name: roomData.name,
      league: leagueOpt?.label || roomData.league,
      leagueId: roomData.league,
      members: 1,
      maxMembers: 20,
      myRank: 1,
      totalPoints: userPoints,
      avatar: '✨',
      color: t.accent,
      lastActivity: 'şimdi',
      isAdmin: true,
      description: roomData.isPublic ? 'Kullanıcı tarafından oluşturulan açık tahmin odası.' : '',
    }
    setMyRooms(prev => [newRoom, ...prev])
    if (roomData.isPublic) {
      setPublicRooms(prev => [newRoom, ...prev])
    }
    setToast(`🎉 "${roomData.name}" odası oluşturuldu!`)
    setTimeout(() => setToast(null), 3500)
  }

  function handleJoined(room) {
    const userPoints = currentUser ? (dbService.getProfile(currentUser.uid)?.totalPoints || 0) : 0
    const joinedRoom = { ...room, totalPoints: userPoints }
    setMyRooms(prev => (prev.some(r => r.id === joinedRoom.id) ? prev : [joinedRoom, ...prev]))
    setToast(`🎉 "${joinedRoom.name}" odasına katıldın! Dashboard açılıyor...`)
    setTimeout(() => {
      setToast(null)
      onNavigate('dashboard', { roomId: joinedRoom.id, roomName: joinedRoom.name })
    }, 1500)
  }

  return (
    <div className="vg-app-shell" style={{
      minHeight: '100dvh',
      background: t.bg,
      fontFamily: 'Inter, sans-serif',
      color: '#fff',
      position: 'relative',
      paddingBottom: 'calc(40px + env(safe-area-inset-bottom, 0px))',
      transition: 'background 0.4s ease',
      overflowX: 'hidden',
    }}>
      {/* Ambient glows — container içinde */}
      <div style={{
        position: 'absolute', top: '8%', right: '-10%',
        width: 240, height: 240, borderRadius: '50%',
        background: `radial-gradient(circle,${withGlowOpacity(t.glowSoft, 0.06)},transparent 70%)`,
        pointerEvents: 'none', zIndex: 0,
        transition: 'background 0.4s ease',
      }} />
      <div style={{
        position: 'absolute', bottom: '30%', left: '-10%',
        width: 260, height: 260, borderRadius: '50%',
        background: `radial-gradient(circle,${withGlowOpacity(t.glowSoft, 0.04)},transparent 70%)`,
        pointerEvents: 'none', zIndex: 0,
        transition: 'background 0.4s ease',
      }} />

      <div style={{ position: 'relative', zIndex: 1 }}>

        {/* ── HEADER ─────────────────────────────── */}
        <header style={{
          padding: '20px 20px 0',
          position: 'sticky', top: 0, zIndex: 100,
          background: 'linear-gradient(180deg,#121212 75%,transparent)',
        }}>
          {/* Top row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            {/* Back + Title */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                className="back-btn"
                onClick={() => onNavigate('dashboard')}
                style={{
                  width: 38, height: 38, borderRadius: 11,
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#aaa', fontSize: 17, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background 0.18s ease',
                }}
              >←</button>
              <div>
                <div style={{ fontSize: 19, fontWeight: 900, letterSpacing: '-0.5px' }}>
                  Oda <span style={{ color: t.accent }}>Yönetimi</span>
                </div>
                <div style={{ fontSize: 10, color: '#555', letterSpacing: 1.5, textTransform: 'uppercase' }}>
                  Gruplar & Keşfet
                </div>
              </div>
            </div>

            {/* + New Room button */}
            <button
              className="create-btn-main"
              onClick={() => setShowCreate(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '10px 16px', borderRadius: 50,
                background: `linear-gradient(135deg,${t.accent},${t.accentAlt})`,
                border: 'none', color: t.tabActiveText,
                fontFamily: 'Inter,sans-serif', fontWeight: 800, fontSize: 12,
                cursor: 'pointer', transition: 'all 0.2s ease',
                boxShadow: `0 0 18px ${t.glow}`,
                animation: `${t.pulseAnim} 2.5s ease-in-out infinite`,
              }}
            >
              <span style={{ fontSize: 15 }}>+</span> Yeni Grup
            </button>
          </div>

          {/* Tabs */}
          <div style={{
            display: 'flex', gap: 4, padding: '4px',
            background: 'rgba(255,255,255,0.05)',
            borderRadius: 14,
            marginBottom: 2,
          }}>
            {[
              { id: 'mine',    label: '🏠 Gruplarım',      count: myRooms.length },
              { id: 'discover', label: '🔍 Odaları Keşfet', count: publicRooms.length },
            ].map(tab => (
              <button
                key={tab.id}
                className={`nav-tab${activeTab === tab.id ? ' active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  flex: 1, padding: '11px 8px', borderRadius: 10,
                  background: activeTab === tab.id ? t.accent : 'transparent',
                  border: 'none', cursor: 'pointer',
                  color: activeTab === tab.id ? t.tabActiveText : '#888',
                  fontFamily: 'Inter,sans-serif', fontWeight: 700, fontSize: 13,
                  transition: 'all 0.22s ease',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                {tab.label}
                <span style={{
                  padding: '1px 7px', borderRadius: 50,
                  background: activeTab === tab.id ? 'rgba(18,18,18,0.2)' : 'rgba(255,255,255,0.08)',
                  fontSize: 10, fontWeight: 800,
                }}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: 'linear-gradient(90deg,transparent,#2a2a2a,transparent)', margin: '14px 0 0' }} />
        </header>

        {/* ── JOIN BY CODE (always visible) ──────── */}
        <div style={{ padding: '20px 0 0' }}>
          <JoinByCode onJoined={handleJoined} theme={t} />
        </div>

        {/* ── TAB CONTENT ────────────────────────── */}
        {activeTab === 'mine'
          ? <MyRoomsTab rooms={myRooms} onEnter={handleEnterRoom} onLeave={handleLeaveRoom} />
          : <DiscoverTab theme={t} publicRooms={publicRooms} onJoinRoom={handleJoined} />
        }
      </div>

      {/* ── CREATE MODAL ───────────────────────── */}
      {showCreate && (
        <CreateRoomModal
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
          theme={t}
        />
      )}

      {/* ── TOAST ──────────────────────────────── */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)',
          zIndex: 500,
          padding: '12px 22px', borderRadius: 14,
          background: t.glowSoft,
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: `1px solid ${t.accent}4d`,
          color: t.accent, fontWeight: 700, fontSize: 13,
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          animation: 'join-success 0.4s ease',
          whiteSpace: 'nowrap',
          maxWidth: '90vw',
        }}>
          {toast}
        </div>
      )}
    </div>
  )
}
