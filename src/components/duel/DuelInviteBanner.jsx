import { getChallengeById } from '../../constants/duelChallenges';

export default function DuelInviteBanner({ invite, theme, onAccept, onDecline, loading }) {
  const t = theme;
  const challenge = getChallengeById(invite.challengeId);

  return (
    <div style={{
      position: 'fixed',
      top: 'calc(12px + env(safe-area-inset-top, 0px))',
      left: '50%',
      transform: 'translateX(-50%)',
      width: 'calc(100% - 24px)',
      maxWidth: 560,
      zIndex: 9000,
      padding: '14px 16px',
      borderRadius: 16,
      background: 'rgba(24,24,27,0.96)',
      border: `1px solid ${t.accentBorder}`,
      boxShadow: `0 12px 40px rgba(0,0,0,0.5), 0 0 24px ${t.glowSoft}`,
      fontFamily: 'Inter,sans-serif',
      animation: 'vg-toast-in 0.35s ease both',
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 4 }}>
        ⚔️ {invite.fromUsername || 'Bir oyuncu'} sana düello daveti gönderdi!
      </div>
      <div style={{ fontSize: 12, color: t.accent, marginBottom: 12 }}>
        Challenge: {challenge.icon} {challenge.label}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          disabled={loading}
          onClick={() => onAccept(invite)}
          style={{
            flex: 1, padding: '10px', borderRadius: 10, border: 'none',
            background: `linear-gradient(135deg,${t.accent},${t.accentAlt})`,
            color: t.tabActiveText, fontWeight: 800, fontSize: 12, cursor: 'pointer',
          }}
        >
          Kabul Et
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => onDecline(invite)}
          style={{
            flex: 1, padding: '10px', borderRadius: 10,
            border: `1px solid ${t.border}`, background: 'transparent',
            color: '#aaa', fontWeight: 700, fontSize: 12, cursor: 'pointer',
          }}
        >
          Reddet
        </button>
      </div>
    </div>
  );
}
