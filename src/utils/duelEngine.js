import { getChallengeById } from '../constants/duelChallenges';

/** Deterministik seed — aynı duelId her zaman aynı draft */
export function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function createSeededRng(seed) {
  let s = hashSeed(String(seed));
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function shuffleWithSeed(items, seed) {
  const rng = createSeededRng(seed);
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Challenge skoru hesapla — düşük/yüksek kazanır */
export function computeSquadScore(players, challengeId) {
  const challenge = getChallengeById(challengeId);
  const metric = challenge.metric;
  const values = players.map((p) => Number(p[metric]) || 0).filter((v) => v > 0);
  if (values.length === 0) return 0;

  if (metric === 'marketValueM') {
    return values.reduce((a, b) => a + b, 0);
  }
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function determineWinner(challengeId, scoreA, scoreB) {
  const challenge = getChallengeById(challengeId);
  const goal = challenge.goal;

  if (scoreA === scoreB) return 'draw';
  if (goal === 'min') return scoreA < scoreB ? 'playerA' : 'playerB';
  return scoreA > scoreB ? 'playerA' : 'playerB';
}

export function resolveWinnerUid(session, winnerSide) {
  if (winnerSide === 'draw') return null;
  if (winnerSide === 'playerA') return session.playerAUid;
  return session.playerBUid;
}

export function formatChallengeMetric(player, challenge) {
  if (!player || !challenge) return '—';
  const val = Number(player[challenge.metric]);
  if (!Number.isFinite(val)) return '—';
  if (challenge.metric === 'age') return `${val} yaş`;
  if (challenge.metric === 'heightCm') return `${val} cm`;
  if (challenge.metric === 'marketValueM') return `${val}M€`;
  return String(val);
}

export function buildRevealResult(session, playerMap) {
  const picksA = session.picks?.[session.playerAUid] || {};
  const picksB = session.picks?.[session.playerBUid] || {};

  const squadA = Object.values(picksA).map((id) => playerMap[id]).filter(Boolean);
  const squadB = Object.values(picksB).map((id) => playerMap[id]).filter(Boolean);

  const scoreA = session.scoreA ?? computeSquadScore(squadA, session.challengeId);
  const scoreB = session.scoreB ?? computeSquadScore(squadB, session.challengeId);
  const winnerSide = session.winnerSide ?? determineWinner(session.challengeId, scoreA, scoreB);
  const winnerUid = session.winnerUid ?? resolveWinnerUid(session, winnerSide);

  return {
    scoreA,
    scoreB,
    winnerSide,
    winnerUid,
    squadA,
    squadB,
    challenge: getChallengeById(session.challengeId),
  };
}

/** Oturumdaki tüm pick id'leri */
export function collectSessionPlayerIds(session) {
  const ids = new Set();
  Object.values(session?.picks || {}).forEach((bySlot) => {
    if (bySlot && typeof bySlot === 'object') {
      Object.values(bySlot).forEach((id) => {
        if (typeof id === 'string' && id) ids.add(id);
      });
    }
  });
  return ids;
}

/** Draft kart snapshot'larından anında oyuncu haritası */
export function buildPlayerMapFromDraft(session) {
  const map = {};
  (session?.draftRounds || []).forEach((round) => {
    const bundles = round.optionsByPlayer
      ? Object.values(round.optionsByPlayer)
      : round.options ? [round.options] : [];
    bundles.forEach((opts) => {
      (opts || []).forEach((snap) => {
        if (snap?.id) map[snap.id] = { ...map[snap.id], ...snap };
      });
    });
  });
  return map;
}

export function mergePlayerMaps(...maps) {
  return Object.assign({}, ...maps);
}
