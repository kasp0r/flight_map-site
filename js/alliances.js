// Approximate airline → alliance membership, circa 2017 (to match the OpenFlights
// route data). Membership is keyed by IATA code; airlines not listed here are
// treated as "Unaffiliated". This is intentionally approximate — alliances change
// members over time and the underlying route data is already several years old.

export const ALLIANCES = {
  'Star Alliance': [
    'AC', 'AI', 'A3', 'AV', 'BR', 'CA', 'CM', 'ET', 'JP', 'LO', 'LH', 'LX',
    'MS', 'NH', 'NZ', 'OS', 'OU', 'OZ', 'SA', 'SK', 'SN', 'SQ', 'TG', 'TK',
    'TP', 'UA', 'ZH',
  ],
  'SkyTeam': [
    'AF', 'AM', 'AR', 'AZ', 'CI', 'CZ', 'DL', 'FM', 'GA', 'KE', 'KL', 'KQ',
    'ME', 'MF', 'MU', 'OK', 'RO', 'SU', 'SV', 'UX', 'VN',
  ],
  'oneworld': [
    'AA', 'AB', 'AY', 'BA', 'CX', 'IB', 'JJ', 'JL', 'LA', 'MH', 'QF', 'QR',
    'RJ', 'S7', 'UL', 'US',
  ],
};

export const ALLIANCE_ORDER = ['Star Alliance', 'SkyTeam', 'oneworld'];

const CODE_TO_ALLIANCE = {};
for (const [name, codes] of Object.entries(ALLIANCES)) {
  for (const c of codes) CODE_TO_ALLIANCE[c] = name;
}

/** Return the alliance name for an IATA airline code, or "Unaffiliated". */
export function allianceOf(code) {
  return CODE_TO_ALLIANCE[code] || 'Unaffiliated';
}
