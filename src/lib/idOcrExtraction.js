// Label-anchored field extraction for Philippine government IDs.
//
// Originally a port of the label-extraction core that used to live in
// backend/api/ocr_id.php, then hardened against a real Philippine National
// ID while OCR ran client-side via the (now removed) src/lib/tesseractOcr.js,
// now consumed again by a server-side call to backend/api/ocr_id.php
// (rebuilt for Google Cloud Vision). Same field names, same regex patterns,
// same overall shape through every one of those moves, so Register.jsx's
// processBackendOcrResult() has never needed to change.
//
// Deliberately engine-agnostic: everything here operates on a plain
// [{text, confidence}] array, in reading order, regardless of which OCR
// engine produced it.
//
// Per-ID-type extraction (ID_PROFILES below): different Philippine ID types
// label fields differently, don't all carry the same fields, and some print
// a single combined name line instead of separate surname/first/middle
// fields. Built from real research (government sources where reachable,
// flagged confidence elsewhere) rather than assumption — see the project
// plan file for full citations. Two ID types get special handling beyond a
// plain label swap: PhilHealth's card face genuinely has no
// sex/birthDate/address fields at all (confirmed directly against the 2010
// PhilHealth circular's own card-design image), and post-2016 e-passports
// carry a machine-readable zone (MRZ) that's tried first and is far more
// reliable than reading the visual page.

/**
 * Base label patterns (English + Filipino), shared building blocks for
 * every ID_PROFILES entry that carries a given field. Unchanged from the
 * original single-profile version of this file.
 */
const BASE_LABELS = {
  // Negative lookbehind excludes "GITNANG APELYIDO" ("middle surname"),
  // the Filipino label actually printed for MIDDLE name — without it,
  // this pattern also matches inside that phrase and steals the middle
  // name's text as if it were the surname. "APLEYIDO" (letters
  // transposed) is included alongside the correct spelling because
  // Tesseract was observed misreading it that way on a real PhilID.
  surName: /\b(?<!GITNANG\s*)(?:APELYIDO|APLEYIDO|LAST\s*NAME|SURNAME)\b\s*[:-]?/i,
  firstName: /\b(?:MGA\s*PANGALAN|GIVEN\s*NAMES?|FIRST\s*NAME)\b\s*[:-]?/i,
  // "MIDDLE INITIAL/NAME" is the real label wording on a current PRC ID
  // (confirmed against a real card), not just "MIDDLE NAME".
  middleName: /\b(?:GITNANG\s*PANGALAN|MIDDLE\s*NAME|MIDDLE\s*INITIAL)\b\s*[:-]?/i,
  sex: /\b(?:SEX|KASARIAN|GENDER)\b\s*[:-]?/i,
  birthDate: /\b(?:PETSA\s*NG\s*KAPANGANAKAN|DATE\s*OF\s*BIRTH|BIRTH\s*DATE|DOB)\b\s*[:-]?/i,
  address: /\b(?:TIRAHAN|ADDRESS|PERMANENT\s*ADDRESS)\b\s*[:-]?/i,
  // Confirmed present on a real driver's license ("Blood Type" -> "O+").
  bloodType: /\bBLOOD\s*TYPE\b\s*[:-]?/i,
  // Confirmed present on a real Voter's Certification ("Civil Status: Single").
  civilStatus: /\b(?:CIVIL\s*STATUS|KATAYUANG\s*SIBIL)\b\s*[:-]?/i,
};

