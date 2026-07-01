import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  writeBatch,
  query,
  limit,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from './firebase';
import { PLAYERS_SEED } from '../data/playersSeed';
import { FORMATION_SLOTS } from '../constants/duelChallenges';
import { shuffleWithSeed } from '../utils/duelEngine';
import { normalizePlayerRecord, toDraftCardSnapshot } from '../utils/playerPhotos';

let seedPromise = null;

function normalizeFromSeed(player) {
  return normalizePlayerRecord(player);
}

export const playerService = {
  isAvailable: () => isFirebaseConfigured && !!db,

  async ensureSeeded() {
    if (!this.isAvailable()) return false;
    if (seedPromise) return seedPromise;

    seedPromise = (async () => {
      const snap = await getDocs(collection(db, 'players'));
      const existingById = Object.fromEntries(snap.docs.map((d) => [d.id, d.data()]));

      const batch = writeBatch(db);
      let hasWrites = false;

      PLAYERS_SEED.forEach((raw) => {
        const normalized = normalizeFromSeed(raw);
        const prev = existingById[raw.id];
        if (!prev) {
          batch.set(doc(db, 'players', raw.id), normalized);
          hasWrites = true;
          return;
        }
        if (!prev.photoUrl || prev.photoUrl !== normalized.photoUrl) {
          batch.update(doc(db, 'players', raw.id), {
            photoUrl: normalized.photoUrl,
            photoId: raw.photoId ?? prev.photoId ?? null,
            updatedAt: Date.now(),
          });
          hasWrites = true;
        }
      });

      if (hasWrites) await batch.commit();
      return true;
    })().catch((err) => {
      seedPromise = null;
      console.warn('Oyuncu seed hatasi:', err);
      return false;
    });

    return seedPromise;
  },

  async getAllPlayers() {
    if (!this.isAvailable()) {
      return PLAYERS_SEED.map(normalizeFromSeed);
    }
    await this.ensureSeeded();
    const snap = await getDocs(collection(db, 'players'));
    if (snap.empty) return PLAYERS_SEED.map(normalizeFromSeed);
    return snap.docs.map((d) => normalizeFromSeed({ id: d.id, ...d.data() }));
  },

  async getPlayersByIds(ids = []) {
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) return {};

    if (!this.isAvailable()) {
      return Object.fromEntries(
        PLAYERS_SEED.filter((p) => unique.includes(p.id)).map((p) => [p.id, normalizeFromSeed(p)]),
      );
    }

    await this.ensureSeeded();
    const entries = await Promise.all(
      unique.map(async (id) => {
        const snap = await getDoc(doc(db, 'players', id));
        return snap.exists() ? [id, normalizeFromSeed({ id, ...snap.data() })] : null;
      }),
    );
    return Object.fromEntries(entries.filter(Boolean));
  },

  async buildDraftScript(duelId, playerAUid, playerBUid) {
    const pool = await this.getAllPlayers();
    const byGroup = { GK: [], DEF: [], MID: [], FWD: [] };
    pool.forEach((p) => {
      if (byGroup[p.position]) byGroup[p.position].push(p);
    });

    const used = new Set();
    const rounds = [];
    const shuffledSlots = shuffleWithSeed([...FORMATION_SLOTS], `${duelId}-slots`);

    const pickPair = (candidates, seed) => {
      const list = shuffleWithSeed(candidates, seed);
      return [list[0], list[1]].filter(Boolean);
    };

    shuffledSlots.forEach((slot, index) => {
      const posCandidates = byGroup[slot.posGroup].filter((p) => !used.has(p.id));
      const anyCandidates = pool.filter((p) => !used.has(p.id));

      const poolA = posCandidates.length >= 2 ? posCandidates : anyCandidates;
      const [a1, a2] = pickPair(poolA, `${duelId}-a-${slot.id}-${index}`);
      if (!a1 || !a2) return;
      used.add(a1.id);
      used.add(a2.id);

      const posCandidatesB = byGroup[slot.posGroup].filter((p) => !used.has(p.id));
      const anyCandidatesB = pool.filter((p) => !used.has(p.id));
      const poolB = posCandidatesB.length >= 2 ? posCandidatesB : anyCandidatesB;
      const [b1, b2] = pickPair(poolB, `${duelId}-b-${slot.id}-${index}`);
      if (!b1 || !b2) return;
      used.add(b1.id);
      used.add(b2.id);

      rounds.push({
        round: index,
        slotId: slot.id,
        slotLabel: slot.label,
        optionsByPlayer: {
          [playerAUid]: [toDraftCardSnapshot(a1), toDraftCardSnapshot(a2)],
          [playerBUid]: [toDraftCardSnapshot(b1), toDraftCardSnapshot(b2)],
        },
      });
    });

    return rounds;
  },
};
