/* ═══════════════════════════════════════════════════════════════
   VibeGoal — Scoring Engine
   Tamamen pure fonksiyonlar, harici bağımlılık yok.
═══════════════════════════════════════════════════════════════ */

/* ───────────────────────────────────────────────
   SABITLER
─────────────────────────────────────────────── */
export const POINTS = {
  PARTICIPATION:   5,   // tahmin kaydedildiğinde (maç başlamadan)
  EXACT_SCORE:    50,   // skor birebir doğru
  CORRECT_RESULT: 20,   // sonuç (K/B/M) doğru ama skor yanlış
  WRONG:           0,   // tamamen yanlış
}

export const BADGE_THRESHOLDS = {
  PROFESSOR_RATE:  0.70,  // %70 üzeri → Futbol Profesörü
  DREAMER_RATE:    0.20,  // %20 altı  → Hayalperest Balon
  MIN_PREDICTIONS: 5,     // rozet tetiklenmesi için minimum tahmin
}

/* ───────────────────────────────────────────────
   YARDIMCI: maç sonucunu çıkar
   returns: 'home' | 'draw' | 'away'
─────────────────────────────────────────────── */
export function getMatchResult(homeScore, awayScore) {
  if (homeScore > awayScore) return 'home'
  if (homeScore < awayScore) return 'away'
  return 'draw'
}

/* ───────────────────────────────────────────────
   TEMEL PUANLAMA FONKSİYONU

   @param prediction  { homeScore: number, awayScore: number }
   @param actual      { homeScore: number, awayScore: number }
   @returns           { points: number, reason: string, tier: 'exact'|'result'|'wrong' }
─────────────────────────────────────────────── */
export function calculateMatchPoints(prediction, actual) {
  const exactHome = Number(prediction.homeScore)
  const exactAway = Number(prediction.awayScore)
  const realHome  = Number(actual.homeScore)
  const realAway  = Number(actual.awayScore)

  // 1. Birebir skor doğru
  if (exactHome === realHome && exactAway === realAway) {
    return {
      points: POINTS.EXACT_SCORE,
      reason: `Skor birebir! (${realHome}-${realAway})`,
      tier: 'exact',
    }
  }

  // 2. Sonuç doğru (ama skor yanlış)
  const predictedResult = getMatchResult(exactHome, exactAway)
  const actualResult    = getMatchResult(realHome, realAway)

  if (predictedResult === actualResult) {
    return {
      points: POINTS.CORRECT_RESULT,
      reason: `Sonuç doğru (${actualResult === 'home' ? 'Ev sahibi kazandı' : actualResult === 'away' ? 'Deplasman kazandı' : 'Berabere'})`,
      tier: 'result',
    }
  }

  // 3. Tamamen yanlış
  return {
    points: POINTS.WRONG,
    reason: 'Tahmin tutmadı 😔',
    tier: 'wrong',
  }
}

/* ───────────────────────────────────────────────
   ANLIQ SORU PUANLAMASI
   Doğru/yanlış cevap seçimiyle çalışır.

   @param selected   string  — kullanıcının seçimi
   @param correct    string  — doğru cevap
   @param bonusPoints number — soruya özel bonus (ör: +15)
   @returns          { points: number, correct: boolean }
─────────────────────────────────────────────── */
export function calculateQuestionPoints(selected, correct, bonusPoints = 15) {
  if (selected === correct) {
    return { points: bonusPoints, correct: true }
  }
  return { points: 0, correct: false }
}

/* ───────────────────────────────────────────────
   KATİLIM PUANI
   Tahmin kaydedildiği anda +5 puan.
─────────────────────────────────────────────── */
export function getParticipationPoints() {
  return POINTS.PARTICIPATION
}

/* ───────────────────────────────────────────────
   DİNAMİK ROZET ATAMA
   Tahmin istatistiklerine göre rozet döndürür.

   @param stats { total: number, correct: number }
   @returns     string | null  — rozet anahtarı
─────────────────────────────────────────────── */
export function computeDynamicBadge(stats) {
  const { total, correct } = stats

  // Yeterli tahmin yoksa rozet yok
  if (total < BADGE_THRESHOLDS.MIN_PREDICTIONS) return null

  const rate = correct / total

  if (rate >= BADGE_THRESHOLDS.PROFESSOR_RATE)  return 'prof'    // Futbol Profesörü
  if (rate < BADGE_THRESHOLDS.DREAMER_RATE)     return 'hayal'   // Hayalperest Balon
  return null // Aradaki range: rozetsiz
}

/* ───────────────────────────────────────────────
   PUAN SINIFLANDIRMA (UI renk/label için)
─────────────────────────────────────────────── */
export function getPointTierMeta(tier) {
  const map = {
    exact:  { color: '#a3e635', label: '⭐ Birebir Doğru!',  bg: 'rgba(163,230,53,0.12)' },
    result: { color: '#facc15', label: '✅ Sonuç Doğru',     bg: 'rgba(250,204,21,0.10)' },
    wrong:  { color: '#f43f5e', label: '❌ Tutmadı',          bg: 'rgba(244,63,94,0.10)' },
  }
  return map[tier] || map.wrong
}

/* ───────────────────────────────────────────────
   LEADERBOARD SIRALAMA
   Oyuncuları puana, sonra doğru tahmine göre sıralar.
─────────────────────────────────────────────── */
export function sortLeaderboard(players) {
  return [...players].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    return b.correct - a.correct
  })
}

/* ───────────────────────────────────────────────
   PUAN HESAPLAMA — TÜM TAHMİNLER

   Bir oyuncunun tüm tahminlerinden toplam puanı hesaplar.
   @param predictions Array<{ prediction, actual, questionPoints }>
   @returns { total, matchPoints, questionPoints, participationPoints }
─────────────────────────────────────────────── */
export function calculateTotalPoints(predictions = [], questionAnswers = []) {
  const participationPoints = predictions.length * POINTS.PARTICIPATION

  const matchPoints = predictions.reduce((sum, p) => {
    if (!p.actual) return sum // maç henüz bitmedi
    return sum + calculateMatchPoints(p.prediction, p.actual).points
  }, 0)

  const qPoints = questionAnswers.reduce((sum, qa) => {
    return sum + (qa.correct ? qa.bonus : 0)
  }, 0)

  return {
    total: participationPoints + matchPoints + qPoints,
    matchPoints,
    questionPoints: qPoints,
    participationPoints,
  }
}