// A real Philippine passport's data page labels the mother's-maiden-name
// field ("Panggitnang Apelyido / Mother's Maiden Name") as the middle-name
// equivalent — confirmed against a real passport data page — distinct
// enough from the base middleName pattern to warrant its own entry.
const PASSPORT_MIDDLE_NAME_LABEL = /\b(?:PANGGITNANG\s*APELYIDO|MOTHER'?S\s*MAIDEN\s*NAME)\b\s*[:-]?/i;

function pickLabels(keys) {
  const picked = {};
  for (const key of keys) picked[key] = BASE_LABELS[key];
  return picked;
}

const ALL_FIELD_KEYS = ['surName', 'firstName', 'middleName', 'sex', 'birthDate', 'address'];

/**
 * One entry per supported ID type, built from real research into each
 * card's actual layout (government sources where reachable, confidence
 * flagged where sources conflicted or a primary source wasn't reachable —
 * see the project plan file for full citations and per-fact confidence).
 *
 * - nameMode: 'separate' (search labeled surname/first/middle fields only),
 *   'combined' (this card is confirmed to print one combined name line —
 *   currently only PhilHealth), or 'combined-fallback' (separate-field
 *   extraction is tried first since it isn't disproven for this type, only
 *   unconfirmed either way — falls back to combined-name parsing only if
 *   that fully strikes out).
 * - fieldsPresent: single source of truth for which fields legitimately
 *   exist on this card — { name, birth_date, gender, address, idNumber,
 *   bloodType, civilStatus, height }. name/birth_date/gender/address/
 *   idNumber default to true everywhere except where research affirmatively
 *   disproved a field (PhilHealth's 2010-circular card design has no DOB/
 *   sex/address at all; PRC's post-2019 redesign removed DOB). bloodType/
 *   civilStatus/height default to false everywhere — the opposite default,
 *   since these three are genuinely rare and only confirmed present on one
 *   ID type each (bloodType/height: driver's license; civilStatus: Voter's
 *   Certification) rather than "probably present, just unconfirmed" like
 *   the first five. "Unconfirmed" is never silently treated as "absent" for
 *   the first five — also consumed by Register.jsx for scan-target defaults
 *   and the "what to scan" hint list.
 * - idNumberPattern: per-type where research gave a confirmed shape;
 *   several (voters/postal/drivers_license) are explicitly low-confidence
 *   best-effort patterns — extraction never hard-fails on a non-match.
 * - noiseList: verbatim boilerplate to strip before extraction, so it can
 *   never be mistaken for a field value (see stripKnownNoise below).
 */
export const ID_PROFILES = {
  national: {
    nameMode: 'separate',
    labels: pickLabels(ALL_FIELD_KEYS),
    fieldsPresent: { name: true, birth_date: true, gender: true, address: true, idNumber: true, bloodType: false, civilStatus: false, height: false },
    // 16 digits, four groups of four (e.g. "3974-0169-3591-0287", confirmed
    // against an actual PhilID) — must match isValidPhilSysNumber in
    // Register.jsx, or a value OCR reads correctly here gets silently
    // discarded there.
    idNumberPattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/,
    noiseList: [],
  },
  passport: {
    // 'separate' is the VIZ (visual page) fallback path only — MRZ parsing
    // (tryParsePassportMrz) is tried first for post-2016 e-passports and
    // bypasses label matching entirely when it succeeds. No address field:
    // passports don't print a home address. middleName uses a
    // passport-specific label ("Mother's Maiden Name") confirmed against a
    // real data page, not the base middleName pattern.
    nameMode: 'separate',
    labels: { ...pickLabels(['surName', 'firstName', 'sex', 'birthDate']), middleName: PASSPORT_MIDDLE_NAME_LABEL },
    fieldsPresent: { name: true, birth_date: true, gender: true, address: false, idNumber: true, bloodType: false, civilStatus: false, height: false },
    // 1 letter + 6-7 digits + an optional trailing check letter (e.g.
    // "P0936923C") — confirmed against a real e-passport's printed number
    // and cross-checked against its own MRZ checksum.
    idNumberPattern: /\b[A-Z]\d{6,7}[A-Z]?\b/,
    noiseList: [],
  },
  drivers_license: {
    // Confirmed against a real LTO license sample: the card prints one
    // combined line under the literal caption "Last Name, First Name,
    // Middle Name" (e.g. "DELA CRUZ, JUAN PEDRO GARCIA") — not separate
    // labeled fields. Sex/birthDate/address remain separately labeled.
    nameMode: 'combined',
    nameLabel: /\bLAST\s*NAME\s*,?\s*FIRST\s*NAME\s*,?\s*MIDDLE\s*NAME\b/i,
    labels: pickLabels(['sex', 'birthDate', 'address', 'bloodType']),
    fieldsPresent: { name: true, birth_date: true, gender: true, address: true, idNumber: true, bloodType: true, civilStatus: false, height: true },
    idNumberPattern: /\b[A-Z]\d{2}-\d{2}-\d{6}\b/,
    // Boilerplate near the signature block, confirmed against a real
    // sample — the officer's own printed name/title changes over time and
    // isn't hardcoded, but these surrounding generic phrases are stable.
    noiseList: [/SIGNATURE\s+OF\s+LICENSEE/i, /ASSISTANT\s+SECRETARY/i],
  },
  umid: {
    nameMode: 'separate',
    labels: pickLabels(ALL_FIELD_KEYS),
    fieldsPresent: { name: true, birth_date: true, gender: true, address: true, idNumber: true, bloodType: false, civilStatus: false, height: false },
    // CRN: 12 digits as 4-7-1 groups (e.g. "0033-1115041-3") — confirmed
    // against a real UMID sample.
    idNumberPattern: /\b\d{4}-\d{7}-\d{1}\b/,
    noiseList: [],
  },
  voters: {
    // Weakest-evidenced ID type in research (COMELEC stopped issuing the
    // plastic card in 2017; today's "Voter's Certification" layout and its
    // VIN format could not be confirmed against a primary source) — every
    // field defaults present/defensive rather than guessed absent. A real
    // sample confirmed separate labeled name fields (as already coded) and
    // a COMELEC official's printed name/title near the signature block.
    // Confirmed against a real Voter's Certification sample: "Civil
    // Status" is printed as its own explicit field (e.g. "Single").
    nameMode: 'separate',
    labels: pickLabels([...ALL_FIELD_KEYS, 'civilStatus']),
    fieldsPresent: { name: true, birth_date: true, gender: true, address: true, idNumber: true, bloodType: false, civilStatus: true, height: false },
    idNumberPattern: /\b[A-Z0-9][A-Z0-9-]{5,19}\b/,
    noiseList: [/\bCHAIRMAN\b/i],
  },
  postal: {
    // Confirmed against a real PHLPost sample: one combined line under the
    // literal caption "First Name, Middle Name, Surname, Suffix" (e.g.
    // "JUANA REYES DELA CRUZ") — space-separated, no comma. Since there's
    // no comma, parseCombinedName correctly leaves this as an unparsed
    // full name for manual review rather than guessing word boundaries
    // (a multi-word surname like "DELA CRUZ" makes position-based
    // splitting unreliable).
    nameMode: 'combined',
    // Must consume the real caption's full "...Surname, Suffix" tail too —
    // stopping at "Surname" left ", Suffix" as an unmatched, plausible-
    // looking remainder that got misread as if it were the actual value.
    nameLabel: /\bFIRST\s*NAME\s*,?\s*MIDDLE\s*NAME\s*,?\s*SURNAME\s*,?\s*SUFFIX\b/i,
    labels: pickLabels(['birthDate', 'address']),
    fieldsPresent: { name: true, birth_date: true, gender: false, address: true, idNumber: true, bloodType: false, civilStatus: false, height: false },
    // Postal Reference Number: 12-character alphanumeric — confirmed
    // against a real sample ("100141234567").
    idNumberPattern: /\b[A-Z0-9]{12}\b/,
    noiseList: [],
  },
  prc: {
    // The September 2019 redesign removed Date of Birth and Last Renewal
    // Date from the card entirely (confirmed on prc.gov.ph) — no birthDate/
    // sex/address labels or fieldsPresent for this type.
    nameMode: 'separate',
    labels: pickLabels(['surName', 'firstName', 'middleName']),
    fieldsPresent: { name: true, birth_date: false, gender: false, address: false, idNumber: true, bloodType: false, civilStatus: false, height: false },
    // Widened from an earlier 6-7 digit guess after a real sample showed
    // an 8-digit registration number.
    idNumberPattern: /\b\d{6,8}\b/,
    noiseList: [
      /THIS\s+IS\s+TO\s+CERTIFY\s+THAT\s+THE\s+PERSON\s+WHOSE\s+NAME/i,
      /DULY\s+REGISTERED\s+PROFESSIONAL/i,
      /HAS\s+NOT\s+BEEN\s+SUSPENDED,?\s+REVOKED\s+OR\s+WITHDRAWN/i,
    ],
  },
  philhealth: {
    // The 2010 PhilHealth circular's own card-design image shows only
    // three fields (PhilHealth Number, Name, Signature) — but a newer
    // PhilHealth ID sample shows a birth-date/sex line too ("JANUARY 01,
    // 2022 - MALE"), so a later redesign likely added them. Given this
    // conflict, both fields are kept present-but-defensive: labels are
    // included so a labeled variant is found if present, and the standalone
    // sex-token fallback (findStandaloneSexToken) already catches "MALE" in
    // an unlabeled merged line regardless. Costs nothing on the older
    // 3-field design beyond one harmless "could not locate" warning.
    nameMode: 'combined',
    nameLabel: /\bNAME\b\s*[:-]?/i,
    labels: pickLabels(['sex', 'birthDate']),
    fieldsPresent: { name: true, birth_date: true, gender: true, address: false, idNumber: true, bloodType: false, civilStatus: false, height: false },
    // PIN: 12 digits, "XX-XXXXXXXXX-X" (2-9-1) typically, widened to an
    // 8-9 digit middle group since a real-looking sample showed 8.
    idNumberPattern: /\b\d{2}[\s-]?\d{8,9}[\s-]?\d{1}\b/,
    noiseList: [
      /THE\s+NUMBER\s+ON\s+THIS\s+CARD\s+IS\s+YOUR\s+PERMANENT\s+PHILHEALTH\s+NUMBER/i,
      /USE\s+THE\s+NAME\s+AND\s+PHILHEALTH\s+NUMBER\s+AS\s+INDICATED/i,
      /IN\s+CASE\s+OF\s+LOSS\s+OF\s+THIS\s+CARD/i,
      /YOUR\s+PARTNER\s+IN\s+HEALTH/i,
    ],
  },
  tin: {
    // Confirmed against a real TIN card: "Name:" label, one combined line,
    // comma-separated ("CANTOR, JAYZEL BALDIVIA" -> surname "CANTOR").
    // The same real card also has a dense tiled "BUREAU OF INTERNAL
    // REVENUE" watermark across the entire background — handled generally
    // by stripRepeatedWatermarkNoise below (not unique to TIN), with an
    // exact-phrase entry here too as a defense-in-depth backstop.
    nameMode: 'combined',
    nameLabel: /\b(?:FULL\s*NAME|NAME)\b\s*[:-]?/i,
    labels: pickLabels(['birthDate', 'address']),
    fieldsPresent: { name: true, birth_date: true, gender: false, address: true, idNumber: true, bloodType: false, civilStatus: false, height: false },
    // 3-3-3 base, then a 3-5 digit branch suffix — a real card showed a
    // 5-digit suffix ("688-241-220-00000"), wider than the 3-digit shape
    // secondary research suggested, so both are accepted.
    idNumberPattern: /\b\d{3}-\d{3}-\d{3}-\d{3,5}\b/,
    noiseList: [/BUREAU\s+OF\s+INTERNAL\s+REVENUE/i, /\bSIGNATURE\b/i],
  },
  generic: {
    // Fallback for any unrecognized slug — today's original one-size-fits-
    // all behavior, unchanged.
    nameMode: 'separate',
    labels: pickLabels(ALL_FIELD_KEYS),
    fieldsPresent: { name: true, birth_date: true, gender: true, address: true, idNumber: true, bloodType: false, civilStatus: false, height: false },
    idNumberPattern: /\b[A-Z0-9][A-Z0-9-]{5,19}\b/,
    noiseList: [],
  },
};

export function getIdProfile(idType) {
  return ID_PROFILES[idType] || ID_PROFILES.generic;
}

/**
 * Kept for shape-compatibility with the pre-Phase-10 single-profile
 * version of this file; every internal call site now goes through
 * getIdProfile() directly, but this wrapper means any future/external
 * caller expecting the original { labels, idNumberPattern } return shape
 * still gets it.
 */
export function getFieldExtractionRules(idType) {
  const profile = getIdProfile(idType);
  return { labels: profile.labels, idNumberPattern: profile.idNumberPattern };
}

// Stripped from every ID type's OCR lines before extraction, regardless of
// profile — MRZ filler runs and the standard bilingual republic header, both
// confirmed to otherwise risk being read as field content.
const UNIVERSAL_NOISE_PATTERNS = [
  /<{5,}/,
  /^\s*REPUBLIC\s+OF\s+THE\s+PHILIPPINES\s*$/i,
  /^\s*REPUBLIKA\s+NG\s+PILIPINAS\s*$/i,
];

/**
 * Drops any OCR line matching the active ID type's confirmed boilerplate
 * (e.g. PhilHealth's back-of-card notice, PRC's certification paragraph)
 * plus the universal set above, before any label matching runs — so
 * boilerplate text can never be mistaken for a field's value. Pure: returns
 * a new filtered array, doesn't mutate the input.
 */
function stripKnownNoise(lines, idType) {
  const profile = getIdProfile(idType);
  const noisePatterns = [...UNIVERSAL_NOISE_PATTERNS, ...(profile.noiseList || [])];
  return lines.filter((line) => !noisePatterns.some((pattern) => pattern.test(line.text)));
}

// Only engage the frequency heuristic below when there's enough OCR output
// that coincidental substring repeats are very unlikely to trip it by
// accident. A real tiled watermark produces dozens of lines; a normal ID
// produces a handful.
const WATERMARK_MIN_LINE_COUNT = 15;
const WATERMARK_NGRAM_SIZE = 3;
const WATERMARK_NGRAM_MIN_COUNT = 3; // a line needs at least this many n-grams before the heuristic judges it at all
const WATERMARK_NGRAM_HOT_THRESHOLD = 4; // an n-gram appearing in this many distinct lines is "hot"
const WATERMARK_HOT_FRACTION = 0.5; // a line is dropped once at least this fraction of its n-grams are hot

function letterNgrams(text, n) {
  const clean = text.toUpperCase().replace(/[^A-Z]/g, '');
  const grams = [];
  for (let i = 0; i + n <= clean.length; i++) {
    grams.push(clean.slice(i, i + n));
  }
  return grams;
}

/**
 * Detects and drops OCR lines that are mostly tiled background-watermark
 * text rather than real content — confirmed as a real, recurring problem
 * against actual cards: a TIN ID's "BUREAU OF INTERNAL REVENUE" tiled
 * diagonally across the whole background, and a Voter's Certification's
 * "COMELEC"/"FOR VOTING OFFICE" watermark, both produce dozens of garbled
 * OCR line fragments (Vision reads each tile/rotation as separate text).
 *
 * A per-ID-type noiseList entry can only catch exact, known phrases; a
 * watermark fragments unpredictably ("ERN", "TERN", "IAL REVENUE BUREAU",
 * "E BUREAU OF INTERN", "UREAU OF INTERN", ...) depending on how the tiling
 * and OCR bounding boxes happen to align, and rarely repeats as the exact
 * same string twice — so neither a fixed phrase list nor whole-word
 * frequency counting reliably catches it (tried whole-word counting first;
 * against a real 49-fragment sample it only caught the handful of lines
 * that happened to repeat verbatim, missing the many one-off variants).
 *
 * Character 3-grams instead: "BUREAU", "UREAU", and "BUREAL" all share
 * overlapping substrings ("URE", "REA", "EAU") even though none of them
 * are identical strings, so this correlates fragments a whole-word
 * approach can't. Tuned against the real fragment sample above — these
 * thresholds caught ~85% of the noise there with zero real-content loss;
 * see the project's verification script for that exact case.
 */
function stripRepeatedWatermarkNoise(lines) {
  if (lines.length < WATERMARK_MIN_LINE_COUNT) {
    return lines;
  }

  const lineGrams = lines.map((line) => [...new Set(letterNgrams(line.text, WATERMARK_NGRAM_SIZE))]);

  const gramLineCounts = new Map();
  for (const grams of lineGrams) {
    for (const gram of grams) {
      gramLineCounts.set(gram, (gramLineCounts.get(gram) || 0) + 1);
    }
  }

  return lines.filter((line, idx) => {
    const grams = lineGrams[idx];
    if (grams.length < WATERMARK_NGRAM_MIN_COUNT) return true; // too short to judge reliably — keep
    const hotCount = grams.filter((g) => gramLineCounts.get(g) >= WATERMARK_NGRAM_HOT_THRESHOLD).length;
    return hotCount / grams.length < WATERMARK_HOT_FRACTION;
  });
}

/**
 * Drops tokens that contain no uppercase letter and no digit. Real printed
 * content on a Philippine government ID (names, addresses) is ALL CAPS —
 * confirmed against an actual PhilID — so a lowercase-only token sitting
 * next to a correctly-read value is almost always OCR noise picked up from
 * the card's watermark/security pattern, not real text (e.g. "ab JAYZEL ="
 * has real content "JAYZEL"; "ab" and "=" are noise).
 */
function stripNoiseTokens(text) {
  return text
    .split(/\s+/)
    .filter((token) => /[A-Z0-9]/.test(token))
    .join(' ')
    .trim();
}

/**
 * Judges whether a candidate line (an inline label-remainder, or a
 * lookahead line) actually looks like real field content, not noise sitting
 * between a label and the real value. Confirmed as a real bug against a
 * real driver's license scan: right after the "Address" label, the next
 * OCR line was "MIDTemp" (a fragment of a "TEMPLATE" watermark broken up by
 * OCR) — the old length-only check judged it "plausible" and grabbed it
 * instead of skipping ahead to the real address two lines further down;
 * the same happened with a stray "10." template-marker token stealing the
 * name field. Two additional rules beyond the base length check:
 *
 * - A no-letter candidate (pure digits/punctuation, like "10.") must have
 *   at least 4 actual digits to look like a real ID number or date — not
 *   just any short numeric fragment.
 * - Every word with letters must be shaped like real writing: either ALL
 *   CAPS (the convention on most Philippine IDs, e.g. "KALIRAYA") or proper
 *   Title Case — one leading capital, the rest lowercase (confirmed as a
 *   real, different but equally legitimate convention on a Voter's
 *   Certification, which prints "Single"/"Female" rather than ALL CAPS).
 *   A word with capitals scattered elsewhere, like "MIDTemp", matches
 *   neither shape and is rejected — that irregular pattern is the actual
 *   signature of watermark/background text, not merely "not all-caps".
 */
function isPlausibleValue(text) {
  const stripped = stripNoiseTokens(text);
  if (stripped.length < 2) return false;

  const letters = stripped.replace(/[^A-Za-z]/g, '');
  if (letters.length === 0) {
    if (stripped.replace(/[^0-9]/g, '').length >= 4) return true;
    // Narrow exception: "0+"/"0-" specifically — confirmed live against the
    // real Vision API misreading a printed "O" (blood type) as digit "0".
    // A blood type is genuinely this short; the >=4-digit rule above exists
    // to reject unrelated junk like a stray "10." form marker, which this
    // exact shape doesn't match.
    return /^0[+-]$/.test(stripped);
  }

  return stripped.split(/\s+/).every((word) => {
    const wordLetters = word.replace(/[^A-Za-z]/g, '');
    if (wordLetters.length === 0) return true;
    return /^[A-Z]+$/.test(wordLetters) || /^[A-Z][a-z]*$/.test(wordLetters);
  });
}

export function extractLabeledField(lines, labelPattern, allLabelPatterns = []) {
  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const match = labelPattern.exec(line.text);
    if (!match) continue;

    // "▶" is a real bullet glyph used before each value on a current PRC ID
    // sample (e.g. "LAST NAME ▶ DELA CRUZ") — stripped alongside the
    // existing whitespace/colon/slash/dash junk so it never leaks into the
    // captured value.
    const remainder = line.text
      .slice(match.index + match[0].length)
      .replace(/^[\s:/\-▶»›>]+/, '')
      .replace(/[\s:/-]+$/, '');

    // A remainder that still contains this field's own label text (e.g. a
    // bilingual line like "Petsa ng Kapanganakan /.Date of Birth" where the
    // English label trails the Filipino one with no real value between
    // them) is leftover label, not data — label words are legitimately
    // capitalized too, so the plain plausibility check alone can't tell the
    // difference. Treat it as no inline value and fall through to lookahead.
    if (isPlausibleValue(remainder) && !labelPattern.test(remainder)) {
      return { value: remainder, confidence: line.confidence, lineIndex: idx };
    }

    // Label found but no plausible inline value — the real value is likely
    // on one of the next couple of OCR lines (common on a dense ID card,
    // sometimes with a junk line from a security pattern in between; stop
    // early if a line turns out to be a different field's own label).
    for (let lookahead = 1; lookahead <= 2; lookahead++) {
      const next = lines[idx + lookahead];
      if (!next) break;
      if (allLabelPatterns.some((pattern) => pattern.test(next.text))) break;
      if (isPlausibleValue(next.text)) {
        return { value: next.text.trim(), confidence: next.confidence, lineIndex: idx + lookahead };
      }
    }
  }

  return null;
}

