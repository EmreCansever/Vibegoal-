import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchMatchDetail, loadCachedMatch, cacheMatchSnapshot } from '../services/footballApi';
import { withGlowOpacity } from '../App';
import { playClickSound } from '../utils/audioEngine';

function getStatValue(teamStats, statName, defaultValue = 0) {
  const stat = teamStats?.statistics?.find(s => s.type === statName);
  if (!stat || stat.value === null) return defaultValue;
  const valStr = String(stat.value).replace('%', '');
  return Number(valStr) || 0;
}

function getPositionEmoji(pos) {
  switch (String(pos).toUpperCase()) {
    case 'G': return '🧤';
    case 'D': return '🧱';
    case 'M': return '🛡️';
    case 'F': return '⚽';
    default:  return '🏃';
  }
}

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
        marginBottom: 6,
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
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${homePct}%`,
          background: `linear-gradient(90deg, ${theme.accent}, ${theme.accentAlt || theme.accent})`,
          height: '100%',
          transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
        }} />
        <div style={{
          width: `${awayPct}%`,
          background: 'rgba(255,255,255,0.12)',
          height: '100%',
          transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
        }} />
      </div>
    </div>
  );
}

export default function MatchDetail({ theme }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const t = theme || { bg: '#18181b', accent: '#a3e635', border: 'rgba(255,255,255,0.09)' };

  const [match, setMatch] = useState(() => loadCachedMatch(id));
  const [loading, setLoading] = useState(!loadCachedMatch(id));
  const [fetchError, setFetchError] = useState('');
  const [activeTab, setActiveTab] = useState('stats');

  useEffect(() => {
    let cancelled = false;
    const cached = loadCachedMatch(id);
    if (cached) {
      setMatch(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setFetchError('');

    fetchMatchDetail(id)
      .then((detail) => {
        if (cancelled) return;
        if (detail) {
          setMatch(detail);
          cacheMatchSnapshot(detail);
        } else if (!cached) {
          setMatch(null);
          setFetchError('Maç verisi API\'den alınamadı.');
        }
      })
      .catch((err) => {
        console.error('[MatchDetail] API fetch failed:', err);
        if (!cancelled && !cached) {
          setMatch(null);
          setFetchError(err?.message || 'Bağlantı hatası');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [id]);

  if (loading && !match) {
    return (
      <div className="vg-app-shell vg-screen-fill vg-screen-standalone" style={{
        background: t.bg,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Inter, sans-serif',
      }}>
        <div style={{
          width: 36, height: 36,
          border: `3px solid ${t.accent}33`,
          borderTopColor: t.accent,
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
          marginBottom: 12,
        }} />
        <span style={{ fontSize: 13, color: '#666', fontWeight: 600 }}>Maç Detayları Yükleniyor...</span>
      </div>
    );
  }

  if (!match) {
    return (
      <div className="vg-app-shell vg-screen-fill vg-screen-standalone" style={{
        background: t.bg,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Inter, sans-serif',
        color: '#fff',
        padding: 20,
      }}>
        <div style={{ fontSize: 44, marginBottom: 12 }}>🏟️</div>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Maç Bulunamadı</div>
        <div style={{ fontSize: 12, color: '#555', textAlign: 'center', marginBottom: 20 }}>
          {fetchError || 'Bu maça ait veri bulunamadı veya maç sona ermiş olabilir.'}
        </div>
        <button
          onClick={() => { playClickSound(); navigate('/dashboard'); }}
          style={{
            padding: '10px 24px',
            borderRadius: 12,
            background: `linear-gradient(135deg, ${t.accent}33, ${t.accent}15)`,
            border: `1px solid ${t.accent}44`,
            color: t.accent,
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: 'Inter, sans-serif',
          }}
        >
          Ana Sayfaya Dön
        </button>
      </div>
    );
  }

  const homeStats = match.statistics?.[0] || {};
  const awayStats = match.statistics?.[1] || {};
  const hasStats = (match.statistics?.length || 0) >= 2;

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

  const homeLineup = match.lineups?.[0] || {};
  const awayLineup = match.lineups?.[1] || {};
  const hasLineups = !!(homeLineup.startXI?.length || awayLineup.startXI?.length);

  const isLive = ['1H', '2H', 'HT', 'ET', 'P', 'LIVE'].includes(match.status);
  const minuteLabel = isLive && match.minute ? `${match.minute}'` : (match.status || '—');

  return (
    <div className="vg-app-shell vg-screen-fill vg-screen-standalone" style={{
      background: t.bg,
      color: '#fff',
      fontFamily: 'Inter, sans-serif',
      overflowX: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: '10%', right: '-10%',
        width: 260, height: 260, borderRadius: '50%',
        background: `radial-gradient(circle, ${withGlowOpacity(t.glowSoft, 0.06)}, transparent 70%)`,
        pointerEvents: 'none', zIndex: 0,
      }} />

      <div className="vg-top-bar" style={{
        borderBottom: `1px solid ${t.border}`,
        background: 'rgba(0,0,0,0.1)',
        position: 'relative',
        zIndex: 1,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
          <button
            onClick={() => { playClickSound(); navigate('/dashboard'); }}
            style={{
              background: 'none', border: 'none', color: '#888',
              fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center',
              padding: 0,
            }}
          >
            ←
          </button>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#666', marginLeft: 12 }}>
            CANLI SKOR & DETAYLAR
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
          <div style={{ width: '40%', textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 4 }}>{match.homeFlag || '🏠'}</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {match.home}
            </div>
          </div>

          <div style={{ width: '20%', textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 900, color: t.accent, letterSpacing: 2 }}>
              {match.homeScore} - {match.awayScore}
            </div>
            <div style={{
              display: 'inline-block',
              marginTop: 6,
              padding: '2px 8px',
              borderRadius: 60,
              background: isLive ? 'rgba(255,0,0,0.1)' : 'rgba(255,255,255,0.06)',
              border: isLive ? '1px solid rgba(255,0,0,0.2)' : `1px solid ${t.border}`,
              fontSize: 10,
              fontWeight: 800,
              color: isLive ? '#ff4444' : '#888',
            }}>
              {isLive ? '⏱️' : '🏁'} {minuteLabel}
            </div>
          </div>

          <div style={{ width: '40%', textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 4 }}>{match.awayFlag || '✈️'}</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {match.away}
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: '12px 20px', zIndex: 1, flexShrink: 0 }}>
        <div style={{
          display: 'flex',
          gap: 6,
          padding: '4px',
          background: 'rgba(255,255,255,0.03)',
          borderRadius: 14,
          border: `1px solid ${t.border}`,
        }}>
          {['stats', 'lineups'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                flex: 1,
                padding: '10px 8px',
                borderRadius: 10,
                border: 'none',
                background: activeTab === tab ? t.accent : 'transparent',
                color: activeTab === tab ? '#121212' : '#888',
                fontFamily: 'Inter, sans-serif',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              {tab === 'stats' ? '📊 İstatistikler' : '📋 Kadrolar'}
            </button>
          ))}
        </div>
      </div>

      <div style={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        padding: '0 20px 16px',
        zIndex: 1,
      }} className="scroll-hide">

        {activeTab === 'stats' && (
          <div style={{
            background: 'rgba(255,255,255,0.02)',
            border: `1px solid ${t.border}`,
            borderRadius: 20,
            padding: 20,
            animation: 'slide-in 0.3s ease both',
          }}>
            {hasStats ? (
              <>
                <StatRow label="Topla Oynama" homeVal={possessionH} awayVal={possessionA} isPercentage theme={t} />
                <StatRow label="Kaleyi Bulan Şut" homeVal={shotsOnGoalH} awayVal={shotsOnGoalA} theme={t} />
                <StatRow label="Toplam Şut" homeVal={totalShotsH} awayVal={totalShotsA} theme={t} />
                <StatRow label="Pas İsabeti" homeVal={passesH} awayVal={passesA} isPercentage theme={t} />
                <StatRow label="Korner" homeVal={cornersH} awayVal={cornersA} theme={t} />
                <StatRow label="Faul" homeVal={foulsH} awayVal={foulsA} theme={t} />
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '24px 12px', color: '#666', fontSize: 13 }}>
                İstatistikler henüz yayınlanmadı veya maç başlamadı.
              </div>
            )}
          </div>
        )}

        {activeTab === 'lineups' && (
          <div style={{ animation: 'slide-in 0.3s ease both', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {hasLineups ? (
              <>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  borderRadius: 16,
                  background: 'rgba(255,255,255,0.02)',
                  border: `1px solid ${t.border}`,
                  fontSize: 12,
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

                <div style={{
                  display: 'flex',
                  gap: 16,
                  background: 'rgba(255,255,255,0.02)',
                  border: `1px solid ${t.border}`,
                  borderRadius: 20,
                  padding: 16,
                }}>
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
                          fontSize: 10, fontWeight: 700, color: '#aaa',
                        }}>{player.number}</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#eee', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {player.name}
                        </span>
                      </div>
                    ))}
                  </div>

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
                          fontSize: 10, fontWeight: 700, color: '#aaa',
                        }}>{player.number}</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#eee', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {player.name}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '24px 12px', color: '#666', fontSize: 13 }}>
                Kadrolar henüz açıklanmadı.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
