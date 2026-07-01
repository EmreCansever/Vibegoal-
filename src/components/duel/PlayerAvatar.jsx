import { useEffect, useState } from 'react';
import { resolvePlayerPhotoUrl } from '../../utils/playerPhotos';

function DefaultPlayerSilhouette({ size = 56 }) {
  const iconSize = Math.round(size * 0.52);
  return (
    <svg
      width={iconSize}
      height={iconSize}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="4" fill="#71717a" />
      <path
        d="M4 20c0-3.5 3.1-6.5 8-6.5s8 3 8 6.5"
        fill="#71717a"
      />
    </svg>
  );
}

export default function PlayerAvatar({ player, size = 56, theme, border = true }) {
  const t = theme || {
    accentBorder: 'rgba(163,230,53,0.3)',
    accentSoft: 'rgba(163,230,53,0.12)',
  };
  const src = resolvePlayerPhotoUrl(player);
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [player?.id, src]);

  const showPhoto = !!src && !imgFailed;

  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: '50%',
      overflow: 'hidden',
      flexShrink: 0,
      background: showPhoto ? t.accentSoft : '#3f3f46',
      border: border ? `2px solid ${showPhoto ? t.accentBorder : 'rgba(113,113,122,0.45)'}` : 'none',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      {showPhoto ? (
        <img
          src={src}
          alt={player?.name || 'Oyuncu'}
          loading="lazy"
          decoding="async"
          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center' }}
          onError={() => setImgFailed(true)}
        />
      ) : (
        <DefaultPlayerSilhouette size={size} />
      )}
    </div>
  );
}