export function extractIdNumber(lines, pattern) {
  for (const line of lines) {
    const match = pattern.exec(line.text);
    if (match) {
      return { value: match[0].trim(), confidence: line.confidence };
    }
  }
  return null;
}

/**
 * Splits a single combined name line into surname/first/middle — used for
 * ID types that print one "Name" field instead of separate labeled ones
 * (PhilHealth, confirmed; TIN/driver's-license, as a fallback).
 *
 * Only a comma resolves the split confidently: "DELA CRUZ, JUAN SANTOS" ->
 * surname "DELA CRUZ", first "JUAN", middle "SANTOS" (Philippine
 * government-form convention: surname before the comma, then given names in
 * first-middle order).
 *
 * With NO comma, this deliberately does NOT guess an order. Unlike
 * formatDate's day/month ambiguity below — which has a documented,
 * resolvable tiebreak (DD/MM, the Philippine convention, when both values
 * are plausible) — a bare combined Filipino name has no equivalent rule
 * research could confirm; guessing would silently misassign surname/first
 * name more often than not. Returns an 'unparsed' result instead, which the
 * caller surfaces for the citizen to split manually. This is the common
 * case in practice: real PhilHealth cards are frequently printed with no
 * comma at all.
 */
export function parseCombinedName(text) {
  const cleaned = stripNoiseTokens(text || '').trim();
  if (!cleaned) {
    return { mode: 'unparsed', fullName: '' };
  }

  const commaIndex = cleaned.indexOf(',');
  if (commaIndex === -1) {
    return { mode: 'unparsed', fullName: cleaned };
  }

  const surName = cleaned.slice(0, commaIndex).trim();
  const remainderTokens = cleaned.slice(commaIndex + 1).trim().split(/\s+/).filter(Boolean);

  if (!surName || remainderTokens.length === 0) {
    return { mode: 'unparsed', fullName: cleaned.replace(/,/g, ' ').replace(/\s+/g, ' ').trim() };
  }

  const [firstName, ...middleTokens] = remainderTokens;

  return { mode: 'split', surName, firstName, middleName: middleTokens.join(' ') };
}

