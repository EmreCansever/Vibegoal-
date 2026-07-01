import { useState, useMemo } from 'react';

export default function PredictionDuelMatchPicker({ theme, matches = [], onSelect, onBack, sending = false }) {
  const t = theme;
  const [search, setSearch] = useState('');

  const pickable = useMemo(() => {
    return matches.filter((m) => m && !['FT', 'AET', 'PEN', 'CANC', 'ABD'].includes(m.status));
  }, [matches]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return pickable;
    return pickable.filter((m) => `${m.home} ${m.away}`.toLowerCase().includes(q));
  }, [pickable, search]);

  return (
    <div style={{ padding: '20px 16px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }} className="scroll-hide">
      <button type="button" onClick={onBack} style={backBtnStyle}>← Geri</button>
      <h2 style={{ fontSize: 20, fontWeight: 900, margin: '12px 0 6px', color: '#fff' }}>Maç Seç</h2>
      <p style={{ fontSize: 12, color: '#888', marginBottom: 14 }}>
        Düello boyunca bu maç için ana sayfada yaptığın tahminler puanlanır.
      </p>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Takım ara..."
        style={{
          width: '100%', padding: '12px 14px', borderRadius: 12, marginBottom: 16,
          background: 'rgba(255,255,255,0.06)', border: `1px solid ${t.border}`,
          color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box',
        }}
      />

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 32, color: '#666', fontSize: 13 }}>
          Şu an düello için uygun canlı maç yok.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((m) => (
            <button
              key={m.id}
              type="button"
              disabled={sending}
              onClick={() => onSelect(m)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '14px 16px', borderRadius: 14,
                background: t.surface, border: `1px solid ${t.border}`,
                cursor: sending ? 'default' : 'pointer', opacity: sending ? 0.6 : 1,
                textAlign: 'left', fontFamily: 'Inter,sans-serif',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', marginBottom: 4 }}>
                  {m.homeFlag} {m.home} vs {m.away} {m.awayFlag}
                </div>
                <div style={{ fontSize: 11, color: '#666' }}>
                  {m.status === 'NS' ? 'Başlamadı' : `Canlı · ${m.minute ?? '—'}'`}
                  {m.homeScore != null ? ` · ${m.homeScore}:${m.awayScore}` : ''}
                </div>
              </div>
              <span style={{ color: t.accent, fontWeight: 800, fontSize: 12 }}>Seç →</span>
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
