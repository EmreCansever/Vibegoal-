import DuelOpponentPicker from '../duel/DuelOpponentPicker';
import PredictionDuelMatchPicker from './PredictionDuelMatchPicker';
import { predictionDuelService } from '../../services/predictionDuelService';
import { mapPredDuelSide } from '../../utils/predictionDuelEngine';
import { PRED_DUEL_STATUS } from '../../constants/predictionDuel';
import { useCallback, useEffect, useState } from 'react';

function RaceTrack({ session, theme, currentUser }) {
  const t = theme;
  const side = mapPredDuelSide(session, currentUser?.uid);
  if (!side) return null;

  const max = Math.max(side.myScore, side.theirScore, 1);
  const myPct = Math.min(100, (side.myScore / max) * 100);
  const theirPct = Math.min(100, (side.theirScore / max) * 100);
  const match = session.matchSnapshot;

  return (
    <div style={{ padding: '16px', flex: 1, overflowY: 'auto' }} className="scroll-hide">
      <div style={{
        padding: 14, borderRadius: 14, marginBottom: 16,
        background: t.surface, border: `1px solid ${t.border}`, textAlign: 'center',
      }}>
        <div style={{ fontSize: 11, color: t.accent, fontWeight: 800, marginBottom: 6 }}>🏁 YARIŞ MAÇI</div>
        <div style={{ fontSize: 15, fontWeight: 900, color: '#fff' }}>
          {match?.homeFlag} {match?.home} vs {match?.away} {match?.awayFlag}
        </div>
        <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>
          {match?.status === 'FT' ? 'Maç Bitti' : `Durum: ${match?.status || '—'} ${match?.minute != null ? `· ${match.minute}'` : ''}`}
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#888', marginBottom: 6 }}>
          <span>Sen · {side.myScore} puan</span>
          <span>{side.theirScore} puan · Rakip</span>
        </div>
        <div style={{ position: 'relative', height: 12, borderRadius: 99, background: 'rgba(255,255,255,0.06)', overflow: 'hidden', marginBottom: 10 }}>
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0, width: `${myPct}%`,
            background: `linear-gradient(90deg, ${t.accent}, ${t.accentAlt})`,
            borderRadius: 99, transition: 'width 0.4s ease',
          }} />
        </div>
        <div style={{ position: 'relative', height: 12, borderRadius: 99, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0, width: `${theirPct}%`,
            background: 'linear-gradient(90deg, #64748b, #94a3b8)',
            borderRadius: 99, transition: 'width 0.4s ease',
          }} />
        </div>
      </div>

      <div style={{
        padding: 16, borderRadius: 14, background: t.accentSoft,
        border: `1px solid ${t.accentBorder}`, fontSize: 12, color: t.accent, lineHeight: 1.6,
      }}>
        Ana sayfadan bu maç için skor tahmini yap ve anlık soruları cevapla.
        Maç bitince toplam puanı yüksek olan kazanır.
      </div>
    </div>
  );
}

function ResultView({ session, theme, currentUser, onClose }) {
  const t = theme;
  const side = mapPredDuelSide(session, currentUser?.uid);
  const isWinner = session.winnerUid === currentUser?.uid;
  const isDraw = !session.winnerUid;

  return (
    <div style={{ padding: 24, flex: 1, textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 8 }}>{isDraw ? '🤝' : isWinner ? '🏆' : '😤'}</div>
      <div style={{ fontSize: 20, fontWeight: 900, color: isWinner ? t.accent : '#fff', marginBottom: 8 }}>
        {isDraw ? 'Berabere!' : isWinner ? 'Tahmin Düellosunu Kazandın!' : 'Tahmin Düellosu Kaybedildi'}
      </div>
      <div style={{
        display: 'flex', gap: 12, margin: '20px 0', padding: 16, borderRadius: 16,
        background: t.surface, border: `1px solid ${t.border}`,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: '#666' }}>SEN</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: t.accent }}>{side?.myScore ?? 0}</div>
        </div>
        <div style={{ width: 1, background: t.border }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: '#666' }}>RAKİP</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: '#fff' }}>{side?.theirScore ?? 0}</div>
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        style={{
          padding: '12px 24px', borderRadius: 12, border: 'none',
          background: `linear-gradient(135deg,${t.accent},${t.accentAlt})`,
          color: t.tabActiveText, fontWeight: 800, cursor: 'pointer',
        }}
      >
        Kapat
      </button>
    </div>
  );
}