/**
 * Fallback for when SEX has no findable label at all — on at least one real
 * PhilID layout, the sex indicator sits on the same visual row as (and gets
 * OCR'd merged onto) the date-of-birth line, e.g. "AUGUST 10, : 2004 F",
 * with no separate "SEX:" text anywhere for extractLabeledField to anchor
 * on. Scans every line for a standalone M/F/MALE/FEMALE token. Lower
 * confidence than a label-anchored match, since there's no label context.
 */
function findStandaloneSexToken(lines) {
  for (const line of lines) {
    const match = line.text.match(/\b(FEMALE|MALE|F|M)\b/);
    if (match) {
      return { value: match[1], confidence: Math.round(line.confidence * 0.85 * 10) / 10 };
    }
  }
  return null;
}

/**
 * Finds a height value by scanning every line for a bare decimal shaped
 * like a height in meters (e.g. "1.55", "1.88"), rather than label-anchored
 * extraction. Deliberate: on a real driver's license, "Weight (kg)" and
 * "Height(m)" print as one merged header line, but Vision's line-by-line
 * flattening doesn't reliably preserve which of the following numeric
 * lines belongs to which header — a real scan returned the height value
 * one line before the weight value, the opposite of header order. Scanning
 * for a number shaped specifically like a plausible adult height (1.0-2.5m)
 * sidesteps that column-order ambiguity entirely, since no other field on
 * these cards prints a bare X.XX-shaped decimal in that range. Returns
 * whole centimeters (the form's own unit), not meters.
 */
