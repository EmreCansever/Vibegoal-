/* ═══════════════════════════════════════════════════════════════
   VibeGoal — Football API Service
   Endpoint : https://v3.football.api-sports.io
   Provider : API-Football (RapidAPI)

   ⚠️  BURAYI DOLDUR: Kendi RapidAPI anahtarını buraya yapıştır
       → https://rapidapi.com/api-sports/api/api-football
═══════════════════════════════════════════════════════════════ */

import { translateTeamName } from '../utils/teamNamesTr'

const BASE_URL = 'https://v3.football.api-sports.io'

// In-memory cache to prevent exceeding the daily 100 requests limit
const apiCache = new Map()
const CACHE_TTL = 45000 // 45 seconds

/* ─────────────────────────────────────────────────
   Lig ID haritası  (API-Football standart ID'leri)
───────────────────────────────────────────────── */
export const LEAGUE_IDS = {
  wc2026: 1,    // FIFA World Cup
  ucl:    2,    // UEFA Champions League
  sl:     203,  // Türkiye Süper Lig
  pl:     39,   // England Premier League
  laliga: 140,  // İspanya La Liga
  seriea: 135,  // İtalya Serie A
  bundesliga: 78, // Almanya Bundesliga
}

/* ─────────────────────────────────────────────────
   Sezon yılı (2024-25 sezonu için 2024 kullanılır)
───────────────────────────────────────────────── */
export const CURRENT_SEASON = 2024

