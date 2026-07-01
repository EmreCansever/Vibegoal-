const CDN_BASE = 'https://media.api-sports.io/football/players';

export function photoUrlFromId(photoId) {
  if (!photoId) return '';
  return `${CDN_BASE}/${photoId}.png`;
}

export function fallbackPhotoUrl(name = 'Player') {
  const label = encodeURIComponent(String(name).trim() || 'Player');
  return `https://ui-avatars.com/api/?name=${label}&background=27272a&color=a3e635&size=256&bold=true&format=png`;
}

/** Oyuncu objesinden görüntülenecek foto URL */
export function resolvePlayerPhotoUrl(player) {
  if (!player) return fallbackPhotoUrl('Player');
  if (player.photoUrl) return player.photoUrl;
  if (player.photoId) return photoUrlFromId(player.photoId);
  return fallbackPhotoUrl(player.name);
}

/** Firestore'a yazılacak normalize edilmiş oyuncu */
export function normalizePlayerRecord(player) {
  const photoUrl = player.photoUrl || photoUrlFromId(player.photoId) || fallbackPhotoUrl(player.name);
  return {
    ...player,
    photoUrl,
    updatedAt: Date.now(),
  };
}

/** Draft kartı için hafif snapshot */
export function toDraftCardSnapshot(player) {
  return {
    id: player.id,
    name: player.name,
    team: player.team,
    position: player.position,
    photoUrl: resolvePlayerPhotoUrl(player),
    photoId: player.photoId || null,
  };
}
