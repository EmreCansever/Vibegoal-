import PlayerAvatar from './PlayerAvatar';

export default function DuelPlayerCard({ player, theme, onPick, disabled, revealValue, challenge }) {
  const t = theme;
  const metric = challenge?.metric;

  let hiddenValue = null;
  if (revealValue && player) {
    if (metric === 'marketValueM') hiddenValue = `${player.marketValueM}M€`;
    else if (metric === 'age') hiddenValue = `${player.age} yaş`;
    else if (metric === 'heightCm') hiddenValue = `${player.heightCm} cm`;
  }

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
      {revealValue ? (
        <div style={{
          fontSize: 13, fontWeight: 900, color: t.accent,
          animation: 'join-success 0.5s ease',
        }}>
          {hiddenValue}
        </div>
      ) : (
        <div style={{
          fontSize: 10, color: '#555', letterSpacing: 1, fontWeight: 700,
          padding: '4px 8px', borderRadius: 8, background: 'rgba(0,0,0,0.2)',
        }}>
          ??? GİZLİ
        </div>
      )}
    </button>
  );
}
