import { useCallback, useEffect, useRef, useState } from 'react';
import { duelService } from '../services/duelService';

/**
 * Firestore onSnapshot tabanlı düello oda/session state hook'u.
 * Cihazlar arası senkronizasyon için tek kaynak: duel_sessions/{id}
 */
export function useDuelSession(duelId, uid) {
  const [session, setSession] = useState(null);
  const [lastSyncMs, setLastSyncMs] = useState(null);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState('');
  const lastServerVersion = useRef(0);

  useEffect(() => {
    if (!duelId || !uid) {
      setSession(null);
      return undefined;
    }

    setError('');
    const unsub = duelService.subscribeSession(duelId, uid, (next) => {
      const receivedAt = Date.now();
      if (next?.serverUpdatedAt) {
        setLastSyncMs(Math.max(0, receivedAt - next.serverUpdatedAt));
      } else {
        setLastSyncMs(0);
      }
      if (next?.version > lastServerVersion.current) {
        lastServerVersion.current = next.version;
      }
      setSession(next);
    });

    return unsub;
  }, [duelId, uid]);

  const pickPlayer = useCallback(async (playerId) => {
    if (!duelId) return;
    setPicking(true);
    setError('');
    try {
      await duelService.pickPlayer(duelId, playerId);
    } catch (err) {
      setError(err?.message || 'Seçim kaydedilemedi.');
      throw err;
    } finally {
      setPicking(false);
    }
  }, [duelId]);

  return {
    session,
    lastSyncMs,
    picking,
    error,
    pickPlayer,
    isConnected: !!session,
  };
}

/** Aktif draft/reveal oturumunu dinler — yenilemede devam */
export function useActiveDuelSession(uid, onFound) {
  useEffect(() => {
    if (!uid) return undefined;
    return duelService.subscribeActiveSession(uid, (session) => {
      if (session?.id) onFound?.(session);
    });
  }, [uid, onFound]);
}
