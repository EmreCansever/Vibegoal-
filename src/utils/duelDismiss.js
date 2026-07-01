const DUEL_KEY = 'vg_dismissed_duels';
const PRED_KEY = 'vg_dismissed_pred_duels';
const SEEN_DUEL_INVITE_KEY = 'vg_seen_duel_invites';
const SEEN_PRED_INVITE_KEY = 'vg_seen_pred_invites';
const MAX = 80;

function userKey(base, uid) {
  return uid ? `${base}_${uid}` : base;
}

function readSet(key) {
  try {
    const raw = localStorage.getItem(key);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function writeSet(key, set) {
  try {
    localStorage.setItem(key, JSON.stringify([...set].slice(-MAX)));
  } catch { /* ignore */ }
}

export function dismissDuelSession(id, uid) {
  if (!id) return;
  const s = readSet(userKey(DUEL_KEY, uid));
  s.add(id);
  writeSet(userKey(DUEL_KEY, uid), s);
}

export function isDuelSessionDismissed(id, uid) {
  return id ? readSet(userKey(DUEL_KEY, uid)).has(id) : false;
}

export function dismissPredDuel(id, uid) {
  if (!id) return;
  const s = readSet(userKey(PRED_KEY, uid));
  s.add(id);
  writeSet(userKey(PRED_KEY, uid), s);
}

export function isPredDuelDismissed(id, uid) {
  return id ? readSet(userKey(PRED_KEY, uid)).has(id) : false;
}

export function markDuelInviteHandled(inviteId, uid) {
  if (!inviteId) return;
  const s = readSet(userKey(SEEN_DUEL_INVITE_KEY, uid));
  s.add(inviteId);
  writeSet(userKey(SEEN_DUEL_INVITE_KEY, uid), s);
}

export function isDuelInviteHandled(inviteId, uid) {
  return inviteId ? readSet(userKey(SEEN_DUEL_INVITE_KEY, uid)).has(inviteId) : false;
}

export function markPredInviteHandled(inviteId, uid) {
  if (!inviteId) return;
  const s = readSet(userKey(SEEN_PRED_INVITE_KEY, uid));
  s.add(inviteId);
  writeSet(userKey(SEEN_PRED_INVITE_KEY, uid), s);
}

export function isPredInviteHandled(inviteId, uid) {
  return inviteId ? readSet(userKey(SEEN_PRED_INVITE_KEY, uid)).has(inviteId) : false;
}