export default function PredictionDuelFlow({
  open,
  onClose,
  theme,
  currentUser,
  userProfile,
  opponents = [],
  matches = [],
  initialDuelId = null,
  onInitialDuelConsumed,
}) {
  const t = theme;
  const [phase, setPhase] = useState('opponent');
  const [opponent, setOpponent] = useState(null);
  const [duelId, setDuelId] = useState(null);
  const [session, setSession] = useState(null);
  const [pendingInviteId, setPendingInviteId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    if (!open) {
      setPhase('opponent');
      setOpponent(null);
      setDuelId(null);
      setSession(null);
      setPendingInviteId(null);
      setToast('');
    }
  }, [open]);

  useEffect(() => {
    if (!open || !initialDuelId) return;
    setDuelId(initialDuelId);
    setPhase('live');
    onInitialDuelConsumed?.();
  }, [open, initialDuelId, onInitialDuelConsumed]);

  useEffect(() => {
    if (!duelId) return undefined;
    return predictionDuelService.subscribePredDuel(duelId, (next) => {
      setSession(next);
      if (next?.status === PRED_DUEL_STATUS.LIVE) setPhase('live');
      if (next?.status === PRED_DUEL_STATUS.FINISHED) setPhase('result');
    });
  }, [duelId]);

  useEffect(() => {
    if (!pendingInviteId || phase !== 'waiting') return undefined;
    return predictionDuelService.subscribeInvite(pendingInviteId, currentUser?.uid, (invite) => {
      if (invite?.status === 'accepted' && invite.duelId) {
        setPendingInviteId(null);
        setDuelId(invite.duelId);
        setPhase('live');
      }
      if (invite?.status === 'declined') {
        setToast('Rakip daveti reddetti.');
        setPendingInviteId(null);
        setPhase('match');
      }
    });
  }, [pendingInviteId, phase, currentUser?.uid]);

  const handleSelectOpponent = useCallback((o) => {
    setOpponent(o);
    setPhase('match');
  }, []);

  const handleSelectMatch = useCallback(async (match) => {
    if (!opponent) return;
    setLoading(true);
    setToast('');
    try {
      const invite = await predictionDuelService.sendInvite({
        toUid: opponent.id,
        match,
        fromProfile: {
          username: userProfile?.username || currentUser?.username,
          avatar: userProfile?.avatar || '',
        },
      });
      setPendingInviteId(invite.id);
      setPhase('waiting');
      setToast(`✓ ${opponent.name} oyuncusuna davet gönderildi`);
    } catch (err) {
      setToast(err?.message || 'Davet gönderilemedi.');
    } finally {
      setLoading(false);
    }
  }, [opponent, currentUser, userProfile]);

  const handleCancelWaiting = useCallback(async () => {
    if (pendingInviteId) await predictionDuelService.cancelInvite(pendingInviteId);
    setPendingInviteId(null);
    setPhase('match');
    setToast('');
  }, [pendingInviteId]);

  if (!open) return null;

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 440, background: 'rgba(0,0,0,0.88)' }} />
      <div className="vg-duel-screen" style={{ zIndex: 441, background: t.bg, color: '#fff', fontFamily: 'Inter,sans-serif' }}>
        <div className="vg-top-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${t.border}` }}>
          <div style={{ fontSize: 17, fontWeight: 900 }}>🏁 Tahmin Düellosu</div>
          <button type="button" onClick={onClose} style={{
            width: 34, height: 34, borderRadius: 10, background: 'rgba(255,255,255,0.06)',
            border: `1px solid ${t.border}`, color: '#888', cursor: 'pointer',
          }}>✕</button>
        </div>

        {toast && (
          <div style={{
            margin: '8px 16px 0', padding: '10px 14px', borderRadius: 10,
            background: t.accentSoft, border: `1px solid ${t.accentBorder}`,
            color: t.accent, fontSize: 12, fontWeight: 600,
          }}>{toast}</div>
        )}

        {phase === 'opponent' && (
          <DuelOpponentPicker
            theme={t}
            opponents={opponents.filter((o) => !o.isMe)}
            sending={loading}
            actionLabel="Seç →"
            onSelect={handleSelectOpponent}
            onBack={onClose}
          />
        )}

        {phase === 'match' && (
          <PredictionDuelMatchPicker
            theme={t}
            matches={matches}
            sending={loading}
            onSelect={handleSelectMatch}
            onBack={() => setPhase('opponent')}
          />
        )}

        {phase === 'waiting' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center' }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%', border: `3px solid ${t.accentBorder}`,
              borderTopColor: t.accent, animation: 'vg-spin 0.9s linear infinite', marginBottom: 20,
            }} />
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>Rakip bekleniyor…</div>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 24 }}>
              {opponent?.name} kabul edince yarış başlayacak.
            </div>
            <button type="button" onClick={handleCancelWaiting} style={{
              padding: '10px 20px', borderRadius: 10, border: `1px solid ${t.border}`,
              background: 'transparent', color: '#aaa', fontWeight: 700, cursor: 'pointer',
            }}>Daveti İptal Et</button>
          </div>
        )}

        {phase === 'live' && session && (
          <RaceTrack session={session} theme={t} currentUser={currentUser} />
        )}

        {phase === 'result' && session && (
          <ResultView session={session} theme={t} currentUser={currentUser} onClose={onClose} />
        )}
      </div>
    </>
  );
}
