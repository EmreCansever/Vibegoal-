import { mapPredDuelSide } from '../../utils/predictionDuelEngine';
import { PRED_DUEL_STATUS } from '../../constants/predictionDuel';

export default function PredictionDuelHomeCard({
  theme,
  activeDuel,
  currentUser,
  onJoin,
  onOpenLive,
}) {
  const t = theme;
  const side = activeDuel ? mapPredDuelSide(activeDuel, currentUser?.uid) : null;
  const isLive = activeDuel?.status === PRED_DUEL_STATUS.LIVE;
  const match = activeDuel?.matchSnapshot;

  const max = side ? Math.max(side.myScore, side.theirScore, 1) : 1;
  const myPct = side ? Math.min(100, (side.myScore / max) * 100) : 0;
  const theirPct = side ? Math.min(100, (side.theirScore / max) * 100) : 0;

  return (
    <div style={{
      padding: '16px', borderRadius: 18,
      background: `linear-gradient(145deg, ${t.surface}, rgba(0,0,0,0.25))`,
      border: `1px solid ${t.accentBorder}`,
      boxShadow: `0 0 24px ${t.glowSoft}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12, flexShrink: 0,
          background: t.accentSoft, border: `1px solid ${t.accentBorder}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
        }}>🏁</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: '#fff' }}>Tahmin Düellosu</div>
          <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>
            {isLive ? 'Canlı yarış devam ediyor' : 'Rakip seç, maç seç, tahminlerle yarış'}
          </div>
        </div>
      </div>

      {isLive && side && match ? (
        <>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#ccc', textAlign: 'center', marginBottom: 12 }}>
            {match.homeFlag} {match.home} vs {match.away} {match.awayFlag}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, alignItems: 'center', marginBottom: 10 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: '#888' }}>Sen</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: t.accent }}>{side.myScore}</div>
            </div>
            <div style={{ fontSize: 18 }}>⚡</div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: '#888' }}>{side.theirName}</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#fff' }}>{side.theirScore}</div>
            </div>
          </div>
          <div style={{ position: 'relative', height: 10, borderRadius: 99, background: 'rgba(255,255,255,0.06)', marginBottom: 6, overflow: 'hidden' }}>
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${myPct}%`, background: t.accent, borderRadius: 99, transition: 'width 0.4s ease' }} />
          </div>
          <div style={{ position: 'relative', height: 10, borderRadius: 99, background: 'rgba(255,255,255,0.06)', marginBottom: 14, overflow: 'hidden' }}>
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${theirPct}%`, background: '#64748b', borderRadius: 99, transition: 'width 0.4s ease' }} />
          </div>
          <button
            type="button"
            onClick={onOpenLive}
            style={{
              width: '100%', padding: '11px 14px', borderRadius: 10,
              background: t.accent, color: t.tabActiveText, border: 'none',
              fontWeight: 800, fontSize: 12, cursor: 'pointer', fontFamily: 'Inter,sans-serif',
            }}
          >
            Yarışı Gör
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={onJoin}
          style={{
            width: '100%', padding: '11px 14px', borderRadius: 10,
            background: `linear-gradient(135deg,${t.accent},${t.accentAlt})`,
            color: t.tabActiveText, border: 'none', fontWeight: 800, fontSize: 12,
            cursor: 'pointer', boxShadow: `0 0 14px ${t.glow}`, fontFamily: 'Inter,sans-serif',
          }}
        >
          Hemen Katıl
        </button>
      )}
    </div>
  );
}
