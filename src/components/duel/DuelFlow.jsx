import { useState, useEffect, useCallback, useRef } from 'react';
import DuelChallengePicker from './DuelChallengePicker';
import DuelOpponentPicker from './DuelOpponentPicker';
import DuelDraftScreen from './DuelDraftScreen';
import DuelResultScreen from './DuelResultScreen';
import { duelService } from '../../services/duelService';
import { DUEL_STATUS } from '../../constants/duelChallenges';
import { useDuelSession, useActiveDuelSession } from '../../hooks/useDuelSession';

/**
 * Canlı Düello — Firestore Session Room akışı
 * phase: hub | opponent | waiting | draft | result
 */
export default function DuelFlow({
  open,
  onClose,
  theme,
  currentUser,
  opponents = [],
  userProfile,
  onWin,
  initialSessionId = null,
  onInitialSessionConsumed,
}) {
  const t = theme;
  const [phase, setPhase] = useState('hub');
  const [challengeId, setChallengeId] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [pendingInviteId, setPendingInviteId] = useState(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [toast, setToast] = useState('');
  const winHandledRef = useRef(false);

  const {
    session,
    lastSyncMs,
    picking,
    error: pickError,
    pickPlayer,
  } = useDuelSession(sessionId, currentUser?.uid);

  const handleResumeSession = useCallback((active) => {
    if (!active?.id) return;
    setSessionId((prev) => (prev === active.id ? prev : active.id));
    if (active.status === DUEL_STATUS.DRAFT) setPhase('draft');
    else if (active.status === DUEL_STATUS.REVEAL || active.status === DUEL_STATUS.FINISHED) {
      setPhase('result');
    }
  }, []);

  useActiveDuelSession(currentUser?.uid, handleResumeSession);

  useEffect(() => {
    if (!open) {
      setPhase('hub');
      setChallengeId(null);
      setSessionId(null);
      setPendingInviteId(null);
      winHandledRef.current = false;
    }
  }, [open]);

  useEffect(() => {
    if (!open || !initialSessionId) return;
    setSessionId(initialSessionId);
    setPhase('draft');
    setPendingInviteId(null);
    onInitialSessionConsumed?.();
  }, [open, initialSessionId, onInitialSessionConsumed]);

  useEffect(() => {
    if (!pendingInviteId || phase !== 'waiting') return undefined;
    return duelService.subscribeInvite(pendingInviteId, currentUser?.uid, (invite) => {
      if (!invite) return;
      if (invite.status === 'accepted' && invite.sessionId) {
        setPendingInviteId(null);
        setSessionId(invite.sessionId);
        setPhase('draft');
        winHandledRef.current = false;
      }
      if (invite.status === 'declined') {
        setToast('Rakip daveti reddetti.');
        setPendingInviteId(null);
        setPhase('opponent');
      }
    });
  }, [pendingInviteId, phase, currentUser?.uid]);

  useEffect(() => {
    if (!session) return;
    if (session.status === DUEL_STATUS.DRAFT) setPhase('draft');
    if (session.status === DUEL_STATUS.REVEAL || session.status === DUEL_STATUS.FINISHED) {
      setPhase('result');
      if (
        session.winnerUid === currentUser.uid
        && session.status === DUEL_STATUS.REVEAL
        && !winHandledRef.current
      ) {
        winHandledRef.current = true;
        onWin?.();
      }
    }
  }, [session, currentUser?.uid, onWin]);

  useEffect(() => {
    if (pickError) setToast(pickError);
  }, [pickError]);

  const handleSendInvite = useCallback(async (opponent) => {
    setInviteLoading(true);
    setToast('');
    try {
      const invite = await duelService.sendInvite({
        toUid: opponent.id,
        challengeId,
        fromProfile: {
          username: userProfile?.username || currentUser?.username,
          avatar: userProfile?.avatar || '',
        },
      });
      setPendingInviteId(invite.id);
      setPhase('waiting');
      setToast(`✓ ${opponent.name} oyuncusuna davet gönderildi — kabul bekleniyor…`);
    } catch (err) {
      setToast(err?.message || 'Davet gönderilemedi.');
    } finally {
      setInviteLoading(false);
    }
  }, [challengeId, currentUser, userProfile]);

  const handleCancelWaiting = useCallback(async () => {
    if (pendingInviteId) {
      try {
        await duelService.cancelInvite(pendingInviteId);
      } catch { /* ignore */ }
    }
    setPendingInviteId(null);
    setPhase('opponent');
    setToast('');
  }, [pendingInviteId]);

  if (!open) return null;

  return (
    <>
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 450,
          background: 'rgba(0,0,0,0.88)',
        }}
        onClick={phase === 'hub' ? onClose : undefined}
      />

      <div className="vg-screen-fill" style={{
        position: 'fixed', inset: 0, zIndex: 451,
        maxWidth: 600, margin: '0 auto',
        background: t.bg,
        display: 'flex', flexDirection: 'column',
        fontFamily: 'Inter,sans-serif',
        color: '#fff',
      }}>
        <div className="vg-top-bar" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: `1px solid ${t.border}`, flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 900 }}>⚔️ Canlı Düello</div>
            {sessionId && phase === 'draft' && (
              <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>
                Oda: {sessionId.slice(-8)} · v{session?.version ?? 0}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 34, height: 34, borderRadius: 10,
              background: 'rgba(255,255,255,0.06)', border: `1px solid ${t.border}`,
              color: '#888', fontSize: 16, cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        {toast && (
          <div style={{
            margin: '8px 16px 0', padding: '10px 14px', borderRadius: 10,
            background: t.accentSoft, border: `1px solid ${t.accentBorder}`,
            color: t.accent, fontSize: 12, fontWeight: 600,
          }}>
            {toast}
          </div>
        )}

        {phase === 'hub' && (
          <DuelChallengePicker
            theme={t}
            onSelect={(id) => { setChallengeId(id); setPhase('opponent'); }}
            onBack={onClose}
          />
        )}

        {phase === 'opponent' && (
          <DuelOpponentPicker
            theme={t}
            opponents={opponents.filter((o) => !o.isMe)}
            sending={inviteLoading}
            onSelect={handleSendInvite}
            onBack={() => setPhase('hub')}
          />
        )}

        {phase === 'waiting' && (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center',
          }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              border: `3px solid ${t.accentBorder}`,
              borderTopColor: t.accent,
              animation: 'vg-spin 0.9s linear infinite',
              marginBottom: 20,
            }} />
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>Rakip bekleniyor…</div>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 24, lineHeight: 1.5 }}>
              Davet anlık iletildi. Rakip kabul edince draft otomatik başlayacak.
            </div>
            <button
              type="button"
              onClick={handleCancelWaiting}
              style={{
                padding: '10px 20px', borderRadius: 10,
                border: `1px solid ${t.border}`, background: 'transparent',
                color: '#aaa', fontWeight: 700, fontSize: 12, cursor: 'pointer',
              }}
            >
              Daveti İptal Et
            </button>
          </div>
        )}

        {phase === 'draft' && session && (
          <DuelDraftScreen
            session={session}
            theme={t}
            onPick={pickPlayer}
            picking={picking}
            lastSyncMs={lastSyncMs}
          />
        )}

        {phase === 'result' && session && (
          <DuelResultScreen
            session={session}
            theme={t}
            currentUser={currentUser}
            onClose={onClose}
            onRematch={() => {
              setSessionId(null);
              winHandledRef.current = false;
              setPhase('hub');
            }}
          />
        )}
      </div>
    </>
  );
}
