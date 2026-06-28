import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebase';
import { withGlowOpacity } from '../App';

/* ─────────────────────────────────────────────────
   HELPER UTILITIES
   ───────────────────────────────────────────────── */
function getStatValue(teamStats, statName, defaultValue = 0) {
  const stat = teamStats?.statistics?.find(s => s.type === statName);
  if (!stat || stat.value === null) return defaultValue;
  const valStr = String(stat.value).replace('%', '');
  return Number(valStr) || 0;
}

function getPositionEmoji(pos) {
  switch (String(pos).toUpperCase()) {
    case 'G': return '🧤'; // Goalkeeper
    case 'D': return '🧱'; // Defender
    case 'M': return '🛡️'; // Midfielder
    case 'F': return '⚽'; // Forward
    default:  return '🏃';
  }
}

/* ─────────────────────────────────────────────────
   SUB-COMPONENT: PROGRESS BAR COMPARATOR
   ───────────────────────────────────────────────── */
function StatRow({ label, homeVal, awayVal, isPercentage = false, theme }) {
  const total = homeVal + awayVal;
  const homePct = total > 0 ? (homeVal / total) * 100 : 50;
  const awayPct = total > 0 ? (awayVal / total) * 100 : 50;

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: 13,
        fontWeight: 700,
        color: '#aaa',
        marginBottom: 6
      }}>
        <span style={{ color: homeVal >= awayVal ? theme.accent : '#fff', minWidth: 40 }}>
          {homeVal}{isPercentage ? '%' : ''}
        </span>
        <span style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, color: '#777' }}>
          {label}
        </span>
        <span style={{ color: awayVal >= homeVal ? theme.accent : '#fff', minWidth: 40, textAlign: 'right' }}>
          {awayVal}{isPercentage ? '%' : ''}
        </span>
      </div>
      <div style={{
        height: 8,
        borderRadius: 4,
        background: 'rgba(255,255,255,0.05)',
        display: 'flex',
        overflow: 'hidden'
      }}>
        <div style={{
          width: `${homePct}%`,
          background: `linear-gradient(90deg, ${theme.accent}, ${theme.accentAlt || theme.accent})`,
          height: '100%',
          transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)'
        }} />
        <div style={{
          width: `${awayPct}%`,
          background: 'rgba(255,255,255,0.12)',
          height: '100%',
          transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)'
        }} />
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────
   MAIN COMPONENT: MATCH DETAIL PAGE
   ───────────────────────────────────────────────── */
