import { PLAYER_PHOTO_MAP } from '../data/playerPhotoMap';

export function fallbackPhotoUrl(name = 'Player') {
  const label = encodeURIComponent(String(name).trim() || 'Player');
  return `https://ui-avatars.com/api/?name=${label}&background=27272a&color=a3e635&size=256&bold=true&format=png`;
}

/** Oyuncu objesinden görüntülenecek foto URL */
export function resolvePlayerPhotoUrl(player) {
  if (!player) return fallbackPhotoUrl('Player');
  if (player.id && PLAYER_PHOTO_MAP[player.id]) return PLAYER_PHOTO_MAP[player.id];
  if (player.photoUrl && !player.photoUrl.includes('api-sports.io')) return player.photoUrl;
  return fallbackPhotoUrl(player.name);
}

/** Firestore'a yazılacak normalize edilmiş oyuncu */
export function normalizePlayerRecord(player) {
  const photoUrl = resolvePlayerPhotoUrl(player);
  return {
    ...player,
    photoUrl,
    photoId: null,
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
    age: player.age,
    heightCm: player.heightCm,
    marketValueM: player.marketValueM,
  };
}
