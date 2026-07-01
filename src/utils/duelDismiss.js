const DUEL_KEY = 'vg_dismissed_duels';
const PRED_KEY = 'vg_dismissed_pred_duels';
const MAX = 50;

function readSet(key) {
  try {
    const raw = sessionStorage.getItem(key);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function writeSet(key, set) {
  try {
    sessionStorage.setItem(key, JSON.stringify([...set].slice(-MAX)));
  } catch { /* ignore */ }
}

export function dismissDuelSession(id) {
  if (!id) return;
  const s = readSet(DUEL_KEY);
  s.add(id);
  writeSet(DUEL_KEY, s);
}

export function isDuelSessionDismissed(id) {
  return id ? readSet(DUEL_KEY).has(id) : false;
}

export function dismissPredDuel(id) {
  if (!id) return;
  const s = readSet(PRED_KEY);
  s.add(id);
  writeSet(PRED_KEY, s);
}

export function isPredDuelDismissed(id) {
  return id ? readSet(PRED_KEY).has(id) : false;
}
