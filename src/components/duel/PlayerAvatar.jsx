import { resolvePlayerPhotoUrl, fallbackPhotoUrl } from '../../utils/playerPhotos';

export default function PlayerAvatar({ player, size = 56, theme, border = true }) {
  const t = theme || { accent: '#a3e635', accentBorder: 'rgba(163,230,53,0.3)', accentSoft: 'rgba(163,230,53,0.12)' };
  const src = resolvePlayerPhotoUrl(player);
  const fallback = fallbackPhotoUrl(player?.name);

  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: '50%',
      overflow: 'hidden',
      flexShrink: 0,
      background: t.accentSoft,
      border: border ? `2px solid ${t.accentBorder}` : 'none',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <img
        src={src}
        alt={player?.name || 'Oyuncu'}
        loading="lazy"
        decoding="async"
        style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center' }}
        onError={(e) => {
          if (e.currentTarget.src !== fallback) {
            e.currentTarget.src = fallback;
          }
        }}
      />
    </div>
  );
}
