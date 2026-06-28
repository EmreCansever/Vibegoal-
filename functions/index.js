/**
 * ═══════════════════════════════════════════════════════════════
 * VibeGoal — Merkezi Hakem ve Kota Koruma Motoru
 * Node.js / Firebase Cloud Functions Backend Service
 * ═══════════════════════════════════════════════════════════════
 */

const admin = require('firebase-admin');
const functions = require('firebase-functions');
const fetch = require('node-fetch');

// Initialize Firebase Admin SDK
if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();

// API Configuration
const BASE_URL = 'https://v3.football.api-sports.io';
const API_KEY = process.env.VITE_FOOTBALL_API_KEY || 'YOUR_RAPIDAPI_KEY';
const LEAGUE_ID = 1; // Default: World Cup 2026 (apiId: 1)
const SEASON = 2024;

/* ─────────────────────────────────────────────────
   HELPER UTILITIES
   ───────────────────────────────────────────────── */

function getMatchStatistic(match, typeName) {
  let total = 0;
  if (!match.statistics || !Array.isArray(match.statistics)) return 0;
  match.statistics.forEach(teamStats => {
    const stat = teamStats.statistics?.find(s => s.type === typeName);
    if (stat && stat.value !== null) {
      total += Number(stat.value);
    }
  });
  return total;
}

function determinePollingInterval(matches) {
  if (!matches || matches.length === 0) return 90000;

  let hasCritical = false;
  let hasLive = false;

  matches.forEach(m => {
    const min = Number(m.minute) || 0;
    const isLiveStatus = ['1H', '2H', 'ET', 'P'].includes(m.status);
    
    if (isLiveStatus) {
      if (min > 75) {
        hasCritical = true;
      } else if (min >= 1) {
        hasLive = true;
      }
    }
  });

  if (hasCritical) return 12000;
  if (hasLive) return 30000;
  return 90000;
}

function getNextInterval(minute) {
  if (minute < 25) return { start: 30, end: 45 };
  if (minute < 40) return { start: 45, end: 60 };
  if (minute < 55) return { start: 60, end: 75 };
  if (minute < 70) return { start: 75, end: 90 };
  return null;
}

/* ─────────────────────────────────────────────────
   API-FOOTBALL FETCH CLIENT
   ───────────────────────────────────────────────── */
