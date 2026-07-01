import { useEffect, useMemo, useState } from 'react';
import DuelFormationPitch from './DuelFormationPitch';
import DuelPlayerCard from './DuelPlayerCard';
import { playerService } from '../../services/playerService';
import { DUEL_STATUS } from '../../constants/duelChallenges';
import {
  buildPlayerMapFromDraft,
  collectSessionPlayerIds,
  mergePlayerMaps,
} from '../../utils/duelEngine';
import { resolvePlayerPhotoUrl, enrichPlayerFromSeed, resolveApiSportsPlayerId } from '../../utils/playerPhotos';

function collectRoundPlayerIds(rounds = []) {
  const ids = new Set();
  rounds.forEach((r) => {
    if (r.optionsByPlayer) {
      Object.values(r.optionsByPlayer).forEach((opts) => opts.forEach((o) => ids.add(o.id)));
    } else if (r.options) {
      r.options.forEach((o) => ids.add(o.id));
    }
  });
  return ids;
}

export default function DuelDraftScreen({
  session,
  theme,
  onPick,
  picking = false,
  lastSyncMs = null,
}) {
  const t = theme;
  const [remotePlayerMap, setRemotePlayerMap] = useState({});

  const draftPlayerMap = useMemo(() => {
    if (!session) return {};
    const draft = buildPlayerMapFromDraft(session);
    const map = { ...draft };
    collectSessionPlayerIds(session).forEach((id) => {
      map[id] = enrichPlayerFromSeed(map[id] || { id, name: 'Oyuncu' });
    });
    return map;
  }, [session?.id, session?.version, session?.myPickCount, session?.draftRounds, session?.myPicks]);

  useEffect(() => {
    if (!session) {
      setRemotePlayerMap({});
      return;
    }
    const ids = collectSessionPlayerIds(session);
    collectRoundPlayerIds(session.draftRounds || []).forEach((id) => ids.add(id));
    if (ids.size === 0) {
      setRemotePlayerMap({});
      return;
    }
    playerService.getPlayersByIds([...ids]).then(setRemotePlayerMap);
  }, [session?.id, session?.version, session?.myPickCount, session?.draftRounds]);

  const playerMap = useMemo(
    () => mergePlayerMaps(draftPlayerMap, remotePlayerMap),
    [draftPlayerMap, remotePlayerMap],
  );

  const round = session?.activeRound;
  const myOptions = session?.myRoundOptions || [];
  const alreadyPicked = !!session?.myRoundPick;
  const isReveal = session?.status === DUEL_STATUS.REVEAL || session?.status === DUEL_STATUS.FINISHED;
  const waitingForResult = session?.status === DUEL_STATUS.DRAFT
    && session.currentRound >= session.totalRounds;

  if (!session) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>
        Draft odası yükleniyor...
      </div>
    );
  }

  if (waitingForResult) {
    return (
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center',
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: '50%',
          border: `3px solid ${t.accentBorder}`,
          borderTopColor: t.accent,
          animation: 'vg-spin 0.9s linear infinite',
          marginBottom: 16,
        }} />
        <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', marginBottom: 6 }}>Sonuç hesaplanıyor…</div>
        <div style={{ fontSize: 12, color: '#666' }}>11/11 seçim tamam — skorlar açılıyor</div>
      </div>
    );
  }

  if (!round) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>
        Draft odası yükleniyor...
      </div>
    );
  }

  const enrichedOptions = myOptions.map((opt) => {
    const remote = playerMap[opt.id] || {};
    const merged = enrichPlayerFromSeed({
      ...remote,
      ...opt,
      id: opt.id,
      photoId: opt.photoId ?? remote.photoId,
    });
    return {
      ...merged,
      name: opt.name || merged.name,
      team: opt.team || merged.team,
      photoUrl: resolvePlayerPhotoUrl(merged),
      photoId: merged.photoId ?? resolveApiSportsPlayerId(merged),
      age: opt.age ?? merged.age,
      heightCm: opt.heightCm ?? merged.heightCm,
      marketValueM: opt.marketValueM ?? merged.marketValueM,
    };
  });

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
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
          challenge={session.challenge}
          reveal={isReveal}
        />
      </div>

      {!isReveal && (
        <div
          className="scroll-hide"
          style={{
            flex: 1,
            padding: '16px',
            paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
            overflowY: 'auto',
            minHeight: 0,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: '#888', marginBottom: 10, textAlign: 'center' }}>
            {round.slotLabel} ({round.slotPosGroup || '?'}) — Boş mevki için seç
          </div>

          {alreadyPicked ? (
            <div style={{
              textAlign: 'center', padding: 24, borderRadius: 14,
              background: t.accentSoft, border: `1px solid ${t.accentBorder}`,
              color: t.accent, fontSize: 13, fontWeight: 700,
            }}>
              ✓ Seçimin kaydedildi — rakip seçimini yapınca tur ilerler
            </div>
          ) : enrichedOptions.length < 2 ? (
            <div style={{ textAlign: 'center', padding: 20, color: '#888', fontSize: 12 }}>
              Seçenekler yükleniyor…
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 12 }}>
              {enrichedOptions.map((opt) => (
                <DuelPlayerCard
                  key={opt.id}
                  player={opt}
                  theme={t}
                  disabled={picking}
                  onPick={onPick}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {isReveal && (
        <div style={{
          padding: 16,
          paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
          textAlign: 'center',
          color: t.accent,
          fontWeight: 800,
          fontSize: 13,
        }}
        >
          Değerler açılıyor...
        </div>
      )}
    </div>
  );
}
