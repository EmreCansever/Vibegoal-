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

const SLOTS_PER_GROUP = FORMATION_SLOTS.reduce((acc, slot) => {
  acc[slot.posGroup] = (acc[slot.posGroup] || 0) + 1;
  return acc;
}, {});

function normalizeFromSeed(player) {
  return normalizePlayerRecord(player);
}

function allocateRoundOptions(candidates, remainingInGroup, duelId, slot, index) {
  if (candidates.length < 2) return null;

  const shuffled = shuffleWithSeed(candidates, `${duelId}-${slot.id}-${index}`);
  const canOfferTwoEach = candidates.length >= remainingInGroup * 2 + 2;
  const perSide = canOfferTwoEach ? 2 : 1;
  const need = perSide * 2;

  if (shuffled.length < need) return null;

  return {
    optionsA: shuffled.slice(0, perSide).map(toDraftCardSnapshot),
    optionsB: shuffled.slice(perSide, perSide * 2).map(toDraftCardSnapshot),
    used: shuffled.slice(0, need),
  };
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

        if (!prev || (prev.seedVersion ?? 0) < PLAYERS_SEED_VERSION) {
          batch.set(doc(db, 'players', raw.id), {
            ...normalized,
            seedVersion: PLAYERS_SEED_VERSION,
          }, { merge: true });
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

  /** 11 tur garanti — her tur bir boş mevki, sadece o gruptan oyuncu */
  async buildDraftScript(duelId, playerAUid, playerBUid) {
    const pool = await this.getAllPlayers();
    const byGroup = { GK: [], DEF: [], MID: [], FWD: [] };
    pool.forEach((p) => {
      if (byGroup[p.position]) byGroup[p.position].push(p);
    });

    const used = new Set();
    const remainingByGroup = { ...SLOTS_PER_GROUP };
    const rounds = [];
    const slotOrder = shuffleWithSeed([...FORMATION_SLOTS], `${duelId}-slots`);

    slotOrder.forEach((slot, index) => {
      const remaining = remainingByGroup[slot.posGroup];
      const posCandidates = byGroup[slot.posGroup].filter((p) => !used.has(p.id));
      const allocation = allocateRoundOptions(posCandidates, remaining, duelId, slot, index);

      if (!allocation) {
        console.error(`[Draft] Yetersiz ${slot.posGroup} oyuncu — slot ${slot.id}`);
        return;
      }

      allocation.used.forEach((p) => used.add(p.id));
      remainingByGroup[slot.posGroup] -= 1;

      rounds.push({
        round: rounds.length,
        slotId: slot.id,
        slotLabel: slot.label,
        slotPosGroup: slot.posGroup,
        optionsByPlayer: {
          [playerAUid]: allocation.optionsA,
          [playerBUid]: allocation.optionsB,
        },
      });
    });

    if (rounds.length !== FORMATION_SLOTS.length) {
      throw new Error(`Draft script eksik: ${rounds.length}/11 tur oluşturuldu.`);
    }

    return rounds;
  },
};
