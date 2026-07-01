import { useEffect, useState } from 'react';
import DuelFormationPitch from './DuelFormationPitch';
import PlayerAvatar from './PlayerAvatar';
import { playerService } from '../../services/playerService';
import { buildRevealResult } from '../../utils/duelEngine';

export default function DuelResultScreen({ session, theme, currentUser, onClose, onRematch }) {
  const t = theme;
  const [playerMap, setPlayerMap] = useState({});
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!session) return;
    const ids = new Set();
    Object.values(session.picks || {}).forEach((slots) => {
      Object.values(slots).forEach((id) => ids.add(id));
    });
    playerService.getPlayersByIds([...ids]).then((map) => {
      setPlayerMap(map);
      setResult(buildRevealResult(session, map));
    });
  }, [session]);

  if (!session || !result) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Sonuç hesaplanıyor...</div>;
  }

  const isPlayerA = session.playerAUid === currentUser.uid;
  const myScore = isPlayerA ? result.scoreA : result.scoreB;
  const theirScore = isPlayerA ? result.scoreB : result.scoreA;

  const isWinner = session.winnerUid === currentUser.uid;
  const isDraw = !session.winnerUid;

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }} className="scroll-hide">
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>{isDraw ? '🤝' : isWinner ? '🏆' : '😤'}</div>
        <div style={{ fontSize: 20, fontWeight: 900, color: isWinner ? t.accent : '#fff' }}>
          {isDraw ? 'Berabere!' : isWinner ? 'Düello Kazanıldı!' : 'Düello Kaybedildi'}
        </div>
        <div style={{ fontSize: 12, color: '#666', marginTop: 6 }}>
          {result.challenge.icon} {result.challenge.label}
        </div>
      </div>

      <div style={{
        display: 'flex', gap: 12, marginBottom: 20,
        padding: 16, borderRadius: 16, background: t.surface, border: `1px solid ${t.border}`,
      }}>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>SEN</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: t.accent }}>
            {myScore.toFixed(result.challenge.metric === 'marketValueM' ? 1 : 1)}
          </div>
          <div style={{ fontSize: 10, color: '#555' }}>{result.challenge.unit}</div>
        </div>
        <div style={{ width: 1, background: t.border }} />
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>RAKİP</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#fff' }}>
            {theirScore.toFixed(result.challenge.metric === 'marketValueM' ? 1 : 1)}
          </div>
          <div style={{ fontSize: 10, color: '#555' }}>{result.challenge.unit}</div>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: '#888', marginBottom: 8 }}>SENİN İLK 11</div>
        <DuelFormationPitch
          picks={session.picks?.[currentUser.uid] || {}}
          playerMap={playerMap}
          theme={t}
          reveal
        />
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(isPlayerA ? result.squadA : result.squadB).map((p) => (
            <div key={p.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 10px', borderRadius: 10,
              background: 'rgba(255,255,255,0.04)', border: `1px solid ${t.border}`,
            }}>
              <PlayerAvatar player={p} size={36} theme={t} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{p.name}</div>
                <div style={{ fontSize: 10, color: '#666' }}>{p.team}</div>
              </div>
              <div style={{ fontSize: 10, color: t.accent, fontWeight: 800, textAlign: 'right' }}>
                {p.age}y · {p.heightCm}cm · {p.marketValueM}M€
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button
          type="button"
          onClick={onRematch}
          style={{
            flex: 1, padding: 14, borderRadius: 12, border: 'none',
            background: `linear-gradient(135deg,${t.accent},${t.accentAlt})`,
            color: t.tabActiveText, fontWeight: 800, fontSize: 13, cursor: 'pointer',
          }}
        >
          Yeni Düello
        </button>
        <button
          type="button"
          onClick={onClose}
          style={{
            flex: 1, padding: 14, borderRadius: 12,
            border: `1px solid ${t.border}`, background: 'transparent',
            color: '#aaa', fontWeight: 700, fontSize: 13, cursor: 'pointer',
          }}
        >
          Kapat
        </button>
      </div>
    </div>
  );
}
