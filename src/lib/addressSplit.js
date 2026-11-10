// Splits an address read from an ID into the registration form's address
// fields: house no. or block & lot, street, subdivision, zone / purok, area.
//
// 1. The house number or block & lot comes out first ("145", "BLK 3 LOT 9",
//    "B6 L24", "B-4 L-11").
// 2. The barangay, city, province, ZIP code and country are dropped: the form
//    asks only for the part inside Pasong Buaya II.
// 3. What's left is matched against the barangay's own street and subdivision
//    lists (address_options.php, migration 026), so a listed name fills its
//    box in the list's own spelling ("MAGDIWANG ST" -> "MAGDIWANG STREET").
// 4. Anything unlisted is placed by its wording ("...ST/AVE/ROAD" -> street,
//    "...SUBD/VILLAGE/HOMES/VALLEY" -> subdivision, "...COMPOUND/CMPD" ->
//    compound, "PUROK/ZONE" -> zone),
//    and the rest goes to Area. The resident can still change every box.

const STREET_WORDS = { ST: 'STREET', STR: 'STREET', AVE: 'AVENUE', AV: 'AVENUE', RD: 'ROAD', BLVD: 'BOULEVARD', DR: 'DRIVE', LN: 'LANE', EXT: 'EXTENSION' };
const STREET_KEYWORD = /\b(?:ST|STR|STREET|AVE|AV|AVENUE|RD|ROAD|BLVD|BOULEVARD|DR|DRIVE|LANE|LN|LOOP|EXT|EXTENSION|HIGHWAY|HWY)\b\.?/;
const COMPOUND_KEYWORD = /\b(?:COMPOUND|CMPD)\b\.?/;
const SUBDIVISION_KEYWORD = /\b(?:SUBD|SUBDIVISION|VILLAGE|VILL|HOMES|ESTATES?|RESIDENCES|HEIGHTS|HILLS|VALLEY|PARK|PLACE|VILLE|TOWNHOMES?|PHASE|PH)\b\.?/;
const ZONE_KEYWORD = /\b(?:PUROK|ZONE|SITIO)\b/;

// Parts that are not inside the barangay, removed wherever they appear.
const OUTSIDE_PARTS = [
  /\b(?:BRGY\.?|BARANGAY|BGY\.?)\s*/g,
  /\bP(?:ASONG)?\.?\s*BUAYA\s*(?:II|2|IL|LI|LL|11)\b/g,
  /\bCITY\s+OF\s+IMUS\b/g, /\bIMUS\s+CITY\b/g, /\bIMUS\b/g,
  /\bPROVINCE\s+OF\s+CAVITE\b/g, /\bCAVITE\b/g,
  /\bREGION\s+IV-?A\b/g, /\bCALABARZON\b/g, /\bPHILIPPINES\b/g, /\bPHL\b/g,
  /\b4103\b/g, // Imus ZIP code
];

const clean = (t) => String(t || '').toUpperCase().replace(/\s+/g, ' ').trim();

