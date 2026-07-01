#!/usr/bin/env node
/**
 * VibeGoal — Firestore Players API-Sports Sync
 *
 * Geliştirici tarafından manuel tetiklenir. Oyuncuları isimle değil,
 * API player.id ile upsert eder.
 *
 * Kullanım:
 *   npm run sync:players -- --league=39 --season=2024
 *   npm run sync:players -- --league=140 --season=2023 --delay=350
 *
 * Gerekli .env değişkenleri:
 *   VITE_FOOTBALL_API_KEY veya FOOTBALL_API_KEY
 *   VITE_FIREBASE_PROJECT_ID veya FIREBASE_PROJECT_ID
 *   GOOGLE_APPLICATION_CREDENTIALS  (service account JSON yolu)
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import admin from 'firebase-admin';

dotenv.config();

const BASE_URL = 'https://v3.football.api-sports.io';
const PLAYERS_COLLECTION = 'players';
const BATCH_LIMIT = 500;
const DEFAULT_DELAY_MS = 300;
const DEFAULT_LEAGUE = 39;
const DEFAULT_SEASON = 2024;

function log(step, message, extra) {
  const ts = new Date().toISOString();
  const suffix = extra !== undefined ? ` ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : '';
  console.log(`[${ts}] [${step}] ${message}${suffix}`);
}

function parseArgs(argv) {
  const out = {
    league: DEFAULT_LEAGUE,
    season: DEFAULT_SEASON,
    delay: DEFAULT_DELAY_MS,
    dryRun: false,
  };

  for (const arg of argv) {
    if (arg === '--dry-run') {
      out.dryRun = true;
      continue;
    }
    if (arg.startsWith('--league=')) out.league = Number(arg.slice('--league='.length));
    if (arg.startsWith('--season=')) out.season = Number(arg.slice('--season='.length));
    if (arg.startsWith('--delay=')) out.delay = Number(arg.slice('--delay='.length));
  }

  if (!Number.isFinite(out.league) || out.league <= 0) {
    throw new Error('Geçersiz --league parametresi.');
  }
  if (!Number.isFinite(out.season) || out.season < 2000) {
    throw new Error('Geçersiz --season parametresi.');
  }
  if (!Number.isFinite(out.delay) || out.delay < 0) {
    throw new Error('Geçersiz --delay parametresi.');
  }

  return out;
}

function getEnv(name, fallbacks = []) {
  for (const key of [name, ...fallbacks]) {
    const val = process.env[key];
    if (val && String(val).trim()) return String(val).trim();
  }
  return null;
}

function sleep(ms) {
  return new Promise((r) => { setTimeout(r, ms); });
}

function parseHeightCm(raw) {
  if (raw == null) return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const match = String(raw).match(/(\d{2,3})/);
  return match ? Number(match[1]) : null;
}

function mapApiPosition(raw) {
  const p = String(raw || '').toLowerCase();
  if (p.includes('goalkeeper') || p === 'g') return 'GK';
  if (p.includes('defender') || p === 'd') return 'DEF';
  if (p.includes('midfielder') || p === 'm') return 'MID';
  if (p.includes('attacker') || p.includes('forward') || p === 'f') return 'FWD';
  return 'MID';
}

function pickPrimaryStatistics(statistics, leagueId) {
  if (!Array.isArray(statistics) || statistics.length === 0) return null;
  const inLeague = statistics.find((s) => s?.league?.id === leagueId);
  return inLeague || statistics[0];
}

function buildPhotoUrl(apiPlayerId) {
  return `https://media.api-sports.io/football/players/${apiPlayerId}.png`;
}

function mapApiEntryToFirestore(entry, leagueId, season) {
  const apiPlayer = entry?.player;
  if (!apiPlayer?.id) return null;

  const apiPlayerId = Number(apiPlayer.id);
  if (!Number.isFinite(apiPlayerId) || apiPlayerId <= 0) return null;

  const stats = pickPrimaryStatistics(entry.statistics, leagueId);
  const teamName = stats?.team?.name || null;
  const teamId = stats?.team?.id ?? null;
  const position = mapApiPosition(stats?.games?.position);

  return {
    id: String(apiPlayerId),
    apiPlayerId,
    photoId: apiPlayerId,
    name: apiPlayer.name || `${apiPlayer.firstname || ''} ${apiPlayer.lastname || ''}`.trim() || 'Unknown',
    firstname: apiPlayer.firstname || null,
    lastname: apiPlayer.lastname || null,
    team: teamName,
    teamId,
    position,
    age: Number.isFinite(Number(apiPlayer.age)) ? Number(apiPlayer.age) : null,
    heightCm: parseHeightCm(apiPlayer.height),
    nationality: apiPlayer.nationality || null,
    birthDate: apiPlayer.birth?.date || null,
    photoUrl: buildPhotoUrl(apiPlayerId),
    leagueId,
    season,
    source: 'api-sports',
    syncedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: Date.now(),
  };
}

function initFirebaseAdmin() {
  if (admin.apps.length > 0) return admin.firestore();

  const projectId = getEnv('FIREBASE_PROJECT_ID', ['VITE_FIREBASE_PROJECT_ID']);
  const credPath = getEnv('GOOGLE_APPLICATION_CREDENTIALS', ['FIREBASE_SERVICE_ACCOUNT_PATH']);
  const credJson = getEnv('FIREBASE_SERVICE_ACCOUNT_JSON');

  if (!projectId) {
    throw new Error('FIREBASE_PROJECT_ID veya VITE_FIREBASE_PROJECT_ID .env içinde tanımlı olmalı.');
  }

  let credential;
  if (credJson) {
    credential = admin.credential.cert(JSON.parse(credJson));
    log('INIT', 'Firebase Admin: FIREBASE_SERVICE_ACCOUNT_JSON kullanılıyor.');
  } else if (credPath) {
    const abs = resolve(process.cwd(), credPath);
    if (!existsSync(abs)) {
      throw new Error(`Service account dosyası bulunamadı: ${abs}`);
    }
    const serviceAccount = JSON.parse(readFileSync(abs, 'utf8'));
    credential = admin.credential.cert(serviceAccount);
    log('INIT', 'Firebase Admin: GOOGLE_APPLICATION_CREDENTIALS kullanılıyor.', abs);
  } else {
    credential = admin.credential.applicationDefault();
    log('INIT', 'Firebase Admin: applicationDefault() kullanılıyor.');
  }

  admin.initializeApp({ credential, projectId });
  return admin.firestore();
}

async function fetchPlayersPage(apiKey, league, season, page) {
  const url = new URL(`${BASE_URL}/players`);
  url.searchParams.set('league', String(league));
  url.searchParams.set('season', String(season));
  url.searchParams.set('page', String(page));

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'x-apisports-key': apiKey,
      Accept: 'application/json',
    },
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg = body?.errors ? JSON.stringify(body.errors) : res.statusText;
    throw new Error(`API hatası (HTTP ${res.status}): ${msg}`);
  }

  if (body?.errors && Object.keys(body.errors).length > 0) {
    throw new Error(`API errors: ${JSON.stringify(body.errors)}`);
  }

  return body;
}

async function commitBatch(db, batch, batchCount, totals) {
  if (batchCount === 0) return;
  if (!totals.dryRun) {
    await batch.commit();
  }
  totals.batches += 1;
  totals.writes += batchCount;
  log('BATCH', `Commit tamamlandı (${batchCount} yazma, toplam ${totals.writes}).`);
}

export async function syncPlayersFromApi(options) {
  const apiKey = getEnv('FOOTBALL_API_KEY', ['VITE_FOOTBALL_API_KEY', 'API_SPORTS_KEY']);
  if (!apiKey || apiKey === 'BURAYA_RAPIDAPI_KEY_YAZAR' || apiKey === 'your_api_key_here') {
    throw new Error('FOOTBALL_API_KEY veya VITE_FOOTBALL_API_KEY .env içinde tanımlı olmalı.');
  }

  const { league, season, delay, dryRun } = options;
  const db = initFirebaseAdmin();

  log('START', `Senkronizasyon başlıyor — lig=${league}, sezon=${season}, delay=${delay}ms${dryRun ? ' [DRY-RUN]' : ''}.`);

  const totals = {
    pages: 0,
    fetched: 0,
    mapped: 0,
    skipped: 0,
    writes: 0,
    batches: 0,
    dryRun,
  };

  let currentPage = 1;
  let totalPages = 1;

  let batch = db.batch();
  let batchCount = 0;

  do {
    log('API', `Sayfa ${currentPage}/${totalPages} çekiliyor…`);
    const payload = await fetchPlayersPage(apiKey, league, season, currentPage);
    totals.pages += 1;

    const paging = payload?.paging || {};
    totalPages = Math.max(1, Number(paging.total) || 1);
    const results = Array.isArray(payload?.response) ? payload.response : [];

    log('API', `Sayfa ${currentPage}: ${results.length} kayıt alındı (toplam sayfa: ${totalPages}).`);
    totals.fetched += results.length;

    for (const entry of results) {
      const docData = mapApiEntryToFirestore(entry, league, season);
      if (!docData) {
        totals.skipped += 1;
        continue;
      }

      totals.mapped += 1;
      const docId = docData.id;
      const ref = db.collection(PLAYERS_COLLECTION).doc(docId);

      if (!dryRun) {
        batch.set(ref, docData, { merge: true });
        batchCount += 1;

        if (batchCount >= BATCH_LIMIT) {
          await commitBatch(db, batch, batchCount, totals);
          batch = db.batch();
          batchCount = 0;
        }
      }
    }

    if (currentPage < totalPages) {
      log('WAIT', `Rate limit — ${delay}ms bekleniyor…`);
      await sleep(delay);
    }

    currentPage += 1;
  } while (currentPage <= totalPages);

  await commitBatch(db, batch, batchCount, totals);

  log('DONE', 'Senkronizasyon tamamlandı.', totals);
  return totals;
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    await syncPlayersFromApi(options);
    process.exit(0);
  } catch (err) {
    console.error('[ERROR]', err?.message || err);
    process.exit(1);
  }
}

const isDirectRun = process.argv[1]
  && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);

if (isDirectRun) {
  main();
}
