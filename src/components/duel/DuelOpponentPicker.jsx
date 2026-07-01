import { useState, useMemo } from 'react';

export default function DuelOpponentPicker({
  theme,
  opponents = [],
  onSelect,
  onBack,
  sending = false,
}) {
  const t = theme;
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return opponents;
    return opponents.filter((o) => (o.name || '').toLowerCase().includes(q));
  }, [opponents, search]);

  return (
    <div style={{ padding: '20px 16px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }} className="scroll-hide">
      <button type="button" onClick={onBack} style={backBtnStyle}>← Geri</button>
      <h2 style={{ fontSize: 20, fontWeight: 900, margin: '12px 0 6px', color: '#fff' }}>Rakip Seç</h2>
      <p style={{ fontSize: 12, color: '#888', marginBottom: 14 }}>Grubundaki veya arkadaş listendeki bir oyuncuya davet gönder.</p>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="İsim ara..."
        style={{
          width: '100%', padding: '12px 14px', borderRadius: 12, marginBottom: 16,
          background: 'rgba(255,255,255,0.06)', border: `1px solid ${t.border}`,
          color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box',
        }}
      />

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 32, color: '#666', fontSize: 13 }}>
          Rakip bulunamadı. Önce bir gruba katılın veya oda üyeleri yüklenene kadar bekleyin.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((o) => (
            <button
              key={o.id}
              type="button"
              disabled={sending}
              onClick={() => onSelect(o)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '14px 16px', borderRadius: 14,
                background: t.surface, border: `1px solid ${t.border}`,
                cursor: sending ? 'default' : 'pointer', opacity: sending ? 0.6 : 1,
                textAlign: 'left', fontFamily: 'Inter,sans-serif',
              }}
            >
              <div style={{
                width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
                background: t.accentSoft, border: `1px solid ${t.accentBorder}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18, overflow: 'hidden',
              }}>
                {o.avatar && o.avatar.startsWith('data:') ? (
                  <img src={o.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : '👤'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{o.name}</div>
                <div style={{ fontSize: 11, color: '#666' }}>{o.points ?? 0} puan</div>
              </div>
              <span style={{ color: t.accent, fontWeight: 800, fontSize: 12 }}>Davet →</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const backBtnStyle = {
  background: 'none', border: 'none', color: '#888', fontSize: 14, cursor: 'pointer', padding: 0,
};
