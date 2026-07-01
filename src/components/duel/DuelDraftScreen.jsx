import { useEffect, useState } from 'react';
import DuelFormationPitch from './DuelFormationPitch';
import DuelPlayerCard from './DuelPlayerCard';
import { playerService } from '../../services/playerService';
import { DUEL_STATUS } from '../../constants/duelChallenges';

export default function DuelDraftScreen({
  session,
  theme,
  onPick,
  picking = false,
  lastSyncMs = null,
}) {
  const t = theme;
  const [playerMap, setPlayerMap] = useState({});

  const round = session?.activeRound;
  const alreadyPicked = !!session?.myRoundPick;
  const isReveal = session?.status === DUEL_STATUS.REVEAL || session?.status === DUEL_STATUS.FINISHED;

  useEffect(() => {
    if (!session) return;
    const ids = new Set();
    (session.draftRounds || []).forEach((r) => r.options.forEach((o) => ids.add(o.id)));
    Object.values(session.myPicks || {}).forEach((id) => ids.add(id));
    Object.values(session.theirPicks || {}).forEach((id) => ids.add(id));
    playerService.getPlayersByIds([...ids]).then(setPlayerMap);
  }, [session]);

  if (!session || !round) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>
        Draft odası yükleniyor...
      </div>
    );
  }

  const enrichedOptions = round.options.map((opt) => ({
    ...opt,
    ...(playerMap[opt.id] || {}),
    id: opt.id,
    name: opt.name || playerMap[opt.id]?.name,
    team: opt.team || playerMap[opt.id]?.team,
    photoUrl: opt.photoUrl || playerMap[opt.id]?.photoUrl,
  }));

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ fontSize: 12, color: t.accent, fontWeight: 800 }}>
            {session.challenge?.icon} {session.challenge?.label}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {lastSyncMs != null && (
              <span style={{ fontSize: 9, color: '#555' }}>
                ⚡ {lastSyncMs < 120 ? 'canlı' : `${lastSyncMs}ms`}
              </span>
            )}
            <span style={{ fontSize: 11, color: '#666' }}>
              Tur {Math.min(session.currentRound + 1, session.totalRounds)}/{session.totalRounds}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 10, fontSize: 11 }}>
          <span style={{ color: '#fff', fontWeight: 700 }}>Sen: {session.myPickCount}/11</span>
          <span style={{ color: '#666' }}>·</span>
          <span style={{ color: session.theirRoundPick ? t.accent : '#aaa' }}>
            Rakip: {session.theirPickCount}/11 {session.theirRoundPick ? '✓ tur' : '…'}
          </span>
        </div>

        <DuelFormationPitch
          picks={session.myPicks}
          playerMap={playerMap}
          theme={t}
          reveal={isReveal}
        />
      </div>

      {!isReveal && (
        <div style={{ flex: 1, padding: '16px', overflowY: 'auto' }} className="scroll-hide">
          <div style={{ fontSize: 12, fontWeight: 700, color: '#888', marginBottom: 10, textAlign: 'center' }}>
            {round.slotLabel} — Bir oyuncu seç
          </div>

          {alreadyPicked ? (
            <div style={{
              textAlign: 'center', padding: 24, borderRadius: 14,
              background: t.accentSoft, border: `1px solid ${t.accentBorder}`,
              color: t.accent, fontSize: 13, fontWeight: 700,
            }}>
              ✓ Seçimin kaydedildi — rakip seçimini yapınca tur ilerler
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 12 }}>
              {enrichedOptions.map((opt) => (
                <DuelPlayerCard
                  key={opt.id}
                  player={opt}
                  theme={t}
                  challenge={session.challenge}
                  disabled={picking}
                  onPick={onPick}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {isReveal && (
        <div style={{ padding: 16, textAlign: 'center', color: t.accent, fontWeight: 800, fontSize: 13 }}>
          Değerler açılıyor...
        </div>
      )}
    </div>
  );
}
