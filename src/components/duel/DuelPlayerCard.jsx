import PlayerAvatar from './PlayerAvatar';
import { formatChallengeMetric } from '../../utils/duelEngine';

export default function DuelPlayerCard({ player, theme, onPick, disabled, challenge }) {
  const t = theme;
  const metricLabel = formatChallengeMetric(player, challenge);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onPick?.(player.id)}
      style={{
        flex: 1,
        padding: '16px 12px',
        borderRadius: 16,
        border: `1px solid ${t.border}`,
        background: t.surface,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        fontFamily: 'Inter,sans-serif',
        textAlign: 'center',
        transition: 'transform 0.15s ease, border-color 0.15s ease',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
        <PlayerAvatar player={player} size={72} theme={t} />
      </div>
      <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', marginBottom: 4 }}>{player.name}</div>
      <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>{player.team} · {player.position}</div>
      <div style={{
        fontSize: 15, fontWeight: 900, color: t.accent,
        padding: '6px 10px', borderRadius: 8,
        background: t.accentSoft, border: `1px solid ${t.accentBorder}`,
      }}>
        {metricLabel}
      </div>
    </button>
  );
}