function findStandaloneHeightInCm(lines) {
  for (const line of lines) {
    const match = line.text.match(/\b([12]\.\d{1,2})\b/);
    if (match) {
      const meters = parseFloat(match[1]);
      if (meters >= 1.0 && meters <= 2.5) {
        return { value: Math.round(meters * 100), confidence: Math.round(line.confidence * 0.85 * 10) / 10 };
      }
    }
  }
  return null;
}

const MONTH_NAMES = {
  JANUARY: '01', FEBRUARY: '02', MARCH: '03', APRIL: '04', MAY: '05', JUNE: '06',
  JULY: '07', AUGUST: '08', SEPTEMBER: '09', OCTOBER: '10', NOVEMBER: '11', DECEMBER: '12',
  // Abbreviated forms — confirmed against real samples (TIN ID: "10-AUG-2004";
  // Postal ID: "14 Aug 88", "01 Dec 24").
  JAN: '01', FEB: '02', MAR: '03', APR: '04', JUN: '06', JUL: '07',
  AUG: '08', SEP: '09', SEPT: '09', OCT: '10', NOV: '11', DEC: '12',
};

// Longest names first so e.g. "SEPTEMBER" isn't cut short by an earlier
// partial alternation match — matters less with \b word boundaries, but
// keeps the pattern's intent unambiguous.
const MONTH_NAME_ALTERNATION = Object.keys(MONTH_NAMES).sort((a, b) => b.length - a.length).join('|');

