/** API-Sports oyuncu foto CDN */
export const API_SPORTS_PHOTO_BASE = 'https://media.api-sports.io/football/players';

export function buildApiSportsPhotoUrl(photoId) {
  const id = Number(photoId);
  if (!Number.isFinite(id) || id <= 0) return null;
  return `${API_SPORTS_PHOTO_BASE}/${id}.png`;
}

/** Oyuncu objesinden görüntülenecek foto URL — boşsa null */
export function resolvePlayerPhotoUrl(player) {
  if (!player) return null;

  const direct = player.photoUrl || player.photo || player.photoURL;
  if (typeof direct === 'string' && direct.trim()) {
    return direct.trim();
  }

  return buildApiSportsPhotoUrl(player.photoId);
}

export function hasPlayerPhoto(player) {
  return !!resolvePlayerPhotoUrl(player);
}

/** Firestore'a yazılacak normalize edilmiş oyuncu */
export function normalizePlayerRecord(player) {
  const photoId = player.photoId ?? player.apiPlayerId ?? null;
  const photoUrl = resolvePlayerPhotoUrl({ ...player, photoId });

  return {
    ...player,
    photoId,
    photoUrl: photoUrl || null,
    updatedAt: Date.now(),
  };
}

/** Draft kartı için hafif snapshot */
export function toDraftCardSnapshot(player) {
  const photoUrl = resolvePlayerPhotoUrl(player);
  return {
    id: player.id,
    name: player.name,
    team: player.team,
    position: player.position,
    photoUrl: photoUrl || null,
    photoId: player.photoId ?? null,
    age: player.age,
    heightCm: player.heightCm,
    marketValueM: player.marketValueM,
  };
}
