import { useState, useEffect, useCallback, useRef } from 'react';
import DuelChallengePicker from './DuelChallengePicker';
import DuelOpponentPicker from './DuelOpponentPicker';
import DuelDraftScreen from './DuelDraftScreen';
import DuelResultScreen from './DuelResultScreen';
import DuelInviteBanner from './DuelInviteBanner';
import { duelService } from '../../services/duelService';
import { DUEL_STATUS } from '../../constants/duelChallenges';
import { useDuelSession, useActiveDuelSession } from '../../hooks/useDuelSession';

/**
 * Canlı Düello — Firestore Session Room akışı
 * phase: hub | opponent | draft | result
 */
export default function DuelFlow({
  open,
  onClose,
  theme,
  currentUser,
  opponents = [],
  userProfile,
  onWin,
}) {
  const t = theme;
  const [phase, setPhase] = useState('hub');
  const [challengeId, setChallengeId] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [incomingInvites, setIncomingInvites] = useState([]);
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
    if (!active?.id || sessionId) return;
    setSessionId(active.id);
    if (active.status === DUEL_STATUS.DRAFT) setPhase('draft');
    else if (active.status === DUEL_STATUS.REVEAL || active.status === DUEL_STATUS.FINISHED) {
      setPhase('result');
    }
  }, [sessionId]);

  useActiveDuelSession(currentUser?.uid, handleResumeSession);

  useEffect(() => {
    if (!open) {
      setPhase('hub');
      setChallengeId(null);
      setSessionId(null);
      winHandledRef.current = false;
    }
  }, [open]);

  useEffect(() => {
    if (!currentUser?.uid) return undefined;
    return duelService.subscribeIncomingInvites(currentUser.uid, setIncomingInvites);
  }, [currentUser?.uid]);

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
      await duelService.sendInvite({
        toUid: opponent.id,
        challengeId,
        fromProfile: {
          username: userProfile?.username || currentUser?.username,
          avatar: userProfile?.avatar || '',
        },
      });
      setToast(`✓ ${opponent.name} oyuncusuna davet gönderildi!`);
      setTimeout(() => {
        setToast('');
        onClose();
      }, 2000);
    } catch (err) {
      setToast(err?.message || 'Davet gönderilemedi.');
    } finally {
      setInviteLoading(false);
    }
  }, [challengeId, currentUser, userProfile, onClose]);

  const handleAcceptInvite = useCallback(async (invite) => {
    setInviteLoading(true);
    try {
      const { sessionId: sid } = await duelService.acceptInvite(invite.id, {
        username: userProfile?.username || currentUser?.username,
        avatar: userProfile?.avatar || '',
      });
      setSessionId(sid);
      setPhase('draft');
      winHandledRef.current = false;
    } catch (err) {
      setToast(err?.message || 'Davet kabul edilemedi.');
    } finally {
      setInviteLoading(false);
    }
  }, [currentUser, userProfile]);

  const handleDeclineInvite = useCallback(async (invite) => {
    await duelService.declineInvite(invite.id);
  }, []);

  if (!open) return null;

  const pendingInvite = incomingInvites[0];

  return (
    <>
      {pendingInvite && phase === 'hub' && !sessionId && (
        <DuelInviteBanner
          invite={pendingInvite}
          theme={t}
          loading={inviteLoading}
          onAccept={handleAcceptInvite}
          onDecline={handleDeclineInvite}
        />
      )}

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
