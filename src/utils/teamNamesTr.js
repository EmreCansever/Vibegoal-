/**
 * API-Football İngilizce takım adlarını Türkçe yayın isimlerine çevirir.
 * Eşleşme yoksa bilinen karakter düzeltmeleri uygulanır.
 */
const TEAM_NAMES_TR = {
  // Süper Lig
  'Galatasaray': 'Galatasaray',
  'Fenerbahce': 'Fenerbahçe',
  'Fenerbahçe': 'Fenerbahçe',
  'Besiktas': 'Beşiktaş',
  'Beşiktaş': 'Beşiktaş',
  'Trabzonspor': 'Trabzonspor',
  'Basaksehir': 'Başakşehir',
  'Basaksehir FK': 'Başakşehir',
  'Istanbul Basaksehir': 'İstanbul Başakşehir',
  'Adana Demirspor': 'Adana Demirspor',
  'Antalyaspor': 'Antalyaspor',
  'Alanyaspor': 'Alanyaspor',
  'Konyaspor': 'Konyaspor',
  'Kayserispor': 'Kayserispor',
  'Sivasspor': 'Sivasspor',
  'Kasimpasa': 'Kasımpaşa',
  'Kasimpasa SK': 'Kasımpaşa',
  'Rizespor': 'Çaykur Rizespor',
  'Caykur Rizespor': 'Çaykur Rizespor',
  'Gaziantep FK': 'Gaziantep FK',
  'Goztepe': 'Göztepe',
  'Göztepe': 'Göztepe',
  'Hatayspor': 'Hatayspor',
  'Samsunspor': 'Samsunspor',
  'Eyupspor': 'Eyüpspor',
  'Eyüpspor': 'Eyüpspor',
  'Bodrum FK': 'Bodrum FK',
  'Genclerbirligi': 'Gençlerbirliği',
  'Gençlerbirliği': 'Gençlerbirliği',

  // Millî takımlar
  'Turkey': 'Türkiye',
  'Türkiye': 'Türkiye',
  'Brazil': 'Brezilya',
  'Germany': 'Almanya',
  'France': 'Fransa',
  'England': 'İngiltere',
  'Spain': 'İspanya',
  'Italy': 'İtalya',
  'Portugal': 'Portekiz',
  'Netherlands': 'Hollanda',
  'Argentina': 'Arjantin',

  // Premier Lig
  'Manchester City': 'Manchester City',
  'Manchester United': 'Manchester United',
  'Liverpool': 'Liverpool',
  'Arsenal': 'Arsenal',
  'Chelsea': 'Chelsea',
  'Tottenham': 'Tottenham',
  'Tottenham Hotspur': 'Tottenham',
  'Newcastle': 'Newcastle',
  'Newcastle United': 'Newcastle',
  'Aston Villa': 'Aston Villa',
  'West Ham': 'West Ham',
  'West Ham United': 'West Ham',
  'Brighton': 'Brighton',
  'Brighton and Hove Albion': 'Brighton',
  'Everton': 'Everton',
  'Fulham': 'Fulham',
  'Crystal Palace': 'Crystal Palace',
  'Brentford': 'Brentford',
  'Wolverhampton Wanderers': 'Wolverhampton',
  'Wolves': 'Wolverhampton',
  'Nottingham Forest': 'Nottingham Forest',
  'Bournemouth': 'Bournemouth',
  'AFC Bournemouth': 'Bournemouth',
  'Leicester': 'Leicester',
  'Leicester City': 'Leicester',
  'Ipswich': 'Ipswich',
  'Ipswich Town': 'Ipswich',
  'Southampton': 'Southampton',

  // La Liga
  'Real Madrid': 'Real Madrid',
  'Barcelona': 'Barcelona',
  'Atletico Madrid': 'Atletico Madrid',
  'Atlético Madrid': 'Atletico Madrid',
  'Sevilla': 'Sevilla',
  'Real Sociedad': 'Real Sociedad',
  'Real Betis': 'Real Betis',
  'Villarreal': 'Villarreal',
  'Athletic Club': 'Athletic Bilbao',
  'Athletic Bilbao': 'Athletic Bilbao',
  'Valencia': 'Valencia',
  'Celta Vigo': 'Celta Vigo',
  'Getafe': 'Getafe',
  'Osasuna': 'Osasuna',
  'Girona': 'Girona',
  'Las Palmas': 'Las Palmas',
  'Mallorca': 'Mallorca',
  'Alaves': 'Alaves',
  'Deportivo Alaves': 'Alaves',
  'Leganes': 'Leganes',
  'Espanyol': 'Espanyol',
  'Rayo Vallecano': 'Rayo Vallecano',

  // Serie A
  'Inter': 'Inter',
  'Internazionale': 'Inter',
  'AC Milan': 'AC Milan',
  'Milan': 'AC Milan',
  'Juventus': 'Juventus',
  'Napoli': 'Napoli',
  'Roma': 'Roma',
  'AS Roma': 'Roma',
  'Lazio': 'Lazio',
  'Atalanta': 'Atalanta',
  'Fiorentina': 'Fiorentina',
  'Torino': 'Torino',
  'Bologna': 'Bologna',
  'Udinese': 'Udinese',
  'Genoa': 'Genoa',
  'Cagliari': 'Cagliari',
  'Parma': 'Parma',
  'Verona': 'Verona',
  'Hellas Verona': 'Verona',
  'Empoli': 'Empoli',
  'Monza': 'Monza',
  'Como': 'Como',
  'Venezia': 'Venezia',
  'Lecce': 'Lecce',

  // Bundesliga
  'Bayern Munich': 'Bayern Münih',
  'Bayern München': 'Bayern Münih',
  'Borussia Dortmund': 'Borussia Dortmund',
  'RB Leipzig': 'RB Leipzig',
  'Bayer Leverkusen': 'Bayer Leverkusen',
  'Eintracht Frankfurt': 'Eintracht Frankfurt',
  'VfB Stuttgart': 'VfB Stuttgart',
  'Wolfsburg': 'Wolfsburg',
  'Freiburg': 'Freiburg',
  'SC Freiburg': 'Freiburg',
  'Hoffenheim': 'Hoffenheim',
  'TSG Hoffenheim': 'Hoffenheim',
  'Borussia Monchengladbach': 'Borussia Mönchengladbach',
  'Borussia Mönchengladbach': 'Borussia Mönchengladbach',
  'Werder Bremen': 'Werder Bremen',
  'Mainz': 'Mainz',
  'Mainz 05': 'Mainz',
  'Augsburg': 'Augsburg',
  'FC Augsburg': 'Augsburg',
  'Union Berlin': 'Union Berlin',
  '1. FC Union Berlin': 'Union Berlin',
  'Bochum': 'Bochum',
  'VfL Bochum': 'Bochum',
  'Heidenheim': 'Heidenheim',
  'FC Heidenheim': 'Heidenheim',
  'Holstein Kiel': 'Holstein Kiel',
  'St. Pauli': 'St. Pauli',

  // Şampiyonlar Ligi / diğer
  'Paris Saint Germain': 'Paris Saint-Germain',
  'Paris Saint-Germain': 'Paris Saint-Germain',
  'PSG': 'Paris Saint-Germain',
  'Benfica': 'Benfica',
  'Porto': 'Porto',
  'Sporting CP': 'Sporting Lizbon',
  'Sporting Lisbon': 'Sporting Lizbon',
  'Ajax': 'Ajax',
  'PSV Eindhoven': 'PSV',
  'PSV': 'PSV',
  'Celtic': 'Celtic',
  'Rangers': 'Rangers',
  'Club Brugge': 'Club Brugge',
  'Red Bull Salzburg': 'Red Bull Salzburg',
  'Shakhtar Donetsk': 'Shakhtar Donetsk',
  'Dynamo Kyiv': 'Dinamo Kiev',
  'Dinamo Zagreb': 'Dinamo Zagreb',
}

