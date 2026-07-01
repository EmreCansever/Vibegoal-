/** Canlı Düello challenge türleri */
export const DUEL_CHALLENGES = [
  { id: 'youngest', label: 'En Genç Kadro', icon: '🧒', metric: 'age', goal: 'min', unit: 'yaş ort.' },
  { id: 'oldest', label: 'En Yaşlı Kadro', icon: '👴', metric: 'age', goal: 'max', unit: 'yaş ort.' },
  { id: 'expensive', label: 'En Pahalı Kadro', icon: '💎', metric: 'marketValueM', goal: 'max', unit: 'M€ toplam' },
  { id: 'cheapest', label: 'En Ucuz Kadro', icon: '🪙', metric: 'marketValueM', goal: 'min', unit: 'M€ toplam' },
  { id: 'shortest', label: 'En Kısa Kadro', icon: '📏', metric: 'heightCm', goal: 'min', unit: 'cm ort.' },
  { id: 'tallest', label: 'En Uzun Kadro', icon: '🦒', metric: 'heightCm', goal: 'max', unit: 'cm ort.' },
];

export const FORMATION_SLOTS = [
  { id: 'GK', label: 'Kaleci', posGroup: 'GK' },
  { id: 'LB', label: 'Sol Bek', posGroup: 'DEF' },
  { id: 'CB1', label: 'Stoper', posGroup: 'DEF' },
  { id: 'CB2', label: 'Stoper', posGroup: 'DEF' },
  { id: 'RB', label: 'Sağ Bek', posGroup: 'DEF' },
  { id: 'LM', label: 'Sol Orta', posGroup: 'MID' },
  { id: 'CM1', label: 'Merkez Orta', posGroup: 'MID' },
  { id: 'CM2', label: 'Merkez Orta', posGroup: 'MID' },
  { id: 'RM', label: 'Sağ Orta', posGroup: 'MID' },
  { id: 'ST1', label: 'Forvet', posGroup: 'FWD' },
  { id: 'ST2', label: 'Forvet', posGroup: 'FWD' },
];

export const DUEL_STATUS = {
  PENDING: 'pending',
  DRAFT: 'draft',
  REVEAL: 'reveal',
  FINISHED: 'finished',
  CANCELLED: 'cancelled',
};

export function getChallengeById(id) {
  return DUEL_CHALLENGES.find((c) => c.id === id) || DUEL_CHALLENGES[0];
}