export function cleanFieldValue(text, fieldName) {
  if (['surName', 'firstName', 'middleName', 'address'].includes(fieldName)) {
    text = stripNoiseTokens(text);
  }

  text = text.replace(/\s+(?:PHILIPPINES|CITY|PROVINCE)\s*$/i, '');
  text = text.replace(/\s+/g, ' ').trim();

  if (fieldName === 'sex') {
    const upper = text.toUpperCase();
    // Word-boundary matches, not substring checks — "FEMALE" and "MALE" are
    // both matched as whole words here, so there's no risk of "MALE"
    // matching inside "FEMALE" the way a plain .includes() check would.
    if (/\bFEMALE\b/.test(upper)) return 'F';
    if (/\bMALE\b/.test(upper)) return 'M';
    // Word-boundary, not exact-string, matches — a label match can capture
    // a whole merged line as its remainder (e.g. UMID's "SEX F DATE OF
    // BIRTH 2004/01/28" line, where the SEX label's own leftover-guard
    // doesn't catch it since "SEX" doesn't recur), leaving "F ..." rather
    // than a bare "F". An exact ^F$/^M$ match would silently return ''
    // instead of the real value in that case.
    if (/\bF\b/.test(upper)) return 'F';
    if (/\bM\b/.test(upper)) return 'M';
    return '';
  }

  if (fieldName === 'birthDate') {
    return formatDate(text);
  }

  if (fieldName === 'bloodType') {
    // Validated against the exact shape, not just returned as-is — a
    // label-anchored match's remainder/lookahead can still land on
    // unrelated nearby text; only return something that actually looks
    // like a blood type rather than pass through whatever was captured.
    // No trailing \b after [+-] — "+"/"-" isn't a word character, so a
    // boundary assertion right after it never matches (neither side is a
    // word char), which silently broke every match ending in "+". "0"
    // alongside "O" — confirmed live against the real Vision API, which
    // read a printed "O+" as digit "0" plus "+" (a classic OCR O/0
    // font-similarity confusion); normalized back to the letter below.
    const match = text.toUpperCase().match(/\b(AB|A|B|O|0)\s*([+-])/);
    if (!match) return '';
    const letter = match[1] === '0' ? 'O' : match[1];
    return `${letter}${match[2]}`;
  }

  if (fieldName === 'civilStatus') {
    const upper = text.toUpperCase();
    // Maps onto the exact <select name="civil_status"> option values in
    // Register.jsx (Single/Married/Widowed/Separated) — matches the same
    // pattern already used for sex's Male/Female mapping.
    if (/\bSINGLE\b/.test(upper)) return 'Single';
    if (/\bMARRIED\b/.test(upper)) return 'Married';
    if (/\bWIDOW/.test(upper)) return 'Widowed';
    if (/\bSEPARATED\b/.test(upper)) return 'Separated';
    return '';
  }

  return text;
}

// A 2-digit year on an ID is essentially always in the past (a birth date,
// or a recent issuance/renewal) — never more than ~1 year in the future.
// Rolls back a century if the naive same-century reading would be
// implausibly far ahead, e.g. "88" -> 1988, not 2088; "24" -> 2024.
function normalizeTwoDigitYear(yearRaw) {
  if (yearRaw.length === 4) return yearRaw;
  const currentYear = new Date().getFullYear();
  const century = Math.floor(currentYear / 100) * 100;
  let fullYear = century + parseInt(yearRaw, 10);
  if (fullYear > currentYear + 1) fullYear -= 100;
  return String(fullYear);
}