/** Bilinen ASCII → Türkçe karakter düzeltmeleri (kısmi eşleşme) */
const CHAR_FIXES = [
  ['Fenerbahce', 'Fenerbahçe'],
  ['Besiktas', 'Beşiktaş'],
  ['Basaksehir', 'Başakşehir'],
  ['Kasimpasa', 'Kasımpaşa'],
  ['Goztepe', 'Göztepe'],
  ['Genclerbirligi', 'Gençlerbirliği'],
  ['Eyupspor', 'Eyüpspor'],
  ['Monchengladbach', 'Mönchengladbach'],
  ['Munchen', 'Münih'],
  ['München', 'Münih'],
]

function normalizeKey(name) {
  return (name || '').trim()
}

/** @param {string} name */
export function translateTeamName(name) {
  const raw = normalizeKey(name)
  if (!raw) return raw

  if (TEAM_NAMES_TR[raw]) return TEAM_NAMES_TR[raw]

  const lower = raw.toLowerCase()
  for (const [en, tr] of Object.entries(TEAM_NAMES_TR)) {
    if (en.toLowerCase() === lower) return tr
  }

  let fixed = raw
  for (const [from, to] of CHAR_FIXES) {
    if (fixed.includes(from)) fixed = fixed.replace(from, to)
  }
  return fixed
}
