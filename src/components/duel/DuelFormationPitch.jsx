import { FORMATION_SLOTS } from '../../constants/duelChallenges';
import PlayerAvatar from './PlayerAvatar';
import { formatChallengeMetric } from '../../utils/duelEngine';
import { enrichPlayerFromSeed } from '../../utils/playerPhotos';

const SLOT_POSITIONS = {
  GK: { top: '82%', left: '50%' },
  LB: { top: '62%', left: '18%' },
  CB1: { top: '68%', left: '38%' },
  CB2: { top: '68%', left: '62%' },
  RB: { top: '62%', left: '82%' },
  LM: { top: '42%', left: '18%' },
  CM1: { top: '48%', left: '40%' },
  CM2: { top: '48%', left: '60%' },
  RM: { top: '42%', left: '82%' },
  ST1: { top: '22%', left: '38%' },
  ST2: { top: '22%', left: '62%' },
};

export default function DuelFormationPitch({ picks = {}, playerMap = {}, theme, challenge, reveal = false }) {
  const t = theme;

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      aspectRatio: '1 / 1.35',
      minHeight: 280,
      maxHeight: 340,
      borderRadius: 16,
      background: 'linear-gradient(180deg, rgba(34,139,34,0.25) 0%, rgba(22,80,22,0.35) 100%)',
      border: `1px solid ${t.border}`,
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', inset: '8%',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: 8,
      }} />
      <div style={{
        position: 'absolute', top: '8%', left: '8%', right: '8%',
        height: 1, background: 'rgba(255,255,255,0.12)',
      }} />

      {FORMATION_SLOTS.map((slot) => {
        const pos = SLOT_POSITIONS[slot.id];
        const playerId = picks[slot.id];
        const player = playerId
          ? enrichPlayerFromSeed(playerMap[playerId] || { id: playerId, name: 'Oyuncu' })
          : null;

        return (
          <div
            key={slot.id}
            style={{
              position: 'absolute',
              top: pos.top,
              left: pos.left,
              transform: 'translate(-50%, -50%)',
              width: 52,
              textAlign: 'center',
            }}
          >
            {playerId ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <PlayerAvatar player={player} size={44} theme={t} />
                <div style={{
                  fontSize: 9, color: '#ccc', maxWidth: 58, marginTop: 3,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {player.name?.split(' ').pop()}
                </div>
                {reveal && challenge && (
                  <div style={{ fontSize: 8, color: t.accent, fontWeight: 700 }}>
                    {formatChallengeMetric(player, challenge)}
                  </div>
                )}
              </div>
            ) : (
              <div style={{
                width: 44, height: 44, borderRadius: '50%', margin: '0 auto',
                background: 'rgba(255,255,255,0.08)',
                border: '2px dashed rgba(255,255,255,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9, fontWeight: 800, color: '#555',
              }}>
                {slot.label.slice(0, 2)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
