import { DUEL_CHALLENGES } from '../../constants/duelChallenges';
import { playClickSound } from '../../utils/audioEngine';

export default function DuelChallengePicker({ theme, onSelect, onBack }) {
  const t = theme;

  return (
    <div style={{ padding: '20px 16px', flex: 1, overflowY: 'auto' }} className="scroll-hide">
      <button type="button" onClick={onBack} style={backBtnStyle}>← Geri</button>
      <h2 style={{ fontSize: 22, fontWeight: 900, margin: '12px 0 6px', color: '#fff' }}>
        Canlı Düello
      </h2>
      <p style={{ fontSize: 13, color: '#888', marginBottom: 20, lineHeight: 1.5 }}>
        Bir challenge seç, rakibini davet et ve gizli değerlerle ilk 11&apos;ini kur!
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {DUEL_CHALLENGES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => { playClickSound(); onSelect(c.id); }}
            style={{
              padding: '18px 14px',
              borderRadius: 16,
              border: `1px solid ${t.border}`,
              background: t.surface,
              cursor: 'pointer',
              textAlign: 'left',
              fontFamily: 'Inter,sans-serif',
            }}
          >
            <div style={{ fontSize: 28, marginBottom: 8 }}>{c.icon}</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', marginBottom: 4 }}>{c.label}</div>
            <div style={{ fontSize: 10, color: t.textMuted }}>{c.unit}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

const backBtnStyle = {
  background: 'none', border: 'none', color: '#888', fontSize: 14, cursor: 'pointer', padding: 0,
};