async function fetchLiveMatchesFromApi(leagueId) {
  const url = `${BASE_URL}/fixtures?league=${leagueId}&live=all`;
  
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'x-apisports-key': API_KEY,
      'x-rapidapi-key':  API_KEY,
    },
  });

  if (!res.ok) {
    throw new Error(`API Connection Failed: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  if (json.errors && Object.keys(json.errors).length > 0) {
    const firstError = Object.values(json.errors)[0];
    throw new Error(`API Content Error: ${firstError}`);
  }

  const fixtures = json.response || [];
  return fixtures.map(f => {
    const { fixture: fix, teams, goals, league, score, events, statistics } = f;
    return {
      id: fix.id,
      home: teams.home.name,
      away: teams.away.name,
      homeScore: goals.home ?? '-',
      awayScore: goals.away ?? '-',
      minute: fix.status?.elapsed ?? 0,
      status: fix.status?.short || 'NS',
      leagueId: league.id,
      date: fix.date,
      halftimeScore: {
        home: score?.halftime?.home ?? null,
        away: score?.halftime?.away ?? null,
      },
      events: events ?? [],
      statistics: statistics ?? [],
    };
  });
}

/* ─────────────────────────────────────────────────
   DYNAMIC QUESTION GENERATOR (Firestore Sync)
   ───────────────────────────────────────────────── */
async function syncDynamicQuestionsForMatch(match) {
  const { id: matchId, status, minute, home, away, homeScore, awayScore, date } = match;
  if (['FT', 'AET', 'PEN'].includes(status)) return;

  const min = Number(minute) || 0;
  const isLive = ['1H', '2H', 'ET', 'P'].includes(status);
  const isHT = status === 'HT';
  const isPreMatch = !isLive && !isHT;

  const hScore = Number(homeScore) || 0;
  const aScore = Number(awayScore) || 0;

  const batch = db.batch();
  const qTemplates = [];

  // A) SAKİN SORU GRUBU (Maç Önü ve Devre Arası)
  if (isPreMatch || isHT) {
    qTemplates.push({
      id: `${matchId}_match_result`,
      text: `🏆 Maç Sonucu: ${home} - ${away} maçını hangi takım kazanır veya berabere mi biter?`,
      options: [
        { label: `🏠 ${home} Kazanır`, value: 'home', reward: 15, points: '+15 P' },
        { label: `✈️ ${away} Kazanır`, value: 'away', reward: 15, points: '+15 P' },
        { label: '🤝 Beraberlik', value: 'draw', reward: 15, points: '+15 P' },
      ],
      deadline: isPreMatch ? 15 : 10,
      type: 'match_result',
      isLocked: false,
      group: 'quiet'
    });

    if (isPreMatch) {
      qTemplates.push({
        id: `${matchId}_first_half_result`,
        text: `⏱️ İlk Yarı Sonucu: ${home} - ${away} maçında ilk yarıyı hangi takım önde kapatır?`,
        options: [
          { label: `🏠 ${home} Önde Kapatır`, value: 'home', reward: 15, points: '+15 P' },
          { label: `✈️ ${away} Önde Kapatır`, value: 'away', reward: 15, points: '+15 P' },
          { label: '🤝 Beraberlik', value: 'draw', reward: 15, points: '+15 P' },
        ],
        deadline: 15,
        type: 'first_half_result',
        isLocked: false,
        group: 'quiet'
      });

      qTemplates.push({
        id: `${matchId}_correct_score`,
        text: `📊 Skor Tahmini: ${home} - ${away} maçının tam skoru ne olur?`,
        options: [
          { label: '1 - 0', value: '1-0', reward: 30, points: '+30 P' },
          { label: '2 - 0', value: '2-0', reward: 30, points: '+30 P' },
          { label: '2 - 1', value: '2-1', reward: 30, points: '+30 P' },
          { label: '0 - 0', value: '0-0', reward: 25, points: '+25 P' },
          { label: '1 - 1', value: '1-1', reward: 25, points: '+25 P' },
          { label: '0 - 1', value: '0-1', reward: 30, points: '+30 P' },
          { label: '0 - 2', value: '0-2', reward: 30, points: '+30 P' },
          { label: '1 - 2', value: '1-2', reward: 30, points: '+30 P' },
          { label: '🌀 Diğer', value: 'other', reward: 35, points: '+35 P' },
        ],
        deadline: 15,
        type: 'correct_score',
        isLocked: false,
        group: 'quiet'
      });
    }

    qTemplates.push({
      id: `${matchId}_total_goals_2_5`,
      text: `⚽ Toplam Gol (2.5): ${home} - ${away} maçında toplam gol sayısı 2.5 Alt mı olur Üst mü?`,
      options: [
        { label: '⬇️ 2.5 Alt', value: 'under', reward: 15, points: '+15 P' },
        { label: '⬆️ 2.5 Üst', value: 'over', reward: 20, points: '+20 P' },
      ],
      deadline: isPreMatch ? 15 : 10,
      type: 'total_goals_2_5',
      isLocked: false,
      group: 'quiet'
    });

    qTemplates.push({
      id: `${matchId}_both_teams_score`,
      text: `🔄 Karşılıklı Gol: ${home} - ${away} maçında her iki takım da gol atabilir mi?`,
      options: [
        { label: '⚽ KG Var', value: 'yes', reward: 15, points: '+15 P' },
        { label: '🧱 KG Yok', value: 'no', reward: 15, points: '+15 P' },
      ],
      deadline: isPreMatch ? 15 : 10,
      type: 'both_teams_score',
      isLocked: false,
      group: 'quiet'
    });
  }

  // B) DİNAMİK SORU GRUBU (1' - 75. Dakikalar Arası)
  if (isLive && min >= 1 && min <= 75) {
    qTemplates.push({
      id: `${matchId}_next_goal_${hScore}_${aScore}`,
      text: `⚽ Sıradaki Gol: ${home} - ${away} maçında sıradaki golü kim atar? (Mevcut Skor: ${hScore}-${aScore})`,
      options: [
        { label: `🏠 ${home}`, value: 'home', reward: 15, points: '+15 P' },
        { label: `✈️ ${away}`, value: 'away', reward: 15, points: '+15 P' },
        { label: '🧱 Gol Olmaz', value: 'none', reward: 25, points: '+25 P' },
      ],
      deadline: Math.max(1, 75 - min),
      type: 'next_goal',
      savedScore: { home: hScore, away: aScore },
      isLocked: false,
      group: 'dynamic'
    });

    qTemplates.push({
      id: `${matchId}_total_corners_8_5`,
      text: `⛳ Toplam Korner: ${home} - ${away} maçındaki toplam korner sayısı 8.5 barajını aşar mı?`,
      options: [
        { label: '⬆️ Evet (9 veya daha fazla)', value: 'over', reward: 15, points: '+15 P' },
        { label: '⬇️ Hayır (8 veya daha az)', value: 'under', reward: 15, points: '+15 P' },
      ],
      deadline: Math.max(1, 75 - min),
      type: 'total_corners_8_5',
      isLocked: false,
      group: 'dynamic'
    });

    qTemplates.push({
      id: `${matchId}_first_substitution`,
      text: `🔄 İlk Oyuncu Değişikliği: ${home} - ${away} maçında ilk oyuncu değişikliğini hangi takım yapar?`,
      options: [
        { label: `🏠 ${home}`, value: 'home', reward: 15, points: '+15 P' },
        { label: `✈️ ${away}`, value: 'away', reward: 15, points: '+15 P' },
        { label: '🤝 Aynı Anda / Hiç Yapılmaz', value: 'same_none', reward: 20, points: '+20 P' },
      ],
      deadline: Math.max(1, 75 - min),
      type: 'first_substitution',
      isLocked: false,
      group: 'dynamic'
    });

    qTemplates.push({
      id: `${matchId}_first_yellow_card`,
      text: `🟨 İlk Sarı Kart: ${home} - ${away} maçında ilk sarı kartı hangi takımın oyuncusu görür?`,
      options: [
        { label: `🏠 ${home}`, value: 'home', reward: 15, points: '+15 P' },
        { label: `✈️ ${away}`, value: 'away', reward: 15, points: '+15 P' },
        { label: '🧱 Kart Olmaz', value: 'none', reward: 20, points: '+20 P' },
      ],
      deadline: Math.max(1, 75 - min),
      type: 'first_yellow_card',
      isLocked: false,
      group: 'dynamic'
    });

    const interval = getNextInterval(min);
    if (interval) {
      const isBufferLocked = min >= (interval.start - 5);
      qTemplates.push({
        id: `${matchId}_goal_in_interval_${interval.start}_${interval.end}`,
        text: `⏰ Aralık Golü: ${home} - ${away} maçında ${interval.start}' - ${interval.end}' dakikaları arasında gol olur mu?`,
        options: [
          { label: '⚽ Evet, Gol Olur', value: 'yes', reward: 20, points: '+20 P' },
          { label: '🧱 Hayır, Gol Olmaz', value: 'no', reward: 15, points: '+15 P' },
        ],
        deadline: Math.max(1, (interval.start - 5) - min),
        type: 'goal_in_interval',
        interval: interval,
        isLocked: isBufferLocked,
        group: 'dynamic'
      });
    }
  }

  // C) ANLIK / KRİTİK SORU GRUBU (75. Dakikadan Sonra)
  if (isLive && min > 75) {
    qTemplates.push({
      id: `${matchId}_injury_time_goal`,
      text: `⏱️ Uzatma Golü: ${home} - ${away} maçında 90. dakikadan sonra uzatmalarda gol sesi çıkar mı?`,
      options: [
        { label: '⚽ Evet, Gol Olur', value: 'yes', reward: 20, points: '+20 P' },
        { label: '🧱 Hayır, Gol Olmaz', value: 'no', reward: 15, points: '+15 P' },
      ],
      deadline: Math.max(1, 90 - min),
      type: 'injury_time_goal',
      isLocked: min >= 90,
      group: 'critical'
    });

    qTemplates.push({
      id: `${matchId}_any_red_card`,
      text: `🟥 Kritik Kart: ${home} - ${away} maçının kalan dakikalarında herhangi bir oyuncu Kırmızı Kart görür mü?`,
      options: [
        { label: '🟥 Evet, Kırmızı Kart Olur', value: 'yes', reward: 20, points: '+20 P' },
        { label: '🧱 Hayır, Kart Olmaz', value: 'no', reward: 15, points: '+15 P' },
      ],
      deadline: Math.max(1, 88 - min),
      type: 'any_red_card',
      isLocked: min >= 88,
      group: 'critical'
    });

    qTemplates.push({
      id: `${matchId}_last_corner`,
      text: `⛳ Son Korner: ${home} - ${away} maçının son kornerini hangi takım kullanır?`,
      options: [
        { label: `🏠 ${home}`, value: 'home', reward: 20, points: '+20 P' },
        { label: `✈️ ${away}`, value: 'away', reward: 20, points: '+20 P' },
        { label: '🧱 Korner Olmaz', value: 'none', reward: 20, points: '+20 P' },
      ],
      deadline: Math.max(1, 88 - min),
      type: 'last_corner',
      isLocked: min >= 88,
      group: 'critical'
    });

    qTemplates.push({
      id: `${matchId}_extra_minutes`,
      text: `⏱️ Son Baskı: 85. dakikadan sonra maça ekstra en az kaç dakika uzatma eklenir?`,
      options: [
        { label: '➕ En az +4 Dakika', value: '4', reward: 15, points: '+15 P' },
        { label: '➕ En az +5 Dakika', value: '5', reward: 15, points: '+15 P' },
        { label: '➕ En az +6+ Dakika', value: '6', reward: 20, points: '+20 P' },
      ],
      deadline: Math.max(1, 88 - min),
      type: 'extra_minutes',
      isLocked: min >= 88,
      group: 'critical'
    });
  }

  // Write new questions to Firestore (without overwriting if already resolved)
  for (const q of qTemplates) {
    const qRef = db.collection('questions').doc(q.id);
    const doc = await qRef.get();
    if (!doc.exists) {
      batch.set(qRef, {
        ...q,
        status: 'pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    } else if (doc.data().status === 'pending') {
      // Sync dynamic changes such as isLocked (buffer locks) and deadline
      batch.update(qRef, {
        isLocked: q.isLocked,
        deadline: q.deadline
      });
    }
  }

  await batch.commit();
}

/* ─────────────────────────────────────────────────
   SERVER-SIDE RESOLVER ENGINE (Instant Resolution)
   ───────────────────────────────────────────────── */
function evaluateQuestionAnswer(question, match) {
  const { type } = question;
  const homeScore = Number(match.homeScore) || 0;
  const awayScore = Number(match.awayScore) || 0;
  const minute = Number(match.minute) || 0;
  const events = match.events || [];

  const isFT = ['FT', 'AET', 'PEN'].includes(match.status);
  const isHT = match.status === 'HT';

  switch (type) {
    case 'match_result':
      if (isFT) {
        if (homeScore > awayScore) return 'home';
        if (awayScore > homeScore) return 'away';
        return 'draw';
      }
      break;

    case 'first_half_result':
      if (isHT || isFT) {
        const htHome = match.halftimeScore?.home !== null && match.halftimeScore?.home !== undefined
          ? Number(match.halftimeScore.home)
          : homeScore;
        const htAway = match.halftimeScore?.away !== null && match.halftimeScore?.away !== undefined
          ? Number(match.halftimeScore.away)
          : awayScore;

        if (htHome > htAway) return 'home';
        if (htAway > htHome) return 'away';
        return 'draw';
      }
      break;

    case 'total_goals_2_5':
      if (homeScore + awayScore >= 3) return 'over';
      if (isFT) return (homeScore + awayScore <= 2) ? 'under' : 'over';
      break;

    case 'both_teams_score':
      if (homeScore > 0 && awayScore > 0) return 'yes';
      if (isFT) return (homeScore > 0 && awayScore > 0) ? 'yes' : 'no';
      break;

    case 'correct_score':
      if (isFT) {
        const scoreKey = `${homeScore}-${awayScore}`;
        const options = ['1-0', '2-0', '2-1', '0-0', '1-1', '0-1', '0-2', '1-2'];
        return options.includes(scoreKey) ? scoreKey : 'other';
      }
      break;

    case 'next_goal': {
      const savedH = Number(question.savedScore?.home) || 0;
      const savedA = Number(question.savedScore?.away) || 0;

      if (homeScore > savedH) return 'home';
      if (awayScore > savedA) return 'away';
      if (isFT) return 'none';
      break;
    }

    case 'total_corners_8_5': {
      const corners = getMatchStatistic(match, 'Corner Kicks');
      if (corners >= 9) return 'over';
      if (isFT) return corners <= 8 ? 'under' : 'over';
      break;
    }

    case 'first_substitution': {
      const subEvents = events.filter(e => e.type?.toLowerCase() === 'subst');
      if (subEvents.length > 0) {
        const firstMin = subEvents[0].time?.elapsed;
        const concurrentSubs = subEvents.filter(e => e.time?.elapsed === firstMin);
        const homeSub = concurrentSubs.some(e => e.team?.name === match.home);
        const awaySub = concurrentSubs.some(e => e.team?.name === match.away);

        if (homeSub && awaySub) return 'same_none';
        if (homeSub) return 'home';
        if (awaySub) return 'away';
      }
      if (isFT) return 'same_none';
      break;
    }

    case 'first_yellow_card': {
      const yellowCards = events.filter(e => e.type?.toLowerCase() === 'card' && e.detail?.toLowerCase().includes('yellow card'));
      if (yellowCards.length > 0) {
        const firstCard = yellowCards[0];
        if (firstCard.team?.name === match.home) return 'home';
        if (firstCard.team?.name === match.away) return 'away';
      }
      if (isFT) return 'none';
      break;
    }

    case 'goal_in_interval': {
      const { start, end } = question.interval || {};
      if (start && end) {
        const hasGoal = events.some(e => {
          return e.type?.toLowerCase() === 'goal' && 
                 Number(e.time?.elapsed) >= start && 
                 Number(e.time?.elapsed) <= end;
        });

        if (hasGoal) return 'yes';
        if (minute > end || isHT || isFT) return 'no';
      }
      break;
    }

    case 'injury_time_goal': {
      const hasGoal = events.some(e => {
        return e.type?.toLowerCase() === 'goal' && 
               (Number(e.time?.elapsed) > 90 || e.time?.extra !== null);
      });
      if (hasGoal) return 'yes';
      if (isFT) return 'no';
      break;
    }

    case 'any_red_card': {
      const hasRed = events.some(e => {
        const elapsed = Number(e.time?.elapsed) || 0;
        const isRed = e.type?.toLowerCase() === 'card' && 
                      (e.detail?.toLowerCase().includes('red card') || e.detail?.toLowerCase().includes('second yellow card'));
        return isRed && elapsed > 75;
      });
      if (hasRed) return 'yes';
      if (isFT) return 'no';
      break;
    }

    case 'last_corner':
      if (isFT) {
        const homeCorners = getMatchStatistic(match, 'Corner Kicks');
        const awayCorners = getMatchStatistic(match, 'Corner Kicks');
        if (homeCorners === 0 && awayCorners === 0) return 'none';
        if (homeCorners > awayCorners) return 'home';
        if (awayCorners > homeCorners) return 'away';
        return 'home';
      }
      break;

    case 'extra_minutes':
      if (isFT) {
        let extraMins = 0;
        events.forEach(e => {
          if (Number(e.time?.elapsed) === 90 && e.time?.extra) {
            extraMins = Math.max(extraMins, Number(e.time.extra));
          }
        });
        if (extraMins >= 6) return '6';
        if (extraMins === 5) return '5';
        return '4';
      }
      break;

    default:
      return null;
  }

  return null;
}

/**
 * Sonuçlanan soruların kazanan/kaybeden kullanıcılarını belirleyip
 * puanlarını Firestore Transaction kullanarak otonom dağıtır.
 */
async function resolvePendingQuestionsForMatch(match) {
  const { id: matchId } = match;

  // Query all pending questions for this match
  const snapshot = await db.collection('questions')
    .where('matchId', '==', matchId)
    .where('status', '==', 'pending')
    .get();

  for (const doc of snapshot.docs) {
    const question = doc.data();
    const correctAnswer = evaluateQuestionAnswer(question, match);

    if (correctAnswer) {
      console.log(`[Central Resolution] Resolving question ${question.id}. Correct: ${correctAnswer}`);

      // Perform updates inside a transaction to prevent race conditions
      await db.runTransaction(async (transaction) => {
        // 1. Mark question as resolved in database
        transaction.update(db.collection('questions').doc(question.id), {
          status: 'resolved',
          correctAnswer: correctAnswer,
          resolvedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // 2. Query all pending predictions for this question
        const predsRef = db.collection('user_predictions')
          .where('questionId', '==', question.id)
          .where('status', '==', 'pending');
          
        const predsSnapshot = await transaction.get(predsRef);

        for (const pDoc of predsSnapshot.docs) {
          const prediction = pDoc.data();
          const { userId, selectedOption, rewardPoints } = prediction;
          const isWon = selectedOption === correctAnswer;
          const pointsEarned = isWon ? rewardPoints : 0;

          // Update user prediction record
          transaction.update(db.collection('user_predictions').doc(prediction.id), {
            status: isWon ? 'won' : 'lost',
            pointsEarned: pointsEarned,
            processedAt: admin.firestore.FieldValue.serverTimestamp()
          });

          // Update user profile stats (atomic increments)
          const userRef = db.collection('users').doc(userId);
          transaction.set(userRef, {
            totalPoints: admin.firestore.FieldValue.increment(pointsEarned),
            correct: admin.firestore.FieldValue.increment(isWon ? 1 : 0),
            total: admin.firestore.FieldValue.increment(1)
          }, { merge: true });
        }
      });
    }
  }
}

/* ─────────────────────────────────────────────────
   CORE ENGINE: POLL & DISTRIBUTE
   ───────────────────────────────────────────────── */
async function runSmartPollingCycle() {
  console.log(`[Smart Polling] Starting cycle at ${new Date().toISOString()}`);
  try {
    // 1. Single central fetch from API-Football
    const liveMatches = await fetchLiveMatchesFromApi(LEAGUE_ID);
    console.log(`[Smart Polling] Fetched ${liveMatches.length} live matches.`);

    const batch = db.batch();

    // 2. Write/Cache updated data in Firestore
    for (const match of liveMatches) {
      const matchRef = db.collection('live_matches').doc(String(match.id));
      batch.set(matchRef, {
        ...match,
        pollingInterval: determinePollingInterval([match]),
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
      });
    }
    await batch.commit();

    // 3. Process questions and score resolutions
    for (const match of liveMatches) {
      // Sync and lock questions
      await syncDynamicQuestionsForMatch(match);
      // Run instant resolution scoring
      await resolvePendingQuestionsForMatch(match);
    }

    // Return the dynamic interval calculation
    return determinePollingInterval(liveMatches);
  } catch (error) {
    console.error(`[Smart Polling Error]`, error);
    return 15000; // Retry fallback (15 seconds)
  }
}

/* ─────────────────────────────────────────────────
   DEPLOYMENT INTERFACE: FIREBASE CLOUD FUNCTION
   ───────────────────────────────────────────────── */

/**
 * Firebase Scheduled Cloud Function (Runs every 1 minute)
 * Runs a continuous sub-minute polling loop inside the 60s execution budget.
 */
exports.scheduledSmartPoll = functions.pubsub.schedule('every 1 minutes').onRun(async (context) => {
  const executionLimit = 58000; // 58 seconds limit
  const startTime = Date.now();

  console.log('[Firebase Cloud Scheduler] Triggered Smart Polling daemon.');

  while (Date.now() - startTime < executionLimit) {
    const nextWait = await runSmartPollingCycle();
    console.log(`[Scheduler Daemon] Next wait interval: ${nextWait}ms`);
    
    if (Date.now() - startTime + nextWait < executionLimit) {
      await new Promise(resolve => setTimeout(resolve, nextWait));
    } else {
      break;
    }
  }
  return null;
});

/* ─────────────────────────────────────────────────
   DEPLOYMENT INTERFACE: STANDALONE NODE.JS PROCESS
   ───────────────────────────────────────────────── */
function startStandaloneDaemon() {
  async function loop() {
    const waitTime = await runSmartPollingCycle();
    setTimeout(loop, waitTime);
  }
  console.log('[Daemon Server] Standalone Smart Polling daemon started.');
  loop();
}

// Start standalone daemon if executed directly via Node.js
if (require.main === module) {
  startStandaloneDaemon();
}
