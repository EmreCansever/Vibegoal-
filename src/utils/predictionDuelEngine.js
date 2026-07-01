import {
  calculateMatchPoints,
  calculateQuestionPoints,
  getParticipationPoints,
} from './scoringEngine';
import { resolveQuestionInstantly } from './questionEngine';

function getLockedQuestionDefinitions(uid) {
  try {
    const data = localStorage.getItem(`vg_locked_questions_def_${uid}`);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

/** Ana sayfadaki tahmin + anlık soru puanlarını maç bazında hesaplar */
export function computePredictionDuelScore({
  uid,
  matchId,
  match,
  matchPredictions = {},
  answers = {},
  lockedQuestionIds = new Set(),
}) {
  let total = 0;
  const breakdown = { participation: 0, matchResult: 0, questions: 0 };

  const pred = matchPredictions[matchId];
  if (pred) {
    const part = getParticipationPoints();
    breakdown.participation += part;
    total += part;
  }

  if (match?.status === 'FT' && pred) {
    const result = calculateMatchPoints(
      { homeScore: pred.homeScore, awayScore: pred.awayScore },
      { homeScore: match.homeScore, awayScore: match.awayScore },
    );
    breakdown.matchResult = result.points;
    total += result.points;
  }

  const lockedDefs = getLockedQuestionDefinitions(uid);
  lockedQuestionIds.forEach((qId) => {
    const answer = answers[qId];
    if (!answer) return;
    const q = lockedDefs[qId];
    if (!q || String(q.matchId) !== String(matchId)) return;

    const part = getParticipationPoints();
    breakdown.participation += part;
    total += part;

    if (match) {
      const correctAnswer = resolveQuestionInstantly(q, match);
      if (correctAnswer) {
        const reward = q.options?.find((o) => o.value === answer)?.reward ?? 15;
        const qResult = calculateQuestionPoints(answer, correctAnswer, reward);
        breakdown.questions += qResult.points;
        total += qResult.points;
      }
    }
  });

  return { total, breakdown };
}

export function mapPredDuelSide(session, uid) {
  if (!session) return null;
  const isPlayerA = session.playerAUid === uid;
  const myScore = session.scores?.[uid]?.total ?? 0;
  const theirUid = isPlayerA ? session.playerBUid : session.playerAUid;
  const theirScore = session.scores?.[theirUid]?.total ?? 0;
  return {
    isPlayerA,
    myScore,
    theirScore,
    myName: isPlayerA ? session.playerAName : session.playerBName,
    theirName: isPlayerA ? session.playerBName : session.playerAName,
    theirUid,
  };
}