/** Comparable form of a name: no punctuation or barangay, abbreviations spelled out. */
export const addressKey = (name) => {
  let t = clean(name).replace(/[.,'’]/g, ' ');
  for (const re of OUTSIDE_PARTS) t = t.replace(re, ' ');
  return t.split(/\s+/).filter(Boolean)
    .map((w) => STREET_WORDS[w] || ({ SUBD: 'SUBDIVISION', VILL: 'VILLAGE', CMPD: 'COMPOUND', PH: 'PHASE' }[w]) || w)
    .join(' ');
};

// A listed name found inside a segment, longest first, so "VALLEJO PLACE PHASE 3
// EXTENSION" wins over "VALLEJO PLACE PHASE 3".
const findListed = (segmentKey, list) => {
  let best = null;
  for (const item of list) {
    const key = addressKey(item.name);
    if (!key) continue;
    // Also the name without its generic ending ("MAGDIWANG" for MAGDIWANG STREET).
    const short = key.replace(/\s+(?:STREET|AVENUE|ROAD|DRIVE|BOULEVARD|SUBDIVISION)$/, '');
    // The full name may sit inside a longer part; the short name ("GARDENIA"
    // for GARDENIA STREET) only counts when it is the whole part, or
    // "GARDENIA VALLEY" would become a street.
    if (key.length >= 4) {
      const re = new RegExp(`(?:^| )${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?: |$)`);
      if (re.test(segmentKey) && (!best || key.length > best.matched.length)) best = { item, matched: key };
    }
    if (short !== key && short.length >= 4 && segmentKey === short && (!best || short.length > best.matched.length)) {
      best = { item, matched: short };
    }
  }
  return best;
};

/**
 * @param {string} fullAddress as read from the ID
 * @param {{ streets?: {name:string}[], subdivisions?: {name:string}[] }} options the address lists (may be empty)
 * @returns {{ houseNo, blockLot, street, compound, subdivision, zone, area }}
 */
export function splitScannedAddress(fullAddress, options = {}) {
  const out = { houseNo: '', blockLot: '', street: '', compound: '', subdivision: '', zone: '', area: '' };
  let text = clean(fullAddress);
  if (!text) return out;

  // 1. Block & lot, then a house number.
  const bl = text.match(/\b(?:BLK|BLOCK|B)\.?\s*-?\s*(\d+[A-Z]?)\s*,?\s*(?:LOT|LT|L)\.?\s*-?\s*(\d+[A-Z]?)\b/);
  const lb = !bl && text.match(/\b(?:LOT|LT)\.?\s*-?\s*(\d+[A-Z]?)\s*,?\s*(?:BLK|BLOCK)\.?\s*-?\s*(\d+[A-Z]?)\b/); // "LOT 5 BLK 2"
  if (bl || lb) {
    const m = bl || lb;
    out.blockLot = bl ? `BLK ${bl[1]} LOT ${bl[2]}` : `BLK ${lb[2]} LOT ${lb[1]}`;
    text = (text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length)).trim();
  }
  if (!out.blockLot) {
    const hn = text.match(/^(?:#\s*)?(\d+[A-Z]?(?:-[A-Z0-9]+)?)\b[\s,]*/);
    if (hn) { out.houseNo = hn[1]; text = text.slice(hn[0].length); }
  }

  // 2. Segments without the barangay / city / province / ZIP / country.
  const segments = text.split(/\s*,\s*/).map((seg) => {
    let s = ` ${seg} `;
    for (const re of OUTSIDE_PARTS) s = s.replace(re, ' ');
    return s.replace(/\s+/g, ' ').replace(/^[\s,.-]+|[\s,.-]+$/g, '');
  }).filter((s) => s && !/^\d{4}$/.test(s));

  const streets = options.streets || [];
  const subdivisions = options.subdivisions || [];
  const areas = [];

  for (const seg of segments) {
    let rest = seg;
    // A house number left at the start of a later segment ("145, ...").
    if (!out.houseNo && !out.blockLot && /^\d+[A-Z]?$/.test(rest)) { out.houseNo = rest; continue; }
    if (!out.houseNo && !out.blockLot && !ZONE_KEYWORD.test(rest)) {
      const lead = rest.match(/^(?:#\s*)?(\d+[A-Z]?)\s+(?=[A-Z])/);
      if (lead) { out.houseNo = lead[1]; rest = rest.slice(lead[0].length); }
    }

    // 3. Listed names first.
    const key = addressKey(rest);
    const sub = findListed(key, subdivisions);
    // A listed compound (address_subdivisions.kind) fills Compound instead.
    const subIsCompound = sub && (sub.item.kind === 'compound' || COMPOUND_KEYWORD.test(sub.item.name));
    if (sub && (subIsCompound ? !out.compound : !out.subdivision)) {
      out[subIsCompound ? 'compound' : 'subdivision'] = sub.item.name;
      rest = addressKey(rest).replace(sub.matched, ' ').trim();
    }
    const st = !out.street && findListed(addressKey(rest), streets);
    if (st) { out.street = st.item.name; rest = addressKey(rest).replace(st.matched, ' ').trim(); }
    rest = rest.replace(/\s+/g, ' ').trim();
    if (!rest) continue;

    // 4. Unlisted: by wording. A segment can hold a street then a subdivision
    // ("PH4 SAPPHIRE ST CITIHOMES SUBD").
    if (ZONE_KEYWORD.test(rest) && !out.zone) { out.zone = rest; continue; }
    const stMatch = !out.street && rest.match(STREET_KEYWORD);
    if (stMatch) {
      const end = stMatch.index + stMatch[0].length;
      let before = rest.slice(0, end).trim();
      const after = rest.slice(end).trim();
      // A leading phase ("PH4") belongs to the subdivision after the street.
      const phase = before.match(/^(PH(?:ASE)?\.?\s*\d+[A-Z]?)\s+/);
      if (phase) before = before.slice(phase[0].length);
      // Spell out the ending like the list does ("MAGDIWANG ST" -> "MAGDIWANG STREET").
      out.street = before.replace(/\b([A-Z]+)\.?$/, (w, word) => STREET_WORDS[word] || w);
      const leftover = [after, phase ? phase[1] : ''].filter(Boolean).join(' ').trim();
      if (leftover) {
        if (COMPOUND_KEYWORD.test(leftover) && !out.compound) out.compound = leftover;
        else if (SUBDIVISION_KEYWORD.test(leftover) && !out.subdivision) out.subdivision = leftover;
        else areas.push(leftover);
      }
      continue;
    }
    if (COMPOUND_KEYWORD.test(rest) && !out.compound) { out.compound = rest; continue; }
    if (SUBDIVISION_KEYWORD.test(rest) && !out.subdivision) { out.subdivision = rest; continue; }
    areas.push(rest);
  }
  out.area = areas.join(', ');
  return out;
}
