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

const CHOICES_PER_PLAYER = 2;
const PLAYERS_PER_ROUND = CHOICES_PER_PLAYER * 2;

function normalizeFromSeed(player) {
  return normalizePlayerRecord(player);
}

/** Her oyuncuya her turda tam 2 seçenek */
function allocateRoundOptions(candidates, duelId, slot, index) {
  if (candidates.length < PLAYERS_PER_ROUND) return null;

  const shuffled = shuffleWithSeed(candidates, `${duelId}-${slot.id}-${index}`);

  return {
    optionsA: shuffled.slice(0, CHOICES_PER_PLAYER).map(toDraftCardSnapshot),
    optionsB: shuffled.slice(CHOICES_PER_PLAYER, PLAYERS_PER_ROUND).map(toDraftCardSnapshot),
    used: shuffled.slice(0, PLAYERS_PER_ROUND),
  };
}

/** Kısıtlı mevki grupları önce planlansın (DEF/MID) */
function orderSlotsForBudget(slots, byGroup, duelId) {
  const scored = slots.map((slot) => {
    const pool = byGroup[slot.posGroup]?.length || 0;
    const need = SLOTS_PER_GROUP[slot.posGroup] * PLAYERS_PER_ROUND;
    return { slot, pressure: need / Math.max(pool, 1) };
  });
  scored.sort((a, b) => b.pressure - a.pressure);
  const tight = scored.filter((s) => s.pressure >= 1).map((s) => s.slot);
  const loose = scored.filter((s) => s.pressure < 1).map((s) => s.slot);
  return [
    ...shuffleWithSeed(tight, `${duelId}-tight`),
    ...shuffleWithSeed(loose, `${duelId}-loose`),
  ];
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

  /** 11 tur garanti — yerel seed (Firestore beklemeden, anında) */
  buildDraftScriptSync(duelId, playerAUid, playerBUid) {
    return this._buildDraftRoundsFromPool(
      PLAYERS_SEED.map(normalizeFromSeed),
      duelId,
      playerAUid,
      playerBUid,
    );
  },

  _buildDraftRoundsFromPool(pool, duelId, playerAUid, playerBUid) {
    const byGroup = { GK: [], DEF: [], MID: [], FWD: [] };
    pool.forEach((p) => {
      if (byGroup[p.position]) byGroup[p.position].push(p);
    });

    const used = new Set();
    const remainingByGroup = { ...SLOTS_PER_GROUP };
    const rounds = [];
    const slotOrder = orderSlotsForBudget(FORMATION_SLOTS, byGroup, duelId);

    slotOrder.forEach((slot, index) => {
      const posCandidates = byGroup[slot.posGroup].filter((p) => !used.has(p.id));
      const allocation = allocateRoundOptions(posCandidates, duelId, slot, index);

      if (!allocation) {
        console.error(`[Draft] Yetersiz ${slot.posGroup} oyuncu — slot ${slot.id}`);
        return;
      }

      if (allocation.optionsA.length < CHOICES_PER_PLAYER
        || allocation.optionsB.length < CHOICES_PER_PLAYER) {
        console.error(`[Draft] Tur başına 2 seçenek üretilemedi — slot ${slot.id}`);
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

  /** 11 tur garanti — Firestore havuzundan (finalize vb. için) */
  async buildDraftScript(duelId, playerAUid, playerBUid) {
    const pool = await this.getAllPlayers();
    return this._buildDraftRoundsFromPool(pool, duelId, playerAUid, playerBUid);
  },
};