export function formatDate(text) {
  const upper = text.toUpperCase();

  // Spelled-out (or abbreviated) month, month-first — "AUGUST 10, 2004"
  // (PhilID), "JANUARY 01, 2022" (PhilHealth). Tried before any digit-only
  // pass below, which would otherwise strip the month name entirely and
  // leave nothing parseable.
  const monthFirstMatch = upper.match(
    // \D{1,10}, not {0,10} — requiring at least one non-digit between the
    // day and year stops this from misreading a bare "MONTH YYYY" (day
    // omitted, e.g. day-first "01 January 2000" mistakenly entered here
    // instead of the day-first branch below) by splitting the 4-digit year
    // itself into a fake 2-digit "day" + 2-digit "year".
    new RegExp(`\\b(${MONTH_NAME_ALTERNATION})\\b[.,\\s]+(\\d{1,2})\\D{1,10}(\\d{2,4})\\b`)
  );
  if (monthFirstMatch) {
    const [, monthName, day, yearRaw] = monthFirstMatch;
    return `${normalizeTwoDigitYear(yearRaw)}-${MONTH_NAMES[monthName]}-${day.padStart(2, '0')}`;
  }

  // Day-first, spelled/abbreviated month — "01 January 2000" (Voter's
  // Certification), "10-AUG-2004" (TIN ID), "14 Aug 88" (Postal ID).
  const dayFirstMatch = upper.match(
    new RegExp(`\\b(\\d{1,2})[\\s-]+(${MONTH_NAME_ALTERNATION})\\b[.,\\s-]+(\\d{2,4})\\b`)
  );
  if (dayFirstMatch) {
    const [, day, monthName, yearRaw] = dayFirstMatch;
    return `${normalizeTwoDigitYear(yearRaw)}-${MONTH_NAMES[monthName]}-${day.padStart(2, '0')}`;
  }

  const numeric = text.replace(/[^0-9/-]/g, '');

  if (/^\d{4}-\d{2}-\d{2}$/.test(numeric)) {
    return numeric;
  }

  let m = numeric.match(/^(\d{4})[/-](\d{2})[/-](\d{2})$/);
  if (m) {
    return `${m[1]}-${m[2]}-${m[3]}`;
  }

  m = numeric.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (m) {
    const [, a, b, yearRaw] = m;
    const year = normalizeTwoDigitYear(yearRaw);
    const aNum = parseInt(a, 10);
    const bNum = parseInt(b, 10);

    // Disambiguate day/month order when the values allow it — whichever
    // number exceeds 12 must be the day (no 13th+ month exists). Defaults to
    // DD/MM/YYYY, the Philippine convention, when both values are <=12 and
    // genuinely ambiguous either way.
    let day = a;
    let month = b;
    if (bNum > 12 && aNum <= 12) {
      day = b;
      month = a;
    }

    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  return '';
}

// ICAO 9303 check-digit weights, cycled 7-3-1-7-3-1... across each string.
const MRZ_CHECK_WEIGHTS = [7, 3, 1];

function mrzCharValue(ch) {
  if (ch === '<') return 0;
  if (ch >= '0' && ch <= '9') return ch.charCodeAt(0) - 48;
  if (ch >= 'A' && ch <= 'Z') return ch.charCodeAt(0) - 55; // A=10 ... Z=35
  return 0;
}

function mrzCheckDigit(str) {
  let sum = 0;
  for (let i = 0; i < str.length; i++) {
    sum += mrzCharValue(str[i]) * MRZ_CHECK_WEIGHTS[i % 3];
  }
  return sum % 10;
}

// MRZ dates are 2-digit years (YYMMDD). A birth date can never be in the
// future, so roll back a century if the naive interpretation would be;
// an expiry date legitimately can be in the future (and every e-passport
// with an MRZ was issued in the 2000s+ anyway), so it's never rolled back.
function mrzYearToFullYear(twoDigitYear, canBeFuture) {
  const now = new Date();
  const century = Math.floor(now.getFullYear() / 100) * 100;
  let fullYear = century + twoDigitYear;
  if (!canBeFuture && fullYear > now.getFullYear()) {
    fullYear -= 100;
  }
  return fullYear;
}

/**
 * Deterministically parses a passport's Machine Readable Zone (two 44-
 * character ICAO TD3 lines) when present — post-Aug-2016 Philippine
 * e-passports carry one; older green passports don't. Tried before any
 * label matching for passports, since a fixed-format MRZ is far more
 * reliable than reading the visual page. Returns null (falling through to
 * ordinary VIZ label extraction) when no valid-shaped MRZ is found.
 *
 * Line 1 detection is deliberately permissive (`P` or `PP`, optional `<`
 * filler, then `PHL`) rather than strict about the exact document-code
 * width — sources disagree on whether the 2026+ code is "P<PHL" or
 * "PP<PHL", and being too strict here would silently lose MRZ parsing for
 * a real passport over an unconfirmed formatting detail.
 *
 * A failed ICAO check digit (7-3-1 weighted mod-10) lowers that field's
 * confidence rather than discarding it — a photographed MRZ line is
 * exactly the kind of input where OCR misreads one character, and the
 * checksum only tells you a field is suspect, not that it's unusable.
 */
export function tryParsePassportMrz(lines) {
  let line1Index = -1;
  let line1 = '';

  for (let i = 0; i < lines.length; i++) {
    const compact = lines[i].text.replace(/\s+/g, '').toUpperCase();
    if (compact.length >= 40 && /^PP?<?PHL/.test(compact)) {
      line1Index = i;
      line1 = compact;
      break;
    }
  }

  if (line1Index === -1 || !lines[line1Index + 1]) {
    return null;
  }

  const line2 = lines[line1Index + 1].text.replace(/\s+/g, '').toUpperCase();
  if (line2.length < 28) {
    return null; // too short to be a real TD3 line 2 — line 1 match was likely a false positive
  }

  const phlIndex = line1.indexOf('PHL');
  if (phlIndex === -1) {
    return null;
  }

  const nameSection = line1.slice(phlIndex + 3);
  const [surnameRaw, ...givenPartsRaw] = nameSection.split('<<');
  const surName = surnameRaw.replace(/</g, ' ').replace(/\s+/g, ' ').trim();
  const givenNames = givenPartsRaw.join(' ').replace(/</g, ' ').replace(/\s+/g, ' ').trim();
  const [firstName, ...middleTokens] = givenNames.split(' ').filter(Boolean);
  const middleName = middleTokens.join(' ');

  const passportNumberRaw = line2.slice(0, 9);
  const passportNumberCheck = line2[9];
  const dobRaw = line2.slice(13, 19);
  const dobCheck = line2[19];
  const sexChar = line2[20];
  const expiryRaw = line2.slice(21, 27);
  const expiryCheck = line2[27];

  const passportNumber = passportNumberRaw.replace(/</g, '').trim();

  if (!surName && !firstName && !passportNumber) {
    return null; // matched a P..PHL-shaped line 1 but extracted nothing usable — likely a false positive
  }

  const mrzWarnings = [];
  let confidence = 92; // MRZ is fixed-format and highly reliable when it parses at all

  if (passportNumberRaw && mrzCheckDigit(passportNumberRaw) !== Number(passportNumberCheck)) {
    mrzWarnings.push('Passport number checksum did not match — please verify manually.');
    confidence -= 15;
  }

  let birthDate = '';
  if (/^\d{6}$/.test(dobRaw)) {
    const yy = Number(dobRaw.slice(0, 2));
    birthDate = `${mrzYearToFullYear(yy, false)}-${dobRaw.slice(2, 4)}-${dobRaw.slice(4, 6)}`;
    if (mrzCheckDigit(dobRaw) !== Number(dobCheck)) {
      mrzWarnings.push('Date of birth checksum did not match — please verify manually.');
      confidence -= 15;
    }
  }

  let expiry = '';
  if (/^\d{6}$/.test(expiryRaw)) {
    const yy = Number(expiryRaw.slice(0, 2));
    expiry = `${mrzYearToFullYear(yy, true)}-${expiryRaw.slice(2, 4)}-${expiryRaw.slice(4, 6)}`;
    if (mrzCheckDigit(expiryRaw) !== Number(expiryCheck)) {
      mrzWarnings.push('Passport expiry checksum did not match — please verify manually.');
      confidence -= 10;
    }
  }

  const sex = sexChar === 'M' || sexChar === 'F' ? sexChar : '';

  return {
    surName,
    firstName,
    middleName,
    idNumber: passportNumber,
    birthDate,
    sex,
    expiry,
    confidence: Math.max(40, confidence),
    mrzWarnings,
  };
}

/**
 * Orchestrator: takes the flat OCR line array (from tesseractOcr.js, or any
 * other engine that produces the same shape) plus the citizen's selected ID
 * type slug, and returns { fields, confidence, warnings, raw_text } — the
 * exact shape Register.jsx's processBackendOcrResult() already expects.
 */
export function extractIdFields(lines, idType) {
  const profile = getIdProfile(idType);
  const rawLines = lines || [];

  // MRZ detection runs on the RAW lines, before noise-stripping — the
  // universal noise filter below intentionally drops long runs of "<"
  // characters (MRZ filler embedded incidentally elsewhere), which would
  // otherwise strip out the MRZ lines themselves before this ever sees them.
  let mrz = null;
  if (idType === 'passport') {
    mrz = tryParsePassportMrz(rawLines);
  }

  const cleanLines = stripRepeatedWatermarkNoise(stripKnownNoise(rawLines, idType));

  const extracted = {
    fields: {},
    confidence: 0,
    warnings: [],
    raw_text: cleanLines.map((l) => l.text).join('\n'),
  };

  // A successful MRZ parse can leave nothing else behind in cleanLines (the
  // MRZ lines themselves are mostly "<" padding, which the noise filter
  // above correctly strips) — only bail out here when there's truly no
  // usable content from either source.
  if (cleanLines.length === 0 && !mrz) {
    extracted.warnings.push('No readable text was found on the ID.');
    return extracted;
  }

  if (mrz) {
    if (mrz.surName) extracted.fields.surName = { value: mrz.surName, confidence: mrz.confidence };
    if (mrz.firstName) extracted.fields.firstName = { value: mrz.firstName, confidence: mrz.confidence };
    if (mrz.middleName) extracted.fields.middleName = { value: mrz.middleName, confidence: mrz.confidence };
    if (mrz.birthDate) extracted.fields.birthDate = { value: mrz.birthDate, confidence: mrz.confidence };
    if (mrz.sex) extracted.fields.sex = { value: mrz.sex, confidence: mrz.confidence };
    if (mrz.idNumber) extracted.fields.idNumber = { value: mrz.idNumber, confidence: mrz.confidence };
    extracted.warnings.push(...mrz.mrzWarnings);
  }

  const allLabelPatterns = Object.values(profile.labels);

  for (const [fieldName, pattern] of Object.entries(profile.labels)) {
    if (extracted.fields[fieldName]) continue; // already populated via MRZ
    const found = extractLabeledField(cleanLines, pattern, allLabelPatterns);
    if (found) {
      let value = found.value;
      let confidence = found.confidence;

      // A spelled-out date sometimes wraps across two OCR lines — confirmed
      // against a real PhilID scan where Vision returned "AUGUST 10" and
      // "2004" as separate lines instead of one "AUGUST 10, 2004" line, so
      // the captured value had a day/month but no year and silently failed
      // to parse. If the found value doesn't parse as a date, retry once
      // with the next line appended before giving up.
      if (fieldName === 'birthDate' && !formatDate(value)) {
        const next = cleanLines[found.lineIndex + 1];
        if (next && !allLabelPatterns.some((p) => p.test(next.text))) {
          const combined = `${value} ${next.text}`;
          if (formatDate(combined)) {
            value = combined;
            confidence = Math.min(confidence, next.confidence);
          }
        }
      }

      extracted.fields[fieldName] = {
        value: cleanFieldValue(value, fieldName),
        confidence,
      };
    } else {
      extracted.warnings.push(`Could not locate field: ${fieldName}`);
    }
  }

  // Combined-name fallback: only reached when separate-label extraction
  // above found none of surName/firstName/middleName, for an ID type that
  // either always prints one combined name line, or might.
  const hasSeparateName = extracted.fields.surName || extracted.fields.firstName || extracted.fields.middleName;
  if (!hasSeparateName && profile.nameMode !== 'separate' && profile.nameLabel) {
    const nameFound = extractLabeledField(cleanLines, profile.nameLabel, [profile.nameLabel, ...allLabelPatterns]);
    if (nameFound) {
      const parsed = parseCombinedName(nameFound.value);
      if (parsed.mode === 'split') {
        extracted.fields.surName = { value: cleanFieldValue(parsed.surName, 'surName'), confidence: nameFound.confidence };
        extracted.fields.firstName = { value: cleanFieldValue(parsed.firstName, 'firstName'), confidence: nameFound.confidence };
        if (parsed.middleName) {
          extracted.fields.middleName = { value: cleanFieldValue(parsed.middleName, 'middleName'), confidence: nameFound.confidence };
        }
      } else if (parsed.fullName) {
        extracted.fields.fullNameUnparsed = { value: parsed.fullName, confidence: nameFound.confidence };
        extracted.warnings.push('Name could not be split into first/middle/last — please review and enter manually.');
      }
    } else {
      extracted.warnings.push('Could not locate field: name');
    }
  }

  if ((!extracted.fields.sex || !extracted.fields.sex.value) && profile.fieldsPresent.gender) {
    const sexFallback = findStandaloneSexToken(cleanLines);
    if (sexFallback) {
      extracted.fields.sex = {
        value: cleanFieldValue(sexFallback.value, 'sex'),
        confidence: sexFallback.confidence,
      };
      extracted.warnings = extracted.warnings.filter((w) => w !== 'Could not locate field: sex');
    }
  }

  if (profile.fieldsPresent.height) {
    const heightFound = findStandaloneHeightInCm(cleanLines);
    if (heightFound) {
      extracted.fields.height = { value: String(heightFound.value), confidence: heightFound.confidence };
    } else {
      extracted.warnings.push('Could not locate field: height');
    }
  }

  if (!extracted.fields.idNumber) {
    const idNumber = extractIdNumber(cleanLines, profile.idNumberPattern);
    if (idNumber) {
      extracted.fields.idNumber = { value: idNumber.value, confidence: idNumber.confidence };
    } else {
      extracted.warnings.push('Could not locate field: idNumber');
    }
  }

  const confidences = Object.values(extracted.fields)
    .filter((f) => typeof f.confidence === 'number')
    .map((f) => f.confidence);
  extracted.confidence = confidences.length
    ? Math.round((confidences.reduce((a, b) => a + b, 0) / confidences.length) * 10) / 10
    : 0;

  return extracted;
}