export default function MatchDetail({ theme }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const t = theme || { bg: '#121212', accent: '#00ff88', border: 'rgba(255,255,255,0.09)' };

  const [match, setMatch] = useState(null);
  const [loading, setLoading] = useState(!!db);
  const [activeTab, setActiveTab] = useState('stats'); // 'stats' | 'lineups'

  // Firestore Real-time document subscription
  useEffect(() => {
    if (!db) {
      return;
    }
    const docRef = doc(db, 'live_matches', String(id));
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        setMatch(docSnap.data());
      } else {
        setMatch(null);
      }
      setLoading(false);
    }, (error) => {
      console.error('[MatchDetail] Firestore subscription failed:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [id]);

  if (loading) {
    return (
      <div style={{
        height: '100vh',
        background: t.bg,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Inter, sans-serif',
        color: '#fff'
      }}>
        <div style={{
          width: 32,
          height: 32,
          border: `3px solid ${t.accent}22`,
          borderTop: `3px solid ${t.accent}`,
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
          marginBottom: 12
        }} />
        <span style={{ fontSize: 13, color: '#666', fontWeight: 600 }}>Maç Detayları Yükleniyor...</span>
      </div>
    );
  }

  if (!match) {
    return (
      <div style={{
        height: '100vh',
        background: t.bg,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Inter, sans-serif',
        color: '#fff',
        padding: 20
      }}>
        <div style={{ fontSize: 44, marginBottom: 12 }}>🏟️</div>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Maç Bulunamadı</div>
        <div style={{ fontSize: 12, color: '#555', textAlign: 'center', marginBottom: 20 }}>
          Bu maça ait canlı veri bulunamadı veya maç henüz başlamadı.
        </div>
        <button
          onClick={() => navigate('/dashboard')}
          style={{
            padding: '10px 24px',
            borderRadius: 12,
            background: `linear-gradient(135deg, ${t.accent}33, ${t.accent}15)`,
            border: `1px solid ${t.accent}44`,
            color: t.accent,
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: 'Inter, sans-serif'
          }}
        >
          Ana Sayfaya Dön
        </button>
      </div>
    );
  }

  // Parse Stats values
  const homeStats = match.statistics?.[0] || {};
  const awayStats = match.statistics?.[1] || {};

  const shotsOnGoalH = getStatValue(homeStats, 'Shots on Goal');
  const shotsOnGoalA = getStatValue(awayStats, 'Shots on Goal');
  const totalShotsH = getStatValue(homeStats, 'Total Shots');
  const totalShotsA = getStatValue(awayStats, 'Total Shots');
  const possessionH = getStatValue(homeStats, 'Ball Possession', 50);
  const possessionA = getStatValue(awayStats, 'Ball Possession', 50);
  const passesH = getStatValue(homeStats, 'Passes %');
  const passesA = getStatValue(awayStats, 'Passes %');
  const cornersH = getStatValue(homeStats, 'Corner Kicks');
  const cornersA = getStatValue(awayStats, 'Corner Kicks');
  const foulsH = getStatValue(homeStats, 'Fouls');
  const foulsA = getStatValue(awayStats, 'Fouls');

  // Lineups parsing
  const homeLineup = match.lineups?.[0] || {};
  const awayLineup = match.lineups?.[1] || {};

  return (
    <div style={{
      height: '100vh',
      background: t.bg,
      color: '#fff',
      maxWidth: 600,
      margin: '0 auto',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      fontFamily: 'Inter, sans-serif',
      overflow: 'hidden'
    }}>
      {/* Background decoration */}
      <div style={{
        position: 'fixed', top: '10%', right: '-20%',
        width: 300, height: 300, borderRadius: '50%',
        background: `radial-gradient(circle, ${withGlowOpacity(t.glowSoft, 0.06)}, transparent 70%)`,
        pointerEvents: 'none', zIndex: 0
      }} />

      {/* HEADER SCOREBOARD */}
      <div style={{
        padding: '16px 20px',
        borderBottom: `1px solid ${t.border}`,
        position: 'relative',
        zIndex: 1,
        background: 'rgba(0,0,0,0.1)'
      }}>
        {/* Back navigation */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
          <button
            onClick={() => navigate('/dashboard')}
            style={{
              background: 'none', border: 'none', color: '#888',
              fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center',
              padding: 0
            }}
          >
            ←
          </button>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#666', marginLeft: 12 }}>
            CANLI SKOR & DETAYLAR
          </span>
        </div>

        {/* Teams and Score grid */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
          {/* Home team */}
          <div style={{ width: '40%', textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 4 }}>🏠</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {match.home}
            </div>
          </div>

          {/* Core Scoreboard */}
          <div style={{ width: '20%', textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 900, color: t.accent, letterSpacing: 2 }}>
              {match.homeScore} - {match.awayScore}
            </div>
            <div style={{
              display: 'inline-block',
              marginTop: 6,
              padding: '2px 8px',
              borderRadius: 60,
              background: 'rgba(255,0,0,0.1)',
              border: '1px solid rgba(255,0,0,0.2)',
              fontSize: 10,
              fontWeight: 800,
              color: '#ff4444'
            }}>
              ⏱️ {match.minute}'
            </div>
          </div>

          {/* Away team */}
          <div style={{ width: '40%', textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 4 }}>✈️</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {match.away}
            </div>
          </div>
        </div>
      </div>

      {/* TABS SELECTOR */}
      <div style={{ padding: '12px 20px', zIndex: 1 }}>
        <div style={{
          display: 'flex',
          gap: 6,
          padding: '4px',
          background: 'rgba(255,255,255,0.03)',
          borderRadius: 14,
          border: `1px solid ${t.border}`
        }}>
          <button
            onClick={() => setActiveTab('stats')}
            style={{
              flex: 1,
              padding: '10px 8px',
              borderRadius: 10,
              border: 'none',
              background: activeTab === 'stats' ? t.accent : 'transparent',
              color: activeTab === 'stats' ? '#121212' : '#888',
              fontFamily: 'Inter, sans-serif',
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            📊 İstatistikler
          </button>
          <button
            onClick={() => setActiveTab('lineups')}
            style={{
              flex: 1,
              padding: '10px 8px',
              borderRadius: 10,
              border: 'none',
              background: activeTab === 'lineups' ? t.accent : 'transparent',
              color: activeTab === 'lineups' ? '#121212' : '#888',
              fontFamily: 'Inter, sans-serif',
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            📋 Kadrolar
          </button>
        </div>
      </div>

      {/* CONTENT SCROLL AREA */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '0 20px 80px',
        zIndex: 1
      }} className="scroll-hide">

        {/* TAB 1: STATISTICS */}
        {activeTab === 'stats' && (
          <div style={{
            background: 'rgba(255,255,255,0.02)',
            border: `1px solid ${t.border}`,
            borderRadius: 20,
            padding: 20,
            animation: 'slide-in 0.3s ease both'
          }}>
            <StatRow label="Topla Oynama" homeVal={possessionH} awayVal={possessionA} isPercentage={true} theme={t} />
            <StatRow label="Kaleyi Bulan Şut" homeVal={shotsOnGoalH} awayVal={shotsOnGoalA} theme={t} />
            <StatRow label="Toplam Şut" homeVal={totalShotsH} awayVal={totalShotsA} theme={t} />
            <StatRow label="Pas İsabeti" homeVal={passesH} awayVal={passesA} isPercentage={true} theme={t} />
            <StatRow label="Korner" homeVal={cornersH} awayVal={cornersA} theme={t} />
            <StatRow label="Faul" homeVal={foulsH} awayVal={foulsA} theme={t} />
          </div>
        )}

        {/* TAB 2: LINEUPS */}
        {activeTab === 'lineups' && (
          <div style={{ animation: 'slide-in 0.3s ease both', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Formation & Managers summary */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '12px 16px',
              borderRadius: 16,
              background: 'rgba(255,255,255,0.02)',
              border: `1px solid ${t.border}`,
              fontSize: 12
            }}>
              <div>
                <div style={{ color: '#666', fontWeight: 600, marginBottom: 2 }}>DİZİLİŞ</div>
                <div style={{ fontWeight: 800, color: t.accent }}>{homeLineup.formation || 'Belirsiz'}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: '#666', fontWeight: 600, marginBottom: 2 }}>DİZİLİŞ</div>
                <div style={{ fontWeight: 800, color: t.accent }}>{awayLineup.formation || 'Belirsiz'}</div>
              </div>
            </div>

            {/* Starting XIs */}
            <div style={{
              display: 'flex',
              gap: 16,
              background: 'rgba(255,255,255,0.02)',
              border: `1px solid ${t.border}`,
              borderRadius: 20,
              padding: 16
            }}>
              {/* Home Team Starting XI */}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: t.accent, borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 8, marginBottom: 12 }}>
                  {match.home} İlk 11
                </div>
                {homeLineup.startXI?.map(({ player }) => (
                  <div key={player.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span style={{ fontSize: 12 }} title={player.pos}>{getPositionEmoji(player.pos)}</span>
                    <span style={{
                      width: 20, height: 20, borderRadius: '50%',
                      background: 'rgba(255,255,255,0.05)',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 700, color: '#aaa'
                    }}>{player.number}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#eee', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {player.name}
                    </span>
                  </div>
                )) || <div style={{ fontSize: 11, color: '#555' }}>Kadrolar henüz girilmedi</div>}
              </div>

              {/* Away Team Starting XI */}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: t.accent, borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 8, marginBottom: 12 }}>
                  {match.away} İlk 11
                </div>
                {awayLineup.startXI?.map(({ player }) => (
                  <div key={player.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span style={{ fontSize: 12 }} title={player.pos}>{getPositionEmoji(player.pos)}</span>
                    <span style={{
                      width: 20, height: 20, borderRadius: '50%',
                      background: 'rgba(255,255,255,0.05)',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 700, color: '#aaa'
                    }}>{player.number}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#eee', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {player.name}
                    </span>
                  </div>
                )) || <div style={{ fontSize: 11, color: '#555' }}>Kadrolar henüz girilmedi</div>}
              </div>
            </div>

            {/* Substitutes */}
            <div style={{
              display: 'flex',
              gap: 16,
              background: 'rgba(255,255,255,0.02)',
              border: `1px solid ${t.border}`,
              borderRadius: 20,
              padding: 16
            }}>
              {/* Home substitutes */}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#777', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 6, marginBottom: 10 }}>
                  Yedekler
                </div>
                {homeLineup.substitutes?.map(({ player }) => (
                  <div key={player.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, opacity: 0.75 }}>
                    <span style={{
                      width: 18, height: 18, borderRadius: '50%',
                      background: 'rgba(255,255,255,0.05)',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 9, fontWeight: 600, color: '#aaa'
                    }}>{player.number}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#ccc' }}>{player.name}</span>
                  </div>
                )) || <div style={{ fontSize: 11, color: '#555' }}>Yedekler yok</div>}
              </div>

              {/* Away substitutes */}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#777', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 6, marginBottom: 10 }}>
                  Yedekler
                </div>
                {awayLineup.substitutes?.map(({ player }) => (
                  <div key={player.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, opacity: 0.75 }}>
                    <span style={{
                      width: 18, height: 18, borderRadius: '50%',
                      background: 'rgba(255,255,255,0.05)',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 9, fontWeight: 600, color: '#aaa'
                    }}>{player.number}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#ccc' }}>{player.name}</span>
                  </div>
                )) || <div style={{ fontSize: 11, color: '#555' }}>Yedekler yok</div>}
              </div>
            </div>

            {/* Managers */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '12px 16px',
              borderRadius: 16,
              background: 'rgba(255,255,255,0.02)',
              border: `1px solid ${t.border}`,
              fontSize: 12,
              marginBottom: 16
            }}>
              <div>
                <div style={{ color: '#666', fontWeight: 600, marginBottom: 2 }}>TEKNİK DİREKTÖR</div>
                <div style={{ fontWeight: 800, color: '#eee' }}>{homeLineup.coach?.name || 'Belirsiz'}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: '#666', fontWeight: 600, marginBottom: 2 }}>TEKNİK DİREKTÖR</div>
                <div style={{ fontWeight: 800, color: '#eee' }}>{awayLineup.coach?.name || 'Belirsiz'}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
