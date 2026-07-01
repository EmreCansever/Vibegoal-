import {
  collection,
  doc,
  getDoc,
  getDocs,
  writeBatch,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from './firebase';
import { PLAYERS_SEED, PLAYERS_SEED_VERSION } from '../data/playersSeed';
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
          batch.set(doc(db, 'players', raw.id), {
            ...normalized,
            seedVersion: PLAYERS_SEED_VERSION,
          });
          hasWrites = true;
          return;
        }

        const needsUpdate = (prev.seedVersion ?? 0) < PLAYERS_SEED_VERSION
          || prev.photoUrl !== normalized.photoUrl
          || prev.photoId !== raw.photoId
          || prev.position !== raw.position
          || prev.name !== raw.name;

        if (needsUpdate) {
          batch.update(doc(db, 'players', raw.id), {
            ...normalized,
            seedVersion: PLAYERS_SEED_VERSION,
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

  /** Her tur = sahadaki bir boş mevki; yalnızca o mevki grubundan oyuncu */
  async buildDraftScript(duelId, playerAUid, playerBUid) {
    const pool = await this.getAllPlayers();
    const byGroup = { GK: [], DEF: [], MID: [], FWD: [] };
    pool.forEach((p) => {
      if (byGroup[p.position]) byGroup[p.position].push(p);
    });

    const used = new Set();
    const rounds = [];
    const slotOrder = shuffleWithSeed([...FORMATION_SLOTS], `${duelId}-slots`);

    slotOrder.forEach((slot, index) => {
      const posCandidates = byGroup[slot.posGroup].filter((p) => !used.has(p.id));
      if (posCandidates.length < 4) return;

      const shuffled = shuffleWithSeed(posCandidates, `${duelId}-${slot.id}-${index}`);
      const [a1, a2, b1, b2] = shuffled.slice(0, 4);
      if (!a1 || !a2 || !b1 || !b2) return;

      [a1, a2, b1, b2].forEach((p) => used.add(p.id));

      rounds.push({
        round: rounds.length,
        slotId: slot.id,
        slotLabel: slot.label,
        slotPosGroup: slot.posGroup,
        optionsByPlayer: {
          [playerAUid]: [toDraftCardSnapshot(a1), toDraftCardSnapshot(a2)],
          [playerBUid]: [toDraftCardSnapshot(b1), toDraftCardSnapshot(b2)],
        },
      });
    });

    return rounds;
  },
};
