import { PLAYERS_SEED } from '../data/playersSeed';

/** API-Sports oyuncu foto CDN */
export const API_SPORTS_PHOTO_BASE = 'https://media.api-sports.io/football/players';

const SEED_BY_ID = Object.fromEntries(PLAYERS_SEED.map((p) => [p.id, p]));

const BLOCKED_PHOTO_HOSTS = [
  'unsplash.com',
  'randomuser.me',
  'ui-avatars.com',
  'pravatar.cc',
  'picsum.photos',
  'placehold.co',
  'placeholder.com',
  'dicebear.com',
  'loremflickr.com',
  'i.pravatar.cc',
];

export function buildApiSportsPhotoUrl(playerId) {
  const id = Number(playerId);
  if (!Number.isFinite(id) || id <= 0) return null;
  return `${API_SPORTS_PHOTO_BASE}/${id}.png`;
}

/** Seed'den eksik photoId / istatistikleri tamamla */
export function enrichPlayerFromSeed(player) {
  if (!player?.id) return player || null;
  const seed = SEED_BY_ID[player.id];
  if (!seed) return player;
  return {
    ...seed,
    ...player,
    photoId: player.photoId ?? seed.photoId,
    name: player.name || seed.name,
    team: player.team || seed.team,
    position: player.position || seed.position,
    age: player.age ?? seed.age,
    heightCm: player.heightCm ?? seed.heightCm,
    marketValueM: player.marketValueM ?? seed.marketValueM,
  };
}

/** API-Sports CDN için sayısal oyuncu kimliği (photoId / apiPlayerId / sayısal id) */
export function resolveApiSportsPlayerId(player) {
  if (!player) return null;
  const enriched = enrichPlayerFromSeed(player);
  for (const key of ['photoId', 'apiPlayerId', 'id']) {
    const n = Number(enriched[key]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function isAllowedDirectPhotoUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('data:image/')) return true;

  try {
    const { hostname } = new URL(trimmed);
    const host = hostname.replace(/^www\./, '').toLowerCase();
    if (BLOCKED_PHOTO_HOSTS.some((blocked) => host.includes(blocked))) return false;
    return host === 'media.api-sports.io';
  } catch {
    return false;
  }
}

/** Oyuncu objesinden görüntülenecek foto URL — sahte link yok, yoksa API-Sports CDN */
export function resolvePlayerPhotoUrl(player) {
  if (!player) return null;

  const enriched = enrichPlayerFromSeed(player);
  const direct = enriched.photoUrl || enriched.photo || enriched.photoURL;

  if (isAllowedDirectPhotoUrl(direct)) {
    return direct.trim();
  }

  return buildApiSportsPhotoUrl(resolveApiSportsPlayerId(enriched));
}

export function hasPlayerPhoto(player) {
  return !!resolvePlayerPhotoUrl(player);
}

/** Firestore'a yazılacak normalize edilmiş oyuncu */
export function normalizePlayerRecord(player) {
  const enriched = enrichPlayerFromSeed(player);
  const photoId = resolveApiSportsPlayerId(enriched);
  const photoUrl = resolvePlayerPhotoUrl({ ...enriched, photoId });

  return {
    ...enriched,
    photoId,
    photoUrl: photoUrl || null,
    updatedAt: Date.now(),
  };
}

/** Draft kartı için hafif snapshot */
export function toDraftCardSnapshot(player) {
  const enriched = enrichPlayerFromSeed(player);
  const photoId = resolveApiSportsPlayerId(enriched);
  const photoUrl = resolvePlayerPhotoUrl({ ...enriched, photoId });

  return {
    id: enriched.id,
    name: enriched.name,
    team: enriched.team,
    position: enriched.position,
    photoUrl: photoUrl || null,
    photoId,
    age: enriched.age,
    heightCm: enriched.heightCm,
    marketValueM: enriched.marketValueM,
  };
}
