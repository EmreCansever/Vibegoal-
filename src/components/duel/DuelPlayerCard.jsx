import PlayerAvatar from './PlayerAvatar';
import { enrichPlayerFromSeed, resolvePlayerPhotoUrl } from '../../utils/playerPhotos';
import { playPickSound } from '../../utils/audioEngine';

export default function DuelPlayerCard({ player, theme, onPick, disabled }) {
  const t = theme;
  const displayPlayer = enrichPlayerFromSeed(player);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        playPickSound();
        onPick?.(player.id);
      }}
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
        <PlayerAvatar player={displayPlayer} size={72} theme={t} />
      </div>
      <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', marginBottom: 10 }}>{displayPlayer.name}</div>
      <div style={{
        fontSize: 13, fontWeight: 900, color: t.accent,
        padding: '8px 14px', borderRadius: 8,
        background: t.accentSoft, border: `1px solid ${t.accentBorder}`,
        letterSpacing: 0.5,
      }}>
        Seç
      </div>
    </button>
  );
}
