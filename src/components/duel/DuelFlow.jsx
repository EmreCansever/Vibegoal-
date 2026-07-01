import { useState, useEffect, useCallback, useRef } from 'react';
import DuelChallengePicker from './DuelChallengePicker';
import DuelOpponentPicker from './DuelOpponentPicker';
import DuelDraftScreen from './DuelDraftScreen';
import DuelResultScreen from './DuelResultScreen';
import { duelService } from '../../services/duelService';
import { DUEL_STATUS } from '../../constants/duelChallenges';
import { useDuelSession } from '../../hooks/useDuelSession';
import {
  playClickSound, playSendSound, playNotifySound, playErrorSound, playSuccessSound,
} from '../../utils/audioEngine';
import { isDuelSessionDismissed } from '../../utils/duelDismiss';

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
  const uid = currentUser?.uid;
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
  } = useDuelSession(sessionId, uid);

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
    if (isDuelSessionDismissed(initialSessionId, uid)) {
      onInitialSessionConsumed?.();
      return;
    }
    setSessionId(initialSessionId);
    setPhase('draft');
    setPendingInviteId(null);
    onInitialSessionConsumed?.();
  }, [open, initialSessionId, onInitialSessionConsumed, uid]);

  useEffect(() => {
    if (!pendingInviteId || phase !== 'waiting') return undefined;
    return duelService.subscribeInvite(pendingInviteId, uid, (invite) => {
      if (!invite) return;
      if (invite.status === 'accepted' && invite.sessionId) {
        playNotifySound();
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
  }, [pendingInviteId, phase, uid]);

  useEffect(() => {
    if (!session) return;
    if (session.status === DUEL_STATUS.DRAFT) setPhase('draft');
    if (session.status === DUEL_STATUS.REVEAL || session.status === DUEL_STATUS.FINISHED) {
      setPhase('result');
      if (
        session.winnerUid === uid
        && session.status === DUEL_STATUS.REVEAL
        && !winHandledRef.current
      ) {
        winHandledRef.current = true;
        onWin?.();
      }
    }
    if (session.status === DUEL_STATUS.CANCELLED) {
      setToast('Düello iptal edildi.');
      setSessionId(null);
      setPhase('hub');
    }
  }, [session, uid, onWin]);

  useEffect(() => {
    if (pickError) setToast(pickError);
  }, [pickError]);

  // Son tur bitti ama finalize gecikirse yeniden dene
  useEffect(() => {
    if (!sessionId || !session) return;
    if (session.status !== DUEL_STATUS.DRAFT) return;
    if (session.currentRound < session.totalRounds) return;
    if (session.myPickCount < 11 || session.theirPickCount < 11) return;
    duelService.finalizeDuel(sessionId).catch(() => {});
  }, [
    sessionId,
    session?.status,
    session?.currentRound,
    session?.totalRounds,
    session?.myPickCount,
    session?.theirPickCount,
  ]);

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
      playSendSound();
      setToast(`✓ ${opponent.name} oyuncusuna davet gönderildi — kabul bekleniyor…`);
    } catch (err) {
      playErrorSound();
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

  const quitActiveGame = useCallback(async () => {
    if (phase === 'waiting' && pendingInviteId) {
      await handleCancelWaiting();
    }
    if (sessionId && !isDuelSessionDismissed(sessionId, uid)) {
      onClose?.(sessionId);
      return;
    }
    await duelService.abandonAllActiveForUser(uid).catch(() => {});
    onClose?.();
  }, [phase, pendingInviteId, sessionId, uid, handleCancelWaiting, onClose]);

  const handleClose = useCallback(async () => {
    if (phase === 'hub') {
      onClose?.();
      return;
    }
    if (phase === 'result' && session?.status === DUEL_STATUS.FINISHED) {
      onClose?.();
      return;
    }
    await quitActiveGame();
  }, [phase, session?.status, quitActiveGame, onClose]);

  const handleForceQuit = useCallback(async () => {
    await quitActiveGame();
  }, [quitActiveGame]);

  const showForceQuit = phase !== 'hub';

  if (!open) return null;

  return (
    <>
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 450,
          background: 'rgba(0,0,0,0.88)',
        }}
        onClick={phase === 'hub' ? handleClose : undefined}
      />

      <div className="vg-duel-screen" style={{
        background: t.bg,
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {showForceQuit && (
              <button
                type="button"
                onClick={handleForceQuit}
                style={{
                  padding: '6px 10px', borderRadius: 8,
                  background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)',
                  color: '#f87171', fontSize: 11, fontWeight: 800, cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Oyunu Bitir
              </button>
            )}
            <button
              type="button"
              onClick={handleClose}
              style={{
                width: 34, height: 34, borderRadius: 10,
                background: 'rgba(255,255,255,0.06)', border: `1px solid ${t.border}`,
                color: '#888', fontSize: 16, cursor: 'pointer',
              }}
            >
              ✕
            </button>
          </div>
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
            onSelect={(id) => { playClickSound(); setChallengeId(id); setPhase('opponent'); }}
            onBack={handleClose}
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

        {phase === 'draft' && !session && sessionId && (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center',
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%',
              border: `3px solid ${t.accentBorder}`,
              borderTopColor: t.accent,
              animation: 'vg-spin 0.9s linear infinite',
              marginBottom: 16,
            }} />
            <div style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>Draft odası açılıyor…</div>
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
            onClose={() => onClose?.()}
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