/* ─────────────────────────────────────────────────
   Temel fetch wrapper — headers + hata yönetimi
───────────────────────────────────────────────── */
async function apiFetch(path, params = {}) {
  // Load API Key from environment variable
  const apiKey = import.meta.env.VITE_FOOTBALL_API_KEY || 'BURAYA_RAPIDAPI_KEY_YAZAR'

  // Anahtar yoksa/placeholder ise: ağ isteği yapma, hata fırlatma.
  // Boş yanıt döndür → çağıran katman sessizce fallback mock verilere düşer.
  if (!apiKey || apiKey === 'BURAYA_RAPIDAPI_KEY_YAZAR') {
    return { response: [] }
  }

  const url = new URL(`${BASE_URL}${path}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))

  const cacheKey = url.toString()
  const cached = apiCache.get(cacheKey)
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
    return cached.data
  }

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'x-apisports-key': apiKey,
      'x-rapidapi-key':  apiKey,
    },
  })

  // HTTP hatası (401/403/429 vb.): fırlatma, sessizce boş dön → fallback mock.
  if (!res.ok) {
    return { response: [] }
  }

  const json = await res.json()

  // API 200 dönse de errors içerebilir (geçersiz/aboneliksiz anahtar dahil).
  // Konsolu kirletmeden sessizce boş dön → çağıran katman mock'a düşer.
  if (json.errors && Object.keys(json.errors).length > 0) {
    return { response: [] }
  }

  // Store in cache
  apiCache.set(cacheKey, { data: json, timestamp: Date.now() })
  return json
}

/* ─────────────────────────────────────────────────
   API fixture objesini → LiveMatchCard formatına dönüştür
───────────────────────────────────────────────── */
function mapFixtureToMatch(fixture) {
  const { fixture: fix, teams, goals, league, score, events, statistics } = fixture

  // Maç durumu → dakika
  const statusShort = fix.status?.short || ''
  const elapsed     = fix.status?.elapsed

  // Ev/deplasman bayrak URL'lerinden emoji kalmıyorsa boş bırak
  // (Gerçek API bayrak PNG URL döner, emoji ile değiştiriyoruz geçici olarak)
  const FLAG_FALLBACK = { home: '🏠', away: '✈️' }

  return {
    id:        fix.id,
    home:      translateTeamName(teams.home.name),
    away:      translateTeamName(teams.away.name),
    homeScore: goals.home ?? '-',
    awayScore: goals.away ?? '-',
    homeFlag:  FLAG_FALLBACK.home,   // gerçek projede teams.home.logo kullanılır
    awayFlag:  FLAG_FALLBACK.away,
    minute:    elapsed ?? 0,
    status:    statusShort,          // 'NS' | '1H' | 'HT' | '2H' | 'FT' | ...
    leagueId:  league.id,
    date:      fix.date,
    halftimeScore: {
      home: score?.halftime?.home ?? null,
      away: score?.halftime?.away ?? null,
    },
    // Puan hesaplaması için ekstra alanlar
    isCalculated: false,
    events: events ?? [],
    statistics: statistics ?? [],
  }
}

/* ─────────────────────────────────────────────────
   fetchMatches — belirli bir lig + sezon için
   bugünkü / aktif maçları çeker.

   @param leagueId  number  — API-Football lig ID'si
   @param season    number  — Sezon yılı (ör: 2024)
   @returns         Array<MappedMatch>
───────────────────────────────────────────────── */
export async function fetchMatches(leagueId, season = CURRENT_SEASON) {
  // Bugünün tarihini YYYY-MM-DD formatında al
  const today = new Date().toISOString().split('T')[0]

  const data = await apiFetch('/fixtures', {
    league: leagueId,
    season,
    date: today,
  })

  const fixtures = data.response || []

  // Tüm fixture'ları map et
  return fixtures.map(mapFixtureToMatch)
}

/* ─────────────────────────────────────────────────
   fetchLiveMatches — SADECE canlı maçları çeker
   (NS/1H/HT/2H durumundaki maçlar)

   @param leagueId  number
   @returns         Array<MappedMatch>
───────────────────────────────────────────────── */
export async function fetchLiveMatches(leagueId) {
  const data = await apiFetch('/fixtures', {
    league: leagueId,
    live: 'all',
  })

  const fixtures = data.response || []
  return fixtures.map(mapFixtureToMatch)
}

/* ─────────────────────────────────────────────────
   fetchWeeklyFixtures — bu haftanın fikstürü
   (canlı maç yoksa fallback olarak kullanılır)

   @param leagueId  number
   @param season    number
   @returns         Array<MappedMatch>
───────────────────────────────────────────────── */
export async function fetchWeeklyFixtures(leagueId, season = CURRENT_SEASON) {
  const now   = new Date()
  const from  = now.toISOString().split('T')[0]
  const toD   = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const to    = toD.toISOString().split('T')[0]

  const data = await apiFetch('/fixtures', {
    league: leagueId,
    season,
    from,
    to,
  })

  const fixtures = data.response || []
  return fixtures.map(mapFixtureToMatch).slice(0, 6) // max 6 kart
}

/** Tek maç detayı — fikstür + istatistik + kadro */
export async function fetchMatchDetail(fixtureId) {
  const id = Number(fixtureId)
  if (!id) return null

  const [fixtureRes, statsRes, lineupsRes] = await Promise.all([
    apiFetch('/fixtures', { id }),
    apiFetch('/fixtures/statistics', { fixture: id }),
    apiFetch('/fixtures/lineups', { fixture: id }),
  ])

  const fixtureItem = fixtureRes.response?.[0]
  if (!fixtureItem) return null

  const statistics = statsRes.response || []
  const lineups = lineupsRes.response || []

  return {
    ...mapFixtureToMatch({ ...fixtureItem, statistics }),
    statistics,
    lineups,
  }
}

/** Maç kartından detay sayfasına geçerken anlık önbellek */
export function cacheMatchSnapshot(match) {
  if (!match?.id) return
  try {
    sessionStorage.setItem(`vg_match_${match.id}`, JSON.stringify(match))
  } catch { /* ignore */ }
}

export function loadCachedMatch(fixtureId) {
  try {
    const raw = sessionStorage.getItem(`vg_match_${String(fixtureId)}`)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}
