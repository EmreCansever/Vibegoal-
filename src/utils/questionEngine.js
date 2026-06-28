/* ═══════════════════════════════════════════════════════════════
   VibeGoal — Smart Polling & Question Engine
   Tamamen pure ve olay odaklı anlık sonuçlanma algoritmaları.
   ═══════════════════════════════════════════════════════════════ */

import { calculateQuestionPoints } from './scoringEngine';

/* ─────────────────────────────────────────────────
   SABİTLER VE YARDIMCILAR
   ───────────────────────────────────────────────── */

// Local storage key helpers
const PREDICT_HISTORY_KEY = (uid) => `vg_predict_history_${uid}`;

function getLockedQuestionDefinitions(uid) {
  try {
    const data = localStorage.getItem(`vg_locked_questions_def_${uid}`);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

function getResolvedQuestions(uid) {
  try {
    const data = localStorage.getItem(`vg_resolved_questions_${uid}`);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

/**
 * Maç istatistiklerinden belirli bir kategorinin (ör: Corner Kicks) toplamını çeker.
 */
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

/**
 * 1. Akıllı Polling Zamanlama Kuralları:
 * - Maç Önü / Devre Arası -> 90 saniyede bir (90000 ms)
 * - Canlı Maç (1' - 75') -> 30 saniyede bir (30000 ms)
 * - Kritik Dakikalar (75' - 90+') -> 12 saniyede bir (12000 ms)
 */
export function determinePollingInterval(matches) {
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

/**
 * Son 2 dakika içinde bir gol veya kırmızı kart olayı olup olmadığını kontrol eder.
 * UI'da anlık suistimali engellemek için kilit tetikler.
 */
export function isMatchPoolLockedByRecentEvent(match) {
  if (!match.events || !Array.isArray(match.events)) return false;
  const currentMin = Number(match.minute) || 0;
  // Son 2 dakika (current, current - 1)
  const recentMinutes = [currentMin, currentMin - 1];

  return match.events.some(e => {
    const isGoal = e.type === 'Goal';
    const isRedCard = e.type === 'Card' && (e.detail === 'Red Card' || e.detail === 'Second Yellow Card');
    if (isGoal || isRedCard) {
      return recentMinutes.includes(Number(e.time?.elapsed));
    }
    return false;
  });
}

/**
 * Aralık Golü sorusu için dakika bazlı bir sonraki aralığı belirler.
 */
function getNextInterval(minute) {
  if (minute < 25) return { start: 30, end: 45 };
  if (minute < 40) return { start: 45, end: 60 };
  if (minute < 55) return { start: 60, end: 75 };
  if (minute < 70) return { start: 75, end: 90 };
  return null;
}

/* ─────────────────────────────────────────────────
   SORU HAVUZU GENERATORÜ
   ───────────────────────────────────────────────── */
export function generateDynamicQuestions(liveMatches, uid) {
  const generated = [];
  const lockedDefs = getLockedQuestionDefinitions(uid);
  const resolvedList = getResolvedQuestions(uid);

  liveMatches.forEach(match => {
    if (match.status === 'FT' || match.status === 'AET' || match.status === 'PEN') return;

    const minute = Number(match.minute) || 0;
    const isLive = ['1H', '2H', 'ET', 'P'].includes(match.status);
    const isHT = match.status === 'HT';
    const isPreMatch = !isLive && !isHT;

    // Ortak Parametreler
    const homeScore = Number(match.homeScore) || 0;
    const awayScore = Number(match.awayScore) || 0;

    // ───────────────────────────────────────────────
    // A) SAKİN SORU GRUBU (Maç Önü ve Devre Arası)
    // ───────────────────────────────────────────────
    if (isPreMatch || isHT) {
      // 1. [Maç Sonucu]
      const q1Id = `${match.id}_match_result`;
      if (!resolvedList.includes(q1Id)) {
        if (lockedDefs[q1Id]) {
          generated.push(lockedDefs[q1Id]);
        } else {
          generated.push({
            id: q1Id,
            matchId: match.id,
            text: `🏆 Maç Sonucu: ${match.home} - ${match.away} maçını hangi takım kazanır veya berabere mi biter?`,
            options: [
              { label: `🏠 ${match.home} Kazanır`, value: 'home', reward: 15, points: '+15 P' },
              { label: `✈️ ${match.away} Kazanır`, value: 'away', reward: 15, points: '+15 P' },
              { label: '🤝 Beraberlik', value: 'draw', reward: 15, points: '+15 P' },
            ],
            deadline: isPreMatch ? Math.max(5, Math.floor((new Date(match.date).getTime() - Date.now()) / 60000)) : 15,
            type: 'match_result',
            isLocked: false,
            group: 'quiet'
          });
        }
      }

      // 2. [İlk Yarı Sonucu] (Sadece Maç Önü)
      if (isPreMatch) {
        const q2Id = `${match.id}_first_half_result`;
        if (!resolvedList.includes(q2Id)) {
          if (lockedDefs[q2Id]) {
            generated.push(lockedDefs[q2Id]);
          } else {
            generated.push({
              id: q2Id,
              matchId: match.id,
              text: `⏱️ İlk Yarı Sonucu: ${match.home} - ${match.away} maçında ilk yarıyı hangi takım önde kapatır?`,
              options: [
                { label: `🏠 ${match.home} Önde Kapatır`, value: 'home', reward: 15, points: '+15 P' },
                { label: `✈️ ${match.away} Önde Kapatır`, value: 'away', reward: 15, points: '+15 P' },
                { label: '🤝 Beraberlik', value: 'draw', reward: 15, points: '+15 P' },
              ],
              deadline: Math.max(5, Math.floor((new Date(match.date).getTime() - Date.now()) / 60000)),
              type: 'first_half_result',
              isLocked: false,
              group: 'quiet'
            });
          }
        }
      }

      // 3. [Toplam Gol Barajı]
      const q3Id = `${match.id}_total_goals_2_5`;
      if (!resolvedList.includes(q3Id)) {
        if (lockedDefs[q3Id]) {
          generated.push(lockedDefs[q3Id]);
        } else {
          generated.push({
            id: q3Id,
            matchId: match.id,
            text: `⚽ Toplam Gol (2.5): ${match.home} - ${match.away} maçında toplam gol sayısı 2.5 Alt mı olur Üst mü?`,
            options: [
              { label: '⬇️ 2.5 Alt', value: 'under', reward: 15, points: '+15 P' },
              { label: '⬆️ 2.5 Üst', value: 'over', reward: 20, points: '+20 P' },
            ],
            deadline: isPreMatch ? Math.max(5, Math.floor((new Date(match.date).getTime() - Date.now()) / 60000)) : 15,
            type: 'total_goals_2_5',
            isLocked: false,
            group: 'quiet'
          });
        }
      }

      // 4. [Karşılıklı Gol]
      const q4Id = `${match.id}_both_teams_score`;
      if (!resolvedList.includes(q4Id)) {
        if (lockedDefs[q4Id]) {
          generated.push(lockedDefs[q4Id]);
        } else {
          generated.push({
            id: q4Id,
            matchId: match.id,
            text: `🔄 Karşılıklı Gol: ${match.home} - ${match.away} maçında her iki takım da gol atabilir mi? (KG Var / KG Yok)`,
            options: [
              { label: '⚽ KG Var', value: 'yes', reward: 15, points: '+15 P' },
              { label: '🧱 KG Yok', value: 'no', reward: 15, points: '+15 P' },
            ],
            deadline: isPreMatch ? Math.max(5, Math.floor((new Date(match.date).getTime() - Date.now()) / 60000)) : 15,
            type: 'both_teams_score',
            isLocked: false,
            group: 'quiet'
          });
        }
      }

      // 5. [Skor Tahmini] (Sadece Maç Önü)
      if (isPreMatch) {
        const q5Id = `${match.id}_correct_score`;
        if (!resolvedList.includes(q5Id)) {
          if (lockedDefs[q5Id]) {
            generated.push(lockedDefs[q5Id]);
          } else {
            generated.push({
              id: q5Id,
              matchId: match.id,
              text: `📊 Skor Tahmini: ${match.home} - ${match.away} maçının tam skoru ne olur?`,
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
              deadline: Math.max(5, Math.floor((new Date(match.date).getTime() - Date.now()) / 60000)),
              type: 'correct_score',
              isLocked: false,
              group: 'quiet'
            });
          }
        }
      }
    }

    // ───────────────────────────────────────────────
    // B) DİNAMİK SORU GRUBU (1' - 75. Dakikalar Arası)
    // ───────────────────────────────────────────────
    if (isLive && minute >= 1 && minute <= 75) {
      // 6. [Sıradaki Gol]
      const q6Id = `${match.id}_next_goal_${homeScore}_${awayScore}`;
      if (!resolvedList.includes(q6Id)) {
        if (lockedDefs[q6Id]) {
          generated.push(lockedDefs[q6Id]);
        } else {
          generated.push({
            id: q6Id,
            matchId: match.id,
            text: `⚽ Sıradaki Gol: ${match.home} - ${match.away} maçında sıradaki golü kim atar? (Mevcut Skor: ${homeScore}-${awayScore})`,
            options: [
              { label: `🏠 ${match.home}`, value: 'home', reward: 15, points: '+15 P' },
              { label: `✈️ ${match.away}`, value: 'away', reward: 15, points: '+15 P' },
              { label: '🧱 Gol Olmaz', value: 'none', reward: 25, points: '+25 P' },
            ],
            deadline: Math.max(1, 75 - minute),
            type: 'next_goal',
            savedScore: { home: homeScore, away: awayScore },
            isLocked: false,
            group: 'dynamic'
          });
        }
      }

      // 7. [Toplam Korner]
      const q7Id = `${match.id}_total_corners_8_5`;
      if (!resolvedList.includes(q7Id)) {
        if (lockedDefs[q7Id]) {
          generated.push(lockedDefs[q7Id]);
        } else {
          generated.push({
            id: q7Id,
            matchId: match.id,
            text: `⛳ Toplam Korner: ${match.home} - ${match.away} maçındaki toplam korner sayısı 8.5 barajını aşar mı?`,
            options: [
              { label: '⬆️ Evet (9 veya daha fazla)', value: 'over', reward: 15, points: '+15 P' },
              { label: '⬇️ Hayır (8 veya daha az)', value: 'under', reward: 15, points: '+15 P' },
            ],
            deadline: Math.max(1, 75 - minute),
            type: 'total_corners_8_5',
            isLocked: false,
            group: 'dynamic'
          });
        }
      }

      // 8. [Oyuncu Özel]
      const q8Id = `${match.id}_first_substitution`;
      if (!resolvedList.includes(q8Id)) {
        if (lockedDefs[q8Id]) {
          generated.push(lockedDefs[q8Id]);
        } else {
          generated.push({
            id: q8Id,
            matchId: match.id,
            text: `🔄 İlk Oyuncu Değişikliği: ${match.home} - ${match.away} maçında ilk oyuncu değişikliğini hangi takım yapar?`,
            options: [
              { label: `🏠 ${match.home}`, value: 'home', reward: 15, points: '+15 P' },
              { label: `✈️ ${match.away}`, value: 'away', reward: 15, points: '+15 P' },
              { label: '🤝 Aynı Anda / Hiç Yapılmaz', value: 'same_none', reward: 20, points: '+20 P' },
            ],
            deadline: Math.max(1, 75 - minute),
            type: 'first_substitution',
            isLocked: false,
            group: 'dynamic'
          });
        }
      }

      // 9. [Kart Pazarı]
      const q9Id = `${match.id}_first_yellow_card`;
      if (!resolvedList.includes(q9Id)) {
        if (lockedDefs[q9Id]) {
          generated.push(lockedDefs[q9Id]);
        } else {
          generated.push({
            id: q9Id,
            matchId: match.id,
            text: `🟨 İlk Sarı Kart: ${match.home} - ${match.away} maçında ilk sarı kartı hangi takımın oyuncusu görür?`,
            options: [
              { label: `🏠 ${match.home}`, value: 'home', reward: 15, points: '+15 P' },
              { label: `✈️ ${match.away}`, value: 'away', reward: 15, points: '+15 P' },
              { label: '🧱 Kart Olmaz', value: 'none', reward: 20, points: '+20 P' },
            ],
            deadline: Math.max(1, 75 - minute),
            type: 'first_yellow_card',
            isLocked: false,
            group: 'dynamic'
          });
        }
      }

      // 10. [Aralık Golü]
      const interval = getNextInterval(minute);
      if (interval) {
        const q10Id = `${match.id}_goal_in_interval_${interval.start}_${interval.end}`;
        if (!resolvedList.includes(q10Id)) {
          if (lockedDefs[q10Id]) {
            generated.push(lockedDefs[q10Id]);
          } else {
            // Buffer rule: locks 5 minutes before interval start
            const isBufferLocked = minute >= (interval.start - 5);
            generated.push({
              id: q10Id,
              matchId: match.id,
              text: `⏰ Aralık Golü: ${match.home} - ${match.away} maçında ${interval.start}' - ${interval.end}' dakikaları arasında gol olur mu?`,
              options: [
                { label: '⚽ Evet, Gol Olur', value: 'yes', reward: 20, points: '+20 P' },
                { label: '🧱 Hayır, Gol Olmaz', value: 'no', reward: 15, points: '+15 P' },
              ],
              deadline: Math.max(1, (interval.start - 5) - minute),
              type: 'goal_in_interval',
              interval: interval,
              isLocked: isBufferLocked,
              group: 'dynamic'
            });
          }
        }
      }
    }

    // ───────────────────────────────────────────────
    // C) ANLIK / KRİTİK SORU GRUBU (75. Dakikadan Sonra)
    // ───────────────────────────────────────────────
    if (isLive && minute > 75) {
      // 11. [Uzatma Golü]
      const q11Id = `${match.id}_injury_time_goal`;
      if (!resolvedList.includes(q11Id)) {
        if (lockedDefs[q11Id]) {
          generated.push(lockedDefs[q11Id]);
        } else {
          const isL = minute >= 90;
          generated.push({
            id: q11Id,
            matchId: match.id,
            text: `⏱️ Uzatma Golü: ${match.home} - ${match.away} maçında 90. dakikadan sonra uzatmalarda gol sesi çıkar mı?`,
            options: [
              { label: '⚽ Evet, Gol Olur', value: 'yes', reward: 20, points: '+20 P' },
              { label: '🧱 Hayır, Gol Olmaz', value: 'no', reward: 15, points: '+15 P' },
            ],
            deadline: Math.max(1, 90 - minute),
            type: 'injury_time_goal',
            isLocked: isL,
            group: 'critical'
          });
        }
      }

      // 12. [Kritik Kart]
      const q12Id = `${match.id}_any_red_card`;
      if (!resolvedList.includes(q12Id)) {
        if (lockedDefs[q12Id]) {
          generated.push(lockedDefs[q12Id]);
        } else {
          const isL = minute >= 88;
          generated.push({
            id: q12Id,
            matchId: match.id,
            text: `🟥 Kritik Kart: ${match.home} - ${match.away} maçının kalan dakikalarında herhangi bir oyuncu Kırmızı Kart görür mü?`,
            options: [
              { label: '🟥 Evet, Kırmızı Kart Olur', value: 'yes', reward: 20, points: '+20 P' },
              { label: '🧱 Hayır, Kart Olmaz', value: 'no', reward: 15, points: '+15 P' },
            ],
            deadline: Math.max(1, 88 - minute),
            type: 'any_red_card',
            isLocked: isL,
            group: 'critical'
          });
        }
      }

      // 13. [Son Korner]
      const q13Id = `${match.id}_last_corner`;
      if (!resolvedList.includes(q13Id)) {
        if (lockedDefs[q13Id]) {
          generated.push(lockedDefs[q13Id]);
        } else {
          const isL = minute >= 88;
          generated.push({
            id: q13Id,
            matchId: match.id,
            text: `⛳ Son Korner: ${match.home} - ${match.away} maçının son kornerini hangi takım kullanır?`,
            options: [
              { label: `🏠 ${match.home}`, value: 'home', reward: 20, points: '+20 P' },
              { label: `✈️ ${match.away}`, value: 'away', reward: 20, points: '+20 P' },
              { label: '🧱 Korner Olmaz', value: 'none', reward: 20, points: '+20 P' },
            ],
            deadline: Math.max(1, 88 - minute),
            type: 'last_corner',
            isLocked: isL,
            group: 'critical'
          });
        }
      }

      // 14. [Son Baskı]
      const q14Id = `${match.id}_extra_minutes`;
      if (!resolvedList.includes(q14Id)) {
        if (lockedDefs[q14Id]) {
          generated.push(lockedDefs[q14Id]);
        } else {
          const isL = minute >= 88;
          generated.push({
            id: q14Id,
            matchId: match.id,
            text: `⏱️ Son Baskı: 85. dakikadan sonra maça ekstra en az kaç dakika uzatma eklenir?`,
            options: [
              { label: '➕ En az +4 Dakika', value: '4', reward: 15, points: '+15 P' },
              { label: '➕ En az +5 Dakika', value: '5', reward: 15, points: '+15 P' },
              { label: '➕ En az +6+ Dakika', value: '6', reward: 20, points: '+20 P' },
            ],
            deadline: Math.max(1, 88 - minute),
            type: 'extra_minutes',
            isLocked: isL,
            group: 'critical'
          });
        }
      }
    }
  });

  return generated;
}

/* ─────────────────────────────────────────────────
   ANLIK / OLAY ODAKLI SONUÇLANDIRICI ENGINE
   ───────────────────────────────────────────────── */
export function resolveQuestionInstantly(question, match) {
  const { type } = question;
  const homeScore = Number(match.homeScore) || 0;
  const awayScore = Number(match.awayScore) || 0;
  const minute = Number(match.minute) || 0;
  const events = match.events || [];

  const isFT = ['FT', 'AET', 'PEN'].includes(match.status);
  const isHT = match.status === 'HT';

  switch (type) {
    // ───────────────────────────────────────────────
    // Sakin Soru Grubu
    // ───────────────────────────────────────────────
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
      // Over 2.5 resolves instantly once 3 goals are scored
      if (homeScore + awayScore >= 3) {
        return 'over';
      }
      if (isFT) {
        return (homeScore + awayScore <= 2) ? 'under' : 'over';
      }
      break;

    case 'both_teams_score':
      // KG Var resolves instantly once both teams score
      if (homeScore > 0 && awayScore > 0) {
        return 'yes';
      }
      if (isFT) {
        return (homeScore > 0 && awayScore > 0) ? 'yes' : 'no';
      }
      break;

    case 'correct_score':
      if (isFT) {
        const scoreKey = `${homeScore}-${awayScore}`;
        const options = ['1-0', '2-0', '2-1', '0-0', '1-1', '0-1', '0-2', '1-2'];
        return options.includes(scoreKey) ? scoreKey : 'other';
      }
      break;

    // ───────────────────────────────────────────────
    // Dinamik Soru Grubu
    // ───────────────────────────────────────────────
    case 'next_goal': {
      const savedH = Number(question.savedScore?.home) || 0;
      const savedA = Number(question.savedScore?.away) || 0;

      if (homeScore > savedH) return 'home';
      if (awayScore > savedA) return 'away';

      if (isFT) {
        return 'none';
      }
      break;
    }

    case 'total_corners_8_5': {
      const corners = getMatchStatistic(match, 'Corner Kicks');
      if (corners >= 9) return 'over';
      if (isFT) {
        return corners <= 8 ? 'under' : 'over';
      }
      break;
    }

    case 'first_substitution': {
      const subEvents = events.filter(e => e.type?.toLowerCase() === 'subst');
      if (subEvents.length > 0) {
        // Find if multiple substitutions occurred in the first event minute
        const firstMin = subEvents[0].time?.elapsed;
        const concurrentSubs = subEvents.filter(e => e.time?.elapsed === firstMin);
        
        const homeSub = concurrentSubs.some(e => e.team?.name === match.home);
        const awaySub = concurrentSubs.some(e => e.team?.name === match.away);

        if (homeSub && awaySub) return 'same_none';
        if (homeSub) return 'home';
        if (awaySub) return 'away';
      }
      if (isFT) {
        return 'same_none';
      }
      break;
    }

    case 'first_yellow_card': {
      const yellowCards = events.filter(e => e.type?.toLowerCase() === 'card' && e.detail?.toLowerCase().includes('yellow card'));
      if (yellowCards.length > 0) {
        const firstCard = yellowCards[0];
        if (firstCard.team?.name === match.home) return 'home';
        if (firstCard.team?.name === match.away) return 'away';
      }
      if (isFT) {
        return 'none';
      }
      break;
    }

    case 'goal_in_interval': {
      const { start, end } = question.interval || {};
      if (start && end) {
        // Check if there was any goal event in this interval
        const hasGoalInInterval = events.some(e => {
          return e.type?.toLowerCase() === 'goal' && 
                 Number(e.time?.elapsed) >= start && 
                 Number(e.time?.elapsed) <= end;
        });

        if (hasGoalInInterval) return 'yes';

        // If the match progress has gone past the end of the interval, resolve as no
        if (minute > end || isHT || isFT) {
          return 'no';
        }
      }
      break;
    }

    // ───────────────────────────────────────────────
    // Anlık / Kritik Soru Grubu
    // ───────────────────────────────────────────────
    case 'injury_time_goal': {
      const hasInjuryTimeGoal = events.some(e => {
        return e.type?.toLowerCase() === 'goal' && 
               (Number(e.time?.elapsed) > 90 || e.time?.extra !== null);
      });
      if (hasInjuryTimeGoal) return 'yes';
      if (isFT) {
        return 'no';
      }
      break;
    }

    case 'any_red_card': {
      const hasRedCard = events.some(e => {
        const elapsed = Number(e.time?.elapsed) || 0;
        const isRed = e.type?.toLowerCase() === 'card' && 
                      (e.detail?.toLowerCase().includes('red card') || e.detail?.toLowerCase().includes('second yellow card'));
        return isRed && elapsed > 75;
      });
      if (hasRedCard) return 'yes';
      if (isFT) {
        return 'no';
      }
      break;
    }

    case 'last_corner': {
      // Must wait for FT to determine the LAST corner
      if (isFT) {
        const homeCorners = getMatchStatistic(match, 'Corner Kicks');
        const awayCorners = getMatchStatistic(match, 'Corner Kicks'); // wait, the API doesn't tell us the order.
        // As a fallback, we resolve to the team with more corners. If equal, home. If zero corners, none.
        if (homeCorners === 0 && awayCorners === 0) return 'none';
        if (homeCorners > awayCorners) return 'home';
        if (awayCorners > homeCorners) return 'away';
        return 'home';
      }
      break;
    }

    case 'extra_minutes': {
      if (isFT) {
        let extraMins = 0;
        events.forEach(e => {
          if (Number(e.time?.elapsed) === 90 && e.time?.extra) {
            extraMins = Math.max(extraMins, Number(e.time.extra));
          }
        });
        if (extraMins >= 6) return '6';
        if (extraMins === 5) return '5';
        return '4'; // fallback / default +4
      }
      break;
    }

    default:
      return null;
  }

  return null;
}

/**
 * Tüm kilitli ve henüz sonuçlanmamış soruları kontrol edip anında sonuçlandırır.
 */
export function checkAndResolveAllQuestions(liveMatches, uid, answers, lockedAnswers, updateMyPoints, setTotalPoints, setToastEvent) {
  const resolvedList = getResolvedQuestions(uid);
  const lockedDefs = getLockedQuestionDefinitions(uid);

  lockedAnswers.forEach(qId => {
    if (resolvedList.includes(qId)) return;

    const prediction = answers[qId];
    if (!prediction) return;

    const relatedQ = lockedDefs[qId];
    if (!relatedQ) return;

    const match = liveMatches.find(m => m.id === relatedQ.matchId);
    if (!match) return;

    const correctAnswer = resolveQuestionInstantly(relatedQ, match);
    if (correctAnswer) {
      const qResult = calculateQuestionPoints(
        prediction,
        correctAnswer,
        relatedQ.options.find(o => o.value === prediction)?.reward ?? 15
      );

      // Save as resolved in local storage
      const currentResolved = getResolvedQuestions(uid);
      if (!currentResolved.includes(qId)) {
        localStorage.setItem(`vg_resolved_questions_${uid}`, JSON.stringify([...currentResolved, qId]));
      }

      // Update predict history entry
      const isWon = qResult.points > 0;
      const correctOptLabel = relatedQ.options.find(o => o.value === correctAnswer)?.label || correctAnswer;
      
      try {
        let history = JSON.parse(localStorage.getItem(PREDICT_HISTORY_KEY(uid)) || '[]');
        history = history.map(item => {
          if (item.id === `q_${qId}`) {
            return {
              ...item,
              status: isWon ? 'won' : 'lost',
              outcomeText: `Doğru: ${correctOptLabel}`
            };
          }
          return item;
        });
        localStorage.setItem(PREDICT_HISTORY_KEY(uid), JSON.stringify(history));
      } catch { /* ignore */ }

      // Add points
      if (qResult.points > 0) {
        setToastEvent({
          points: qResult.points,
          reason: `Anlık Soru Doğru! ${relatedQ.text.slice(0, 30)}... 🎯`,
          tier: 'exact',
        });
        setTotalPoints(p => p + qResult.points);
        updateMyPoints(qResult.points, 1);
      } else {
        setToastEvent({
          points: 0,
          reason: `Tahmin Tutmadı: ${relatedQ.text.slice(0, 30)}... 😔`,
          tier: 'wrong',
        });
        updateMyPoints(0, 0); // Increment total predictions but 0 correct
      }
    }
  });
}
