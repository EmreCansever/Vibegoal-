import { useEffect, useState, useRef } from 'react';
import DuelFormationPitch from './DuelFormationPitch';
import PlayerAvatar from './PlayerAvatar';
import { playerService } from '../../services/playerService';
import {
  buildRevealResult,
  buildPlayerMapFromDraft,
  collectSessionPlayerIds,
  mergePlayerMaps,
  formatChallengeMetric,
} from '../../utils/duelEngine';
import { playSuccessSound, playDefeatSound, playRevealSound } from '../../utils/audioEngine';

function buildFallbackMap(session) {
  const draftMap = buildPlayerMapFromDraft(session);
  const ids = collectSessionPlayerIds(session);
  ids.forEach((id) => {
    if (!draftMap[id]) draftMap[id] = { id, name: 'Oyuncu' };
  });
  return draftMap;
}

export default function DuelResultScreen({ session, theme, currentUser, onClose, onRematch }) {
  const t = theme;
  const [playerMap, setPlayerMap] = useState({});
  const [result, setResult] = useState(null);
  const [loadError, setLoadError] = useState('');
  const soundPlayedRef = useRef(false);

  useEffect(() => {
    if (!session?.id) return undefined;
    let cancelled = false;

    const draftMap = buildPlayerMapFromDraft(session);
    const ids = collectSessionPlayerIds(session);
    draftMap && Object.keys(draftMap).forEach((id) => ids.add(id));

    const applyResult = (map) => {
      const built = buildRevealResult(session, map);
      setPlayerMap(map);
      setResult(built);
      setLoadError('');
    };

    // Draft snapshot'larından anında göster — Firestore beklemeden
    if (ids.size > 0 || session.scoreA != null) {
      applyResult(buildFallbackMap(session));
    }

    if (ids.size === 0 && session.scoreA == null) {
      setLoadError('Kadro verisi bulunamadı.');
      return undefined;
    }

    playerService.getPlayersByIds([...ids])
      .then((remoteMap) => {
        if (cancelled) return;
        const merged = mergePlayerMaps(draftMap, remoteMap);
        [...ids].forEach((id) => {
          if (!merged[id]) merged[id] = draftMap[id] || { id, name: 'Oyuncu' };
        });
        applyResult(merged);
      })
      .catch((err) => {
        console.warn('[DuelResult] Oyuncu yükleme hatası:', err);
        if (!cancelled) {
          applyResult(buildFallbackMap(session));
        }
      });

    return () => { cancelled = true; };
  }, [session?.id, session?.version, session?.status, session?.scoreA, session?.scoreB]);

  useEffect(() => {
    if (!result || !session || soundPlayedRef.current) return;
    soundPlayedRef.current = true;
    playRevealSound();
    const isDraw = !session.winnerUid && !result.winnerUid;
    const isWinner = (session.winnerUid ?? result.winnerUid) === currentUser?.uid;
    setTimeout(() => {
      if (isDraw) return;
      if (isWinner) playSuccessSound();
      else playDefeatSound();
    }, 350);
  }, [result, session, currentUser?.uid]);

  if (!session || (!result && !loadError)) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Sonuç hesaplanıyor...</div>;
  }

  if (loadError && !result) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>
        <div style={{ marginBottom: 12 }}>{loadError}</div>
        <button type="button" onClick={onClose} style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: t.accent, color: t.tabActiveText, fontWeight: 700, cursor: 'pointer' }}>
          Kapat
        </button>
      </div>
    );
  }

  const uid = currentUser?.uid;
  const isPlayerA = session.playerAUid === uid;
  const myScore = isPlayerA ? result.scoreA : result.scoreB;
  const theirScore = isPlayerA ? result.scoreB : result.scoreA;
  const winnerUid = session.winnerUid ?? result.winnerUid;
  const isWinner = winnerUid === uid;
  const isDraw = !winnerUid;

  return (
    <div style={{
      flex: 1, overflowY: 'auto',
      padding: '16px',
      paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
    }} className="scroll-hide">
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
            {Number(myScore).toFixed(result.challenge.metric === 'marketValueM' ? 1 : 1)}
          </div>
          <div style={{ fontSize: 10, color: '#555' }}>{result.challenge.unit}</div>
        </div>
        <div style={{ width: 1, background: t.border }} />
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>RAKİP</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#fff' }}>
            {Number(theirScore).toFixed(result.challenge.metric === 'marketValueM' ? 1 : 1)}
          </div>
          <div style={{ fontSize: 10, color: '#555' }}>{result.challenge.unit}</div>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: '#888', marginBottom: 8 }}>SENİN İLK 11</div>
        <DuelFormationPitch
          picks={session.myPicks || session.picks?.[session.resolvedUid] || {}}
          playerMap={playerMap}
          theme={t}
          challenge={result.challenge}
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
                {formatChallengeMetric(p, result.challenge)}
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
