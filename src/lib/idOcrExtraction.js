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
  // Passport: "Lugar ng kapanganakan/Place of birth" (confirmed on a real
  // 2022 e-passport). "LUGAR NG" alone also counts, since the small italic
  // caption is often read with the long word broken up.
  placeOfBirth: /\b(?:LUGAR\s*NG(?:\s*KAPANGANAKAN)?(?:\s*\/\s*PLACE\s*OF\s*BIRTH)?|PLACE\s*OF\s*BIRTH)\b\s*[:-]?/i,
  // Confirmed present on a real driver's license ("Blood Type" -> "O+").
  bloodType: /\bBLOOD\s*TYPE\b\s*[:-]?/i,
  // Confirmed present on a real Voter's Certification ("Civil Status: Single").
  civilStatus: /\b(?:CIVIL\s*STATUS|KATAYUANG\s*SIBIL)\b\s*[:-]?/i,
};

// A real Philippine passport's data page labels the mother's-maiden-name
// field ("Panggitnang Apelyido / Mother's Maiden Name") as the middle-name
// equivalent — confirmed against a real passport data page — distinct
// enough from the base middleName pattern to warrant its own entry.
// On the passport data page every caption sits on its own line with the
// value on the line BELOW, and OCR garbles the caption's English half
// unpredictably — confirmed on real scans: "Punggitnang apelyido / M'delle
// na me", "Panggitnang apelyido Moble some". So this label consumes the
// WHOLE rest of the caption line ([^\n]*): whatever the English half became
// is never mistaken for the middle name, and the value is always taken from
// the next line. (Passport-only, so no other ID type is affected.)
const PASSPORT_MIDDLE_NAME_LABEL = /(?:\bP[A-Z]{0,3}GITNANG\s*APELYIDO|\bGITNANG\s*APELYIDO|\bMIDDLE\s*NAME|\bMOTHER'?S\s*MAIDEN\s*NAME)\b[^\n]*/i;

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
    // Place of birth is on the data page too (not in the MRZ), and fills
    // the form's birth city / province (splitPlaceOfBirth). A passport has
    // no home address.
    labels: { ...pickLabels(['surName', 'firstName', 'sex', 'birthDate', 'placeOfBirth']), middleName: PASSPORT_MIDDLE_NAME_LABEL },
    fieldsPresent: { name: true, birth_date: true, gender: true, address: false, idNumber: true, bloodType: false, civilStatus: false, height: false, placeOfBirth: true },
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
    // Newer cards print periods instead of commas ("Last Name. First Name.
    // Middle Name", confirmed on a real 2025 license).
    nameLabel: /\bLAST\s*NAME\s*[.,]?\s*FIRST\s*NAME\s*[.,]?\s*MIDDLE\s*NAME\b\.?/i,
    labels: pickLabels(['sex', 'birthDate', 'address', 'bloodType']),
    fieldsPresent: { name: true, birth_date: true, gender: true, address: true, idNumber: true, bloodType: true, civilStatus: false, height: true },
    // "N03-12-123456" — confirmed against a real license sample.
    idNumberPattern: /\b[A-Z]\d{2}-\d{2}-\d{6}\b/,
    // idNumber has no labels entry (it's matched by value shape, not a
    // caption) — but its real caption ("License No.") confirmed sitting
    // right after Address on a real scan, so the multi-line address
    // collector needs this as an explicit stop-marker or it happily
    // swallows the next field's caption line as if it were more address.
    idNumberLabel: /\bLICENSE\s*NO\b\.?|\bEXPIRATION\s*DATE\b|\bAGENCY\s*CODE\b/i,
    // "Nationality  Sex  Date of Birth  Weight (kg)  Height(m)" is one row of
    // captions over one row of values ("PHL  F  1981/08/01  60  1.52"), read
    // by readLtoValueRow before the label search.
    ltoValueRow: true,
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
    // against a real UMID sample. Or an SS number, 2-7-1 ("04-0751449-0"),
    // on the older SSS ID people still choose this option for.
    idNumberPattern: /\b\d{4}-\d{7}-\d\b|\b\d{2}-\d{7}-\d\b/,
    // See drivers_license's idNumberLabel comment — same reasoning.
    idNumberLabel: /\bCRN\b/i,
    // The older SSS ID has no captions at all (extractSssByPosition).
    unlabeledLayout: 'sss',
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
    // See drivers_license's idNumberLabel comment — same reasoning. VIN's
    // exact caption is unconfirmed (weakest-evidenced ID type in research),
    // so this is a best-effort guess, not a confirmed real caption.
    idNumberLabel: /\bVIN\b/i,
    noiseList: [/\bCHAIRMAN\b/i],
  },
  postal: {
    // Confirmed against a real PHLPost sample: one combined line under the
    // literal caption "First Name, Middle Name, Surname, Suffix" (e.g.
    // "JUANA REYES DELA CRUZ") — space-separated, no comma. The caption
    // gives the order, so the name is split from the end using surname
    // particles (see nameOrder / splitFirstMiddleSurname); the form keeps
    // every part editable in case of a two-word given name with no middle.
    nameMode: 'combined',
    // Must consume the real caption's full "...Surname, Suffix" tail too —
    // stopping at "Surname" left ", Suffix" as an unmatched, plausible-
    // looking remainder that got misread as if it were the actual value.
    // Commas or periods between the parts (the caption is tiny and Vision
    // reads its punctuation either way).
    nameLabel: /\bFIRST\s*NAME\s*[.,]?\s*MIDDLE\s*NAME\s*[.,]?\s*SURNAME\s*[.,]?\s*SUFFIX\b\.?/i,
    // That caption is so small Vision often misses it, or lists it after
    // the name: then the name is the name-shaped line just above "Address".
    nameAboveLabel: 'address',
    // On a real scan Vision read none of the tiny captions ("Address" and
    // "Date of Birth" missing, others garbled), so the card is also read by
    // position (extractPostalByPosition) for whatever the labels missed.
    unlabeledLayout: 'postal',
    // The caption fixes the order, so the comma-less name is split by it
    // (splitFirstMiddleSurname) instead of being left for manual splitting.
    nameOrder: 'first-middle-surname',
    labels: pickLabels(['birthDate', 'address']),
    fieldsPresent: { name: true, birth_date: true, gender: false, address: true, idNumber: true, bloodType: false, civilStatus: false, height: false },
    // Postal Reference Number: 12-character alphanumeric — confirmed
    // against a real sample ("100141234567").
    idNumberPattern: /\b[A-Z0-9]{12}\b/,
    // See drivers_license's idNumberLabel comment — same reasoning.
    idNumberLabel: /\bPRN\b/i,
    // Header and footer text, confirmed on a current PHLPost card.
    noiseList: [
      /^\s*PHL\s*POST/i, /PHILIPPINE\s+POSTAL\s+CORPORATION/i, /POSTAL\s+IDENTITY\s+CARD/i,
      // Any line starting with REPUBLIC: Vision has returned it cut short
      // ("REPUBLIC OF THE", without PHILIPPINES).
      /^\s*REPUBLIC\b/i, /^\s*PREMIUM\s*$/i, /HOLDER'?S\s+SIGNATURE/i,
      /^\s*POSTAL\s*$/i, /^\s*I\.?D\.?\s*$/i,
    ],
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
    //
    // The current design prints its fields with NO labels, in a fixed order
    // under the PhilHealth number (confirmed on a real card):
    //   08-256315383-7
    //   SANTOS, CHRISTIAN MARK DELA CRUZ
    //   OCTOBER 09, 2004 - MALE
    //   BLK 3 LOT 9 PH4 SAPPHIRE ST CITIHOMES SUBD,
    //   MOLINO IV, CITY OF BACOOR, CAVITE
    //   Signature
    // so it's read by position (extractPhilhealthByPosition) when the label
    // search finds nothing — including the address, which this design has.
    nameMode: 'combined',
    nameLabel: /\bNAME\b\s*[:-]?/i,
    labels: pickLabels(['sex', 'birthDate']),
    unlabeledLayout: 'philhealth',
    fieldsPresent: { name: true, birth_date: true, gender: true, address: true, idNumber: true, bloodType: false, civilStatus: false, height: false },
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
  senior: {
    // City of Imus OSCA (Office of the Senior Citizens Affairs) card,
    // confirmed against a real sample. Every field is labelled on the same
    // line: "Name:" (one combined line, first-middle-surname, no comma, e.g.
    // "JUAN DELA CRUZ SANTOS" -> surname SANTOS, middle DELA CRUZ),
    // "Address:" (two lines, ending in "PASONG BUAYA 2, CITY OF IMUS,
    // CAVITE"), "Date of Birth:" ("NOVEMBER 30, 1964"), "Age:", "Gender:"
    // ("FEMALE"), "ID Number:" ("2024-37299") and "Date Issued:".
    nameMode: 'combined',
    nameLabel: /\bNAME\b\s*[:-]?/i,
    nameOrder: 'first-middle-surname',
    labels: pickLabels(['sex', 'birthDate', 'address']),
    fieldsPresent: { name: true, birth_date: true, gender: true, address: true, idNumber: true, bloodType: false, civilStatus: false, height: false },
    // Year of issue + serial, e.g. "2024-37299".
    idNumberPattern: /\b(?:19|20)\d{2}-\d{3,7}\b/,
    idNumberLabel: /\bID\s*(?:NUMBER|NO)\b\.?/i,
    noiseList: [
      /OFFICE\s+OF\s+THE\s+SENIOR\s+CITIZENS?\s*'?\s*AFFAIRS/i,
      /^\s*OSCA\s*$/i,
      /REPUBLIC\s+OF\s+THE\s+PHILIPPINES/i,
      /^\s*PROVINCE\s+OF\s+CAVITE\s*$/i,
      /^\s*CITY\s+OF\s+IMUS\s*$/i,
      /\bSIGNATURE\b|\bTHUMBMARK\b/i,
      /\bDATE\s+ISSUED\b/i,
      /^\s*AGE\s*[:-]?\s*\d{0,3}\s*$/i,
    ],
  },
  barangay_pb2: {
    // The Barangay Pasong Buaya II ID that this system prints
    // (PrintBarangayIDCard in src/Admin/PrintTemplates.jsx). Each caption
    // sits on its own line above its value: "Name" (first middle last
    // [suffix], one line), "Address", "Birth Date" ("NOVEMBER 30, 1964"),
    // "Gender" ("FEMALE"), "TIN No.", then a footer "ID NO: 000123" and
    // "ISSUED: 11/9/2026". The header names the barangay, so the server's
    // address check (pb2_text_has_pb2_address) always finds Pasong Buaya II.
    nameMode: 'combined',
    nameLabel: /^\s*NAME\b\s*[:-]?/i,
    nameOrder: 'first-middle-surname',
    labels: pickLabels(['sex', 'birthDate', 'address']),
    // "Birth Date" and "Gender" are printed side by side (see extractIdFields).
    birthDateMayFollow: true,
    fieldsPresent: { name: true, birth_date: true, gender: true, address: true, idNumber: true, bloodType: false, civilStatus: false, height: false },
    // The request number padded to 6 digits.
    idNumberPattern: /\b\d{6}\b/,
    idNumberLabel: /\bID\s*NO\b\.?|\bTIN\s*NO\b\.?/i,
    noiseList: [
      /REPUBLIC\s+OF\s+THE\s+PHILIPPINES/i,
      /^\s*CITY\s+OF\s+IMUS,?\s*CAVITE\s*$/i,
      /^\s*BARANGAY\s+PASONG\s+BUAYA\s+(?:II|2)\s*$/i,
      /^\s*SIGNATURE\s*$/i,
      /^\s*ISSUED\s*:/i,
    ],
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

/**
 * The scanner profile key for an ID type as the forms name it ("Drivers
 * License" -> "drivers_license"). Shared by registration's scanner and
 * Edit Profile's ID change.
 */
export function idTypeSlug(idType) {
  const selected = String(idType || '').toLowerCase();
  if (selected.includes('senior')) return 'senior';
  if (selected.includes('barangay')) return 'barangay_pb2';
  if (selected.includes('national')) return 'national';
  if (selected.includes('passport')) return 'passport';
  if (selected.includes('driver')) return 'drivers_license';
  if (selected.includes('umid')) return 'umid';
  if (selected.includes('voter')) return 'voters';
  if (selected.includes('postal')) return 'postal';
  if (selected.includes('prc')) return 'prc';
  if (selected.includes('philhealth')) return 'philhealth';
  if (selected.includes('tin')) return 'tin';
  return 'generic';
}

/** The IDs a resident can register with (18 or older only). */
export const VALID_ID_TYPES = [
  ['National ID (PhilID/ePhilID)', 'National ID (PhilID)'], ['Passport', 'Passport'], ['Drivers License', "Driver's License"],
  ['UMID (SSS/GSIS)', 'UMID (SSS/GSIS)'], ['Voters ID', "Voter's ID"], ['Postal ID', 'Postal ID'], ['PRC ID', 'PRC ID'],
  ['PhilHealth ID', 'PhilHealth ID'], ['TIN ID', 'TIN ID'], ['Senior Citizen ID (OSCA)', 'Senior Citizen ID (OSCA)'],
  ['Barangay ID (Pasong Buaya II)', 'Barangay ID (Pasong Buaya II)'],
];
/** A passport has only its photo page: no back photo (migration 044). */
export const idHasBack = (idType) => idType !== 'Passport';

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

// A Philippine ID's printed address commonly wraps across several physical
// lines (confirmed against every real address sample studied this session
// — e.g. a UMID's address alone spans 4 lines: street, subdivision,
// city/province, postal). extractLabeledField's lookahead only ever
// returns the FIRST plausible line, which silently truncates a real
// multi-line address to just its opening fragment.
const ADDRESS_MAX_LINES = 4;

// A whole line that is only a date ("10-AUG-2004", "JANUARY 01, 1995").
// Never part of an address — confirmed on a real TIN ID where Vision listed
// the birth date just before its own "Birth Date:" label, right after the
// address, and it was swallowed into the address.
function isDateOnlyLine(text) {
  const t = String(text || '').trim();
  return t.split(/\s+/).length <= 3 && /\d/.test(t) && !!formatDate(t);
}

// A single spaceless token mixing letters and digits, 8+ long — a printed
// control/serial number (e.g. the TIN ID's sideways "TCD201900335763" on the
// card edge), which Vision can slot in between address lines. Real address
// lines always contain spaces.
function isStandaloneCode(text) {
  const t = String(text || '').trim();
  return /^(?=.*\d)(?=.*[A-Z])[A-Z0-9-]{8,}$/.test(t);
}

// One word of letters only (no digits, spaces or commas) — see its use in
// extractMultiLineAddress.
function isLoneWord(text) {
  return /^[A-Za-zÑñ]+$/.test(String(text || '').trim());
}

/**
 * Like extractLabeledField, but greedily collects consecutive plausible
 * lines after the label (starting with the inline remainder, if any) up to
 * ADDRESS_MAX_LINES, instead of stopping at the first one — joining them
 * into one address string. Stops early at a line matching a different
 * field's own label, or the first implausible line once collection has
 * actually started.
 */
function extractMultiLineAddress(lines, labelPattern, allLabelPatterns) {
  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const match = labelPattern.exec(line.text);
    if (!match) continue;

    const remainder = line.text
      .slice(match.index + match[0].length)
      .replace(/^[\s:/\-▶»›>]+/, '')
      .replace(/[\s:/-]+$/, '');

    const parts = [];
    const confidences = [];

    if (isPlausibleValue(remainder) && !labelPattern.test(remainder)) {
      parts.push(remainder);
      confidences.push(line.confidence);
    }

    // Tolerates up to 2 implausible lines (e.g. a watermark fragment like
    // "MIDTemp" sitting between the label and the real address, the same
    // gap extractLabeledField's own 2-line lookahead already tolerates)
    // before giving up — but only while nothing plausible has been found
    // yet. Once real content starts, the first implausible line correctly
    // marks the end of the address, not another gap to skip over.
    let skippedJunk = 0;
    for (let lookahead = 1; parts.length < ADDRESS_MAX_LINES; lookahead++) {
      const next = lines[idx + lookahead];
      if (!next) break;
      if (allLabelPatterns.some((pattern) => pattern.test(next.text))) break;
      if (isDateOnlyLine(next.text)) break; // a date ends the address (see isDateOnlyLine)
      if (isStandaloneCode(next.text)) continue; // a stray card serial — skip it, keep collecting
      // A lone word with no digits, read off a card's security print
      // (confirmed on a real PhilSys scan: "YATIETIES", "SAUTH", "TONE"
      // wedged between the real address lines): skipped before the address
      // starts, or when more address follows it. A lone word that really
      // ends the address ("CAVITE") is still kept.
      if (isLoneWord(next.text)) {
        const after = lines[idx + lookahead + 1];
        const moreAddressFollows = after && !allLabelPatterns.some((p) => p.test(after.text))
          && !isDateOnlyLine(after.text) && isPlausibleValue(after.text);
        if (parts.length === 0 || moreAddressFollows) continue;
      }
      if (!isPlausibleValue(next.text)) {
        if (parts.length > 0) break;
        if (++skippedJunk > 2) break;
        continue;
      }
      parts.push(next.text.trim());
      confidences.push(next.confidence);
    }

    if (parts.length === 0) continue;

    return {
      value: parts.join(', '),
      confidence: confidences.reduce((a, b) => a + b, 0) / confidences.length,
    };
  }

  return null;
}

/**
 * Splits a merged address string into house number / block-and-lot / the
 * remaining street text — but only where there's a clear, unambiguous
 * structural marker, never a guess. Confirmed against real samples:
 *
 * - "BLK 26 LOT 20 CANTERBURY ST, ..." (TIN) -> blockLot "BLK 26 LOT 20".
 * - "27 KALIRAYA ST VICTORY AVENUE TATALON" (LTO) -> houseNo "27".
 * - "JOSE ABAD SANTOS AVE. 3 PAREDES COMP., ..." (a real PhilID address)
 *   opens with a street NAME, not a number — deliberately left entirely
 *   unparsed into `street`, same as this file's other "don't guess an
 *   ambiguous split" cases (combined names with no comma, passport place
 *   of birth) — there's no reliable marker here to separate a house/unit
 *   number from the rest.
 *
 * Subdivision/area/zone are never extracted this way — no sample studied
 * has a reliable structural marker for them (unlike BLK/LOT's clear "BLK N
 * LOT N" shape), so guessing would too often misplace real text.
 */
export function parseAddressComponents(fullAddress) {
  let remaining = (fullAddress || '').trim();
  let blockLot = '';
  let houseNo = '';

  const blockLotMatch = remaining.match(/\bBLK\.?\s*(\d+[A-Z]?)\s*,?\s*LOT\.?\s*(\d+[A-Z]?)\b/i);
  if (blockLotMatch) {
    blockLot = `BLK ${blockLotMatch[1]} LOT ${blockLotMatch[2]}`;
    remaining = (remaining.slice(0, blockLotMatch.index) + remaining.slice(blockLotMatch.index + blockLotMatch[0].length)).trim();
  } else {
    // A leading bare number, only when the address doesn't already use the
    // BLK/LOT convention above.
    const houseNoMatch = remaining.match(/^(\d+[A-Z]?)\s+/);
    if (houseNoMatch) {
      houseNo = houseNoMatch[1];
      remaining = remaining.slice(houseNoMatch[0].length).trim();
    }
  }

  remaining = remaining.replace(/^[,\s]+/, '').replace(/[,\s]+$/, '');

  return { houseNo, blockLot, street: remaining };
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

  const { firstName, middleName } = splitGivenAndMiddle(remainderTokens);
  return { mode: 'split', surName, firstName, middleName };
}

/**
 * Reads the current PhilHealth ID design, which prints no field labels, by
 * position below the PhilHealth number (see the philhealth profile):
 *   name line ("SURNAME, GIVEN MIDDLE" — the one with a comma),
 *   "MONTH DD, YYYY - MALE|FEMALE",
 *   then 1-3 address lines, ending at "Signature".
 * Returns only the fields it could read, in extractIdFields' field shape.
 */
/**
 * Reads a PHLPost Postal ID by position when its tiny captions aren't read.
 * Confirmed against a real Vision result for the PHLPost sample card:
 *   JUANA REYES DELA CRUZ          <- the first name-shaped line
 *   ? ???? ????? ??                <- an unreadable caption (skipped)
 *   S85 GEN. TUAZON BLVD.          <- address lines, up to the first date
 *   BRGY RIVERA
 *   3742 PASAY CITY
 *   14 Aug 88                      <- date of birth: the earliest date
 *   Motorsty / PHL / ... / 01 Dec 25  (valid-until is always later)
 */
function extractPostalByPosition(cleanLines) {
  const out = {};
  const lines = cleanLines.map((l) => ({ ...l, t: String(l.text || '').trim() }));
  // Mostly letters and digits: "? ???? ????? ??" is an unreadable caption.
  const readable = (t) => (t.match(/[A-Z0-9]/gi) || []).length >= t.replace(/\s/g, '').length * 0.7;
  const nameRe = /^[A-ZÑ][A-ZÑ.'-]*(?:\s+[A-ZÑ][A-ZÑ.'-]*){1,5}$/;
  // Never a line with the card's own words, and the candidate nearest the
  // address wins: the last name-shaped line before the first line that
  // starts with a house number ("585 GEN. ..." or "S85 ..."), so a header
  // fragment above the name (once "REPUBLIC OF THE") can't be taken.
  const CARD_WORDS = /\b(?:REPUBLIC|PHILIPPINES?|PILIPINAS|POSTAL|IDENTITY|CARD|CORPORATION|PHLPOST|PREMIUM|SIGNATURE|HOLDER'?S?)\b/i;
  const isName = (l) => nameRe.test(l.t) && l.t === l.t.toUpperCase() && !CARD_WORDS.test(l.t);
  const firstHouseIdx = lines.findIndex((l) => /^(?:\d|[SOIl]\d{2,})/.test(l.t));
  let nameIdx = -1;
  lines.forEach((l, i) => { if (isName(l) && (firstHouseIdx < 0 ? nameIdx < 0 : i < firstHouseIdx)) nameIdx = i; });
  if (nameIdx >= 0) {
    const split = splitFirstMiddleSurname(lines[nameIdx].t);
    const conf = lines[nameIdx].confidence;
    if (split.surName) out.surName = { value: cleanFieldValue(split.surName, 'surName'), confidence: conf };
    if (split.firstName) out.firstName = { value: cleanFieldValue(split.firstName, 'firstName'), confidence: conf };
    if (split.middleName) out.middleName = { value: cleanFieldValue(split.middleName, 'middleName'), confidence: conf };
    if (split.suffix) out.suffix = { value: split.suffix, confidence: conf };
  }

  const dates = lines
    .map((l, i) => ({ i, l, d: isDateOnlyLine(l.t) ? formatDate(l.t) : '' }))
    .filter((x) => x.d);
  if (dates.length) {
    const earliest = [...dates].sort((a, b) => a.d.localeCompare(b.d))[0];
    out.birthDate = { value: earliest.d, confidence: earliest.l.confidence };
  }

  if (nameIdx >= 0) {
    const end = dates.find((x) => x.i > nameIdx)?.i ?? Math.min(lines.length, nameIdx + 5);
    const parts = lines.slice(nameIdx + 1, end)
      .filter((l) => readable(l.t) && /[A-Z]{2,}/i.test(l.t))
      .slice(0, 4)
      // A house number's first digit read as a letter: "S85" -> "585".
      .map((l) => l.t.replace(/^([SOIl])(\d{2,})\b/, (m, a, b) => ({ S: '5', O: '0', I: '1', l: '1' }[a] + b)));
    if (parts.length) {
      out.address = { value: cleanFieldValue(parts.join(', '), 'address'), confidence: lines[nameIdx + 1]?.confidence ?? 0 };
    }
  }
  return out;
}

/**
 * The older SSS ID (chosen under "UMID (SSS/GSIS)"), which prints no captions.
 * Confirmed against two real Vision results:
 *   Republic of the Philippines / Social Security System
 *   PAMELA L OCAMPO               <- the name: the line just above the number
 *   04-0751449-0                  <- SS number, 2-7-1 digits
 *   (MARCH 11, 1970)              <- a birth date, on some versions only
 *   CARLOS A. ARELLANO / SSS PRESIDENT  <- the official's name, never the holder
 * Only used when the card says "Social Security System"; a UMID card is read
 * by its labels as before.
 */

function extractSssByPosition(cleanLines) {
  const out = {};
  const lines = cleanLines.map((l) => ({ ...l, t: String(l.text || '').trim() }));
  if (!lines.some((l) => /SOCIAL\s+SECURITY\s+SYSTEM/i.test(l.t))) return out;
  const numIdx = lines.findIndex((l) => /\b\d{2}\s*-\s*\d{7}\s*-\s*\d\b/.test(l.t));
  if (numIdx < 0) return out;
  out.idNumber = { value: lines[numIdx].t.match(/\d{2}\s*-\s*\d{7}\s*-\s*\d/)[0].replace(/\s+/g, ''), confidence: lines[numIdx].confidence };

  const nameRe = /^[A-ZÑ][A-ZÑ.'-]*(?:\s+[A-ZÑ][A-ZÑ.'-]*){1,5}$/;
  for (let back = 1; back <= 2; back++) {
    const line = lines[numIdx - back];
    if (!line || /REPUBLIC|PHILIPPINES|SOCIAL\s+SECURITY/i.test(line.t)) break;
    if (nameRe.test(line.t) && line.t === line.t.toUpperCase()) {
      const split = splitFirstMiddleSurname(line.t);
      if (split.surName) out.surName = { value: cleanFieldValue(split.surName, 'surName'), confidence: line.confidence };
      if (split.firstName) out.firstName = { value: cleanFieldValue(split.firstName, 'firstName'), confidence: line.confidence };
      // The SSS ID often prints only the middle initial ("PAMELA L OCAMPO"):
      // that isn't the middle name, so it isn't filled in; the resident is
      // asked for the full one instead (MIDDLE_INITIAL note).
      const middle = cleanFieldValue(split.middleName || '', 'middleName');
      if (/^[A-ZÑ]\.?$/i.test(middle)) out.middleInitial = middle.replace('.', '');
      else if (middle) out.middleName = { value: middle, confidence: line.confidence };
      if (split.suffix) out.suffix = { value: split.suffix, confidence: line.confidence };
      break;
    }
  }

  const today = new Date();
  const dateLine = lines.find((l) => isDateOnlyLine(l.t) || /^[A-Z]+\s+\d{1,2},?\s+\d{4}$/i.test(l.t));
  const date = dateLine ? formatDate(dateLine.t) : '';
  if (date && new Date(date) < today) out.birthDate = { value: date, confidence: dateLine.confidence };

  out.notOnCard = ['sex', 'address', ...(out.birthDate ? [] : ['birthDate'])];
  return out;
}

function extractPhilhealthByPosition(cleanLines, profile) {
  const fields = {};
  const pinIdx = cleanLines.findIndex((l) => profile.idNumberPattern.test(l.text));
  if (pinIdx === -1) return fields;

  let idx = pinIdx + 1;
  const nameLine = cleanLines[idx];
  if (nameLine && nameLine.text.includes(',') && !/\d/.test(nameLine.text) && isPlausibleValue(nameLine.text)) {
    const parsed = parseCombinedName(nameLine.text);
    if (parsed.mode === 'split') {
      fields.surName = { value: cleanFieldValue(parsed.surName, 'surName'), confidence: nameLine.confidence };
      fields.firstName = { value: cleanFieldValue(parsed.firstName, 'firstName'), confidence: nameLine.confidence };
      if (parsed.middleName) fields.middleName = { value: cleanFieldValue(parsed.middleName, 'middleName'), confidence: nameLine.confidence };
      idx++;
    }
  }

  // "OCTOBER 09, 2004- MALE" (OCR may drop the space before the dash).
  const dateLine = cleanLines[idx];
  const dm = dateLine && /^(.*?\d{4})\s*[-–—]\s*(MALE|FEMALE)\b/i.exec(dateLine.text.trim());
  if (dm && formatDate(dm[1])) {
    fields.birthDate = { value: cleanFieldValue(dm[1], 'birthDate'), confidence: dateLine.confidence };
    fields.sex = { value: cleanFieldValue(dm[2], 'sex'), confidence: dateLine.confidence };
    idx++;
  }

  const addressParts = [];
  const confidences = [];
  for (; idx < cleanLines.length && addressParts.length < 3; idx++) {
    const line = cleanLines[idx];
    if (/\bSIGNATURE\b/i.test(line.text)) break;
    // No letters = not address: the spaced-out PhilHealth number printed
    // near the signature ("0 8 0 2 7 0 9 2 8890", confirmed on a real card).
    if (!/[A-Za-z]/.test(line.text)) break;
    if (!isPlausibleValue(line.text)) break;
    addressParts.push(line.text.trim().replace(/[\s,-]+$/, ''));
    confidences.push(line.confidence);
  }
  if (addressParts.length) {
    fields.address = {
      value: cleanFieldValue(addressParts.join(', '), 'address'),
      confidence: confidences.reduce((a, b) => a + b, 0) / confidences.length,
    };
  }
  return fields;
}

// Filipino surname particles — a middle name (the mother's maiden surname)
// can be compound: "DELA CRUZ", "DE LOS SANTOS", "SAN JOSE", "STA. MARIA".
const SURNAME_PARTICLES = new Set(['DE', 'DEL', 'DELA', 'DELOS', 'LA', 'LAS', 'LOS', 'SAN', 'STA', 'STO', 'SANTA', 'SANTO', 'VDA', 'Y']);

/**
 * Splits the words after "SURNAME," into given name(s) and middle name.
 * Filipino convention: one or two given names, then the middle name last —
 * so the middle name is the LAST word plus any surname particles right
 * before it, and everything earlier is the given name. Confirmed on real
 * cards: "CHRISTIAN MARK DELA CRUZ" (PhilHealth) -> "CHRISTIAN MARK" /
 * "DELA CRUZ"; "JAYZEL BALDIVIA" (TIN) -> "JAYZEL" / "BALDIVIA". (The old
 * rule — first word is the given name, the rest is the middle name — split
 * the first of these as "CHRISTIAN" / "MARK DELA CRUZ".) A single word is
 * just the given name.
 */
const NAME_SUFFIXES = { JR: 'Jr.', SR: 'Sr.', II: 'II', III: 'III', IV: 'IV' };

/**
 * Splits a comma-less name printed in "FIRST MIDDLE SURNAME [SUFFIX]" order
 * (the Postal ID's caption is literally "First Name, Middle Name, Surname,
 * Suffix"), working from the end: an optional suffix, then the surname =
 * last word plus any surname particles before it ("DELA CRUZ"), then the
 * middle name the same way, and whatever is left is the given name(s):
 *   "JUANA REYES DELA CRUZ"       -> JUANA / REYES / DELA CRUZ
 *   "MARIA CLARA REYES DELA CRUZ" -> MARIA CLARA / REYES / DELA CRUZ
 *   "JUAN SANTOS"                 -> JUAN / (none) / SANTOS
 * Everything stays editable on the form; this only pre-fills it.
 */
// Real two-letter surnames, kept when they end a name (see below).
const TWO_LETTER_SURNAMES = new Set(['GO', 'SY', 'UY', 'NG', 'LI', 'YU', 'LU', 'TY', 'CO', 'KO', 'LY', 'HO', 'OH']);

function splitFirstMiddleSurname(fullName) {
  const tokens = String(fullName).trim().split(/\s+/).filter(Boolean);
  // Background lettering behind the name can come back glued to it: a real
  // Postal ID scan read "JUANA REYES DELA CRUZ IN" ("…ILDING" printed
  // behind). A stray 1-2 letter word at the end is dropped, unless it is a
  // suffix (JR, II) or a real two-letter surname (GO, SY, UY, NG...).
  if (tokens.length >= 3) {
    const lastWord = tokens[tokens.length - 1].toUpperCase().replace(/\./g, '');
    if (lastWord.length <= 2 && !NAME_SUFFIXES[lastWord] && !TWO_LETTER_SURNAMES.has(lastWord)) tokens.pop();
  }
  let suffix = '';
  const lastKey = (tokens[tokens.length - 1] || '').toUpperCase().replace(/\./g, '');
  if (tokens.length > 2 && NAME_SUFFIXES[lastKey]) {
    suffix = NAME_SUFFIXES[lastKey];
    tokens.pop();
  }
  // Takes the last word plus the surname particles just before it, never
  // leaving fewer than `keep` words in front.
  const takeSurnameFromEnd = (keep) => {
    let start = tokens.length - 1;
    while (start > keep && SURNAME_PARTICLES.has(tokens[start - 1].toUpperCase().replace(/\./g, ''))) start--;
    return tokens.splice(start).join(' ');
  };
  if (tokens.length <= 1) return { firstName: tokens[0] || '', middleName: '', surName: '', suffix };
  const surName = takeSurnameFromEnd(1);
  const middleName = tokens.length >= 2 ? takeSurnameFromEnd(1) : '';
  return { firstName: tokens.join(' '), middleName, surName, suffix };
}

function splitGivenAndMiddle(tokens) {
  if (tokens.length <= 1) return { firstName: tokens[0] || '', middleName: '' };
  let start = tokens.length - 1;
  while (start > 1 && SURNAME_PARTICLES.has(tokens[start - 1].toUpperCase().replace(/\./g, ''))) start--;
  return { firstName: tokens.slice(0, start).join(' '), middleName: tokens.slice(start).join(' ') };
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
  // Case-insensitive, and includes the Filipino terms ("Babae"/"Lalaki") —
  // a real Voter's Certification sample prints sex in Title Case ("Female"),
  // not the ALL CAPS most other Philippine IDs use, so a case-sensitive
  // match would silently miss it.
  for (const line of lines) {
    const match = line.text.match(/\b(FEMALE|MALE|BABAE|LALAKI|LALAKE|F|M)\b/i);
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

  // Not applied to 'address': a trailing "CITY"/"PROVINCE"/"PHILIPPINES" is
  // now always legitimate real content there (e.g. "...QUEZON CITY",
  // confirmed against a real scan) now that multi-line addresses are
  // correctly merged in full — this strip previously existed to clean up
  // leftover-label overflow specific to name-shaped fields.
  if (fieldName !== 'address') {
    text = text.replace(/\s+(?:PHILIPPINES|CITY|PROVINCE)\s*$/i, '');
  }
  text = text.replace(/\s+/g, ' ').trim();
  // A printed line that already ends in a comma ("...VILLAGE,") gets joined
  // to the next with ", ", leaving ",,": keep one.
  if (fieldName === 'address') {
    text = text.replace(/,(\s*,)+/g, ',').replace(/,\s*$/, '');
    // A line that starts with "CITY" finishes the previous one ("IMUS" /
    // "CITY, CAVITE"), unless it is "CITY OF ...".
    text = text.replace(/,\s*CITY\b(?!\s+OF\b)/gi, ' CITY');
  }
  // The sex value from the same row ("F IMUS CAVITE") isn't part of the place.
  if (fieldName === 'placeOfBirth') return text.replace(/^(?:F|M)\s+(?=\S)/i, '').replace(/[|]/g, ' ').toUpperCase().trim();

  if (fieldName === 'sex') {
    // "Height(m)" on a driver's license once came back as Male.
    const upper = text.toUpperCase().replace(/\(\s*(?:M|KG|CM|FT|IN|LBS?)\s*\)/g, ' ');
    // Word-boundary matches, not substring checks — "FEMALE" and "MALE" are
    // both matched as whole words here, so there's no risk of "MALE"
    // matching inside "FEMALE" the way a plain .includes() check would.
    if (/\bFEMALE\b/.test(upper)) return 'F';
    // Filipino terms — "Kasarian" (Sex) labels on several ID types are
    // bilingual, and the value itself can print in Filipino too, not just
    // the English label.
    if (/\bBABAE\b/.test(upper)) return 'F';
    if (/\bMALE\b/.test(upper)) return 'M';
    if (/\bLALAKI\b/.test(upper) || /\bLALAKE\b/.test(upper)) return 'M';
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
  // After "SURNAME<<" the MRZ holds ALL the given names ("MA<BENEDICTINE"),
  // never the middle name — a Philippine passport prints the middle name
  // only on the data page ("Panggitnang apelyido / Middle name"), which the
  // label search reads. Confirmed on a real passport: the old split (first
  // word = given name, rest = middle) gave "MA" / "BENEDICTINE" instead of
  // "MA BENEDICTINE" / "CABANERO".
  const firstName = givenPartsRaw.join(' ').replace(/</g, ' ').replace(/\s+/g, ' ').trim();
  const middleName = '';

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
/**
 * Driver's license: sex and date of birth sit in a row of values under a row
 * of captions. Reads them from "PHL F 1981/08/01 60 1.52" when Vision keeps
 * the row together, or from a lone "F"/"M" line and the first slash date in
 * the past (the expiration date is in the future) when it splits them.
 */
/**
 * The name line just above a field's caption (Postal ID: above "Address"),
 * for when the card's own name caption can't be found. Only a line made of
 * letters (2 to 6 words, Ñ, dots, apostrophes, hyphens allowed) counts, and
 * never a caption, so a stray header can't become the name.
 */
function findNameAboveLabel(cleanLines, labelPattern, captionPatterns) {
  if (!labelPattern) return null;
  const idx = cleanLines.findIndex((l) => labelPattern.test(l.text));
  for (let back = 1; idx > 0 && back <= 3; back++) {
    const line = cleanLines[idx - back];
    if (!line) break;
    const text = line.text.trim();
    if (captionPatterns.some((p) => p.test(text))) continue;
    const words = text.split(/\s+/);
    if (/^[A-ZÑ][A-ZÑ.'-]*(?:\s+[A-ZÑ][A-ZÑ.'-]*)+$/i.test(text) && words.length <= 6 && text === text.toUpperCase()) {
      return { value: text, confidence: line.confidence, lineIndex: idx - back };
    }
  }
  return null;
}

function readLtoValueRow(cleanLines, extracted) {
  const today = new Date();
  for (const line of cleanLines) {
    const m = line.text.match(/\b[A-Z]{3}\s+([FM])\s+((?:19|20)\d{2}\s*[/-]\s*\d{1,2}\s*[/-]\s*\d{1,2})/i);
    if (m) {
      extracted.fields.sex = { value: m[1].toUpperCase(), confidence: line.confidence };
      const date = formatDate(m[2].replace(/\s+/g, ''));
      if (date) extracted.fields.birthDate = { value: date, confidence: line.confidence };
      return;
    }
  }
  const sexLine = cleanLines.find((l) => /^\s*[FM]\s*$/i.test(l.text));
  if (sexLine) extracted.fields.sex = { value: sexLine.text.trim().toUpperCase(), confidence: sexLine.confidence };
  for (const line of cleanLines) {
    const m = line.text.match(/^\s*((?:19|20)\d{2}\s*\/\s*\d{1,2}\s*\/\s*\d{1,2})\s*$/);
    const date = m ? formatDate(m[1].replace(/\s+/g, '')) : '';
    if (date && new Date(date) < today) {
      extracted.fields.birthDate = { value: date, confidence: line.confidence };
      return;
    }
  }
}

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

  if (profile.ltoValueRow) readLtoValueRow(cleanLines, extracted);

  const allLabelPatterns = Object.values(profile.labels);
  // idNumber is matched by value shape, not a caption, so it has no entry
  // in profile.labels/allLabelPatterns — without its (confirmed-where-
  // possible) caption added here too, the multi-line address collector
  // below has no way to recognize "License No."/"CRN"/etc. as a different
  // field's boundary and happily swallows it as more address.
  const addressStopPatterns = profile.idNumberLabel ? [...allLabelPatterns, profile.idNumberLabel] : allLabelPatterns;

  for (const [fieldName, pattern] of Object.entries(profile.labels)) {
    if (extracted.fields[fieldName]) continue; // already populated via MRZ
    const found = fieldName === 'address'
      ? extractMultiLineAddress(cleanLines, pattern, addressStopPatterns)
      : extractLabeledField(cleanLines, pattern, allLabelPatterns);
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

      // "Kasarian/Sex" and "Lugar ng kapanganakan/Place of birth" share a
      // row, so the line after the place-of-birth caption can be the sex
      // value ("F") on its own: take the next line with real words instead.
      if (fieldName === 'placeOfBirth' && !/[A-Z]{3,}/i.test(cleanFieldValue(value, fieldName))) {
        for (let ahead = 1; ahead <= 2; ahead++) {
          const next = cleanLines[found.lineIndex + ahead];
          if (!next || allLabelPatterns.some((p) => p.test(next.text))) break;
          if (/[A-Z]{3,}/i.test(cleanFieldValue(next.text, fieldName)) && !formatDate(next.text)) {
            value = next.text;
            confidence = Math.min(confidence, next.confidence);
            break;
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

  // Birth date listed BEFORE its label: Vision sorts by each paragraph's top
  // edge, and on a real TIN ID the date's box sat slightly higher than the
  // "Birth Date:" label's, so the date came first and nothing usable
  // followed the label. Only when the normal path found no date, accept a
  // date-only line just above the label (the line after it can be a
  // different date, e.g. "TIN Issuance Date").
  if (profile.labels.birthDate && !formatDate(extracted.fields.birthDate?.value || '')) {
    const labelIdx = cleanLines.findIndex((l) => profile.labels.birthDate.test(l.text));
    for (let back = 1; labelIdx > 0 && back <= 2; back++) {
      const prev = cleanLines[labelIdx - back];
      if (prev && isDateOnlyLine(prev.text)) {
        extracted.fields.birthDate = { value: cleanFieldValue(prev.text, 'birthDate'), confidence: prev.confidence };
        extracted.warnings = extracted.warnings.filter((w) => w !== 'Could not locate field: birthDate');
        break;
      }
    }
  }

  // "Blood Type   Eyes Color" captions share a row, so the label's own
  // line or the next caption can come back instead of the value ("O+").
  if (profile.labels.bloodType && !extracted.fields.bloodType?.value) {
    const labelIdx = cleanLines.findIndex((l) => profile.labels.bloodType.test(l.text));
    for (let ahead = 0; labelIdx >= 0 && ahead <= 3; ahead++) {
      const line = cleanLines[labelIdx + ahead];
      const value = line ? cleanFieldValue(line.text.replace(profile.labels.bloodType, ' '), 'bloodType') : '';
      if (value) {
        extracted.fields.bloodType = { value, confidence: line.confidence };
        extracted.warnings = extracted.warnings.filter((w) => w !== 'Could not locate field: bloodType');
        break;
      }
    }
  }

  // Captions side by side ("Birth Date   Gender") come out as label, label,
  // value, value, so the line after "Birth Date" is the next caption. Only
  // for cards whose profile says so (birthDateMayFollow): on others the
  // line after the label can be a different date (e.g. TIN Issuance Date).
  if (profile.birthDateMayFollow && profile.labels.birthDate && !formatDate(extracted.fields.birthDate?.value || '')) {
    const labelIdx = cleanLines.findIndex((l) => profile.labels.birthDate.test(l.text));
    for (let ahead = 1; labelIdx >= 0 && ahead <= 3; ahead++) {
      const next = cleanLines[labelIdx + ahead];
      if (next && isDateOnlyLine(next.text)) {
        extracted.fields.birthDate = { value: cleanFieldValue(next.text, 'birthDate'), confidence: next.confidence };
        extracted.warnings = extracted.warnings.filter((w) => w !== 'Could not locate field: birthDate');
        break;
      }
    }
  }

  // Combined-name fallback: only reached when separate-label extraction
  // above found none of surName/firstName/middleName, for an ID type that
  // either always prints one combined name line, or might.
  const hasSeparateName = extracted.fields.surName || extracted.fields.firstName || extracted.fields.middleName;
  if (!hasSeparateName && profile.nameMode !== 'separate' && profile.nameLabel) {
    const nameFound = extractLabeledField(cleanLines, profile.nameLabel, [profile.nameLabel, ...allLabelPatterns])
      || (profile.nameAboveLabel ? findNameAboveLabel(cleanLines, profile.labels[profile.nameAboveLabel], [profile.nameLabel, ...allLabelPatterns]) : null);
    if (nameFound) {
      const parsed = parseCombinedName(nameFound.value);
      if (parsed.mode === 'split') {
        extracted.fields.surName = { value: cleanFieldValue(parsed.surName, 'surName'), confidence: nameFound.confidence };
        extracted.fields.firstName = { value: cleanFieldValue(parsed.firstName, 'firstName'), confidence: nameFound.confidence };
        if (parsed.middleName) {
          extracted.fields.middleName = { value: cleanFieldValue(parsed.middleName, 'middleName'), confidence: nameFound.confidence };
        }
      } else if (parsed.fullName && profile.nameOrder === 'first-middle-surname') {
        // No comma, but this card's caption fixes the order (Postal ID).
        const split = splitFirstMiddleSurname(parsed.fullName);
        extracted.fields.surName = { value: cleanFieldValue(split.surName, 'surName'), confidence: nameFound.confidence };
        extracted.fields.firstName = { value: cleanFieldValue(split.firstName, 'firstName'), confidence: nameFound.confidence };
        if (split.middleName) {
          extracted.fields.middleName = { value: cleanFieldValue(split.middleName, 'middleName'), confidence: nameFound.confidence };
        }
        if (split.suffix) extracted.fields.suffix = { value: split.suffix, confidence: nameFound.confidence };
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

  // Unlabeled card layouts, read by position — only fills fields the label
  // search above didn't find.
  const positionReaders = { philhealth: extractPhilhealthByPosition, postal: extractPostalByPosition, sss: extractSssByPosition };
  if (positionReaders[profile.unlabeledLayout]) {
    const found = positionReaders[profile.unlabeledLayout](cleanLines, profile);
    // A card that doesn't print a field at all (the old SSS ID has no sex or
    // address) shouldn't be reported as "couldn't read": one plain note instead.
    const absent = found.notOnCard || [];
    delete found.notOnCard;
    const initial = found.middleInitial;
    delete found.middleInitial;
    if (initial) {
      extracted.warnings = extracted.warnings.filter((w) => w !== 'Could not locate field: middleName');
      extracted.warnings.push(`MIDDLE_INITIAL:${initial}`);
    }
    if (absent.length) {
      extracted.warnings = extracted.warnings.filter((w) => !absent.some((k) => w === `Could not locate field: ${k}`));
      extracted.warnings.push(`NOT_ON_CARD:${absent.join(',')}`);
    }
    const filled = [];
    for (const [key, field] of Object.entries(found)) {
      if (!extracted.fields[key]?.value) {
        extracted.fields[key] = field;
        filled.push(key);
      }
    }
    const nameFilled = filled.some((k) => ['surName', 'firstName', 'middleName'].includes(k));
    extracted.warnings = extracted.warnings.filter((w) => !(
      filled.some((k) => w === `Could not locate field: ${k}`)
      || (nameFilled && (w === 'Could not locate field: name' || w.startsWith('Name could not be split')))
    ));
    if (nameFilled) delete extracted.fields.fullNameUnparsed;
  }

  const confidences = Object.values(extracted.fields)
    .filter((f) => typeof f.confidence === 'number')
    .map((f) => f.confidence);
  extracted.confidence = confidences.length
    ? Math.round((confidences.reduce((a, b) => a + b, 0) / confidences.length) * 10) / 10
    : 0;

  return extracted;
}

// Plain names for the scanned fields, as residents see them.
export const OCR_FIELD_LABELS = {
  surName: 'Last name', firstName: 'First name', middleName: 'Middle name', suffix: 'Suffix',
  fullNameUnparsed: 'Full name', name: 'Name', birthDate: 'Date of birth', sex: 'Sex', address: 'Address',
  idNumber: 'ID number', bloodType: 'Blood type', civilStatus: 'Civil status', height: 'Height',
  placeOfBirth: 'Place of birth',
};

// Philippine provinces (plus Metro Manila), for splitting a place of birth
// such as "IMUS CAVITE" or "CITY OF IMUS, CAVITE" into city and province.
const PH_PROVINCES = [
  'ABRA', 'AGUSAN DEL NORTE', 'AGUSAN DEL SUR', 'AKLAN', 'ALBAY', 'ANTIQUE', 'APAYAO', 'AURORA', 'BASILAN', 'BATAAN',
  'BATANES', 'BATANGAS', 'BENGUET', 'BILIRAN', 'BOHOL', 'BUKIDNON', 'BULACAN', 'CAGAYAN', 'CAMARINES NORTE',
  'CAMARINES SUR', 'CAMIGUIN', 'CAPIZ', 'CATANDUANES', 'CAVITE', 'CEBU', 'COTABATO', 'DAVAO DE ORO', 'DAVAO DEL NORTE',
  'DAVAO DEL SUR', 'DAVAO OCCIDENTAL', 'DAVAO ORIENTAL', 'DINAGAT ISLANDS', 'EASTERN SAMAR', 'GUIMARAS', 'IFUGAO',
  'ILOCOS NORTE', 'ILOCOS SUR', 'ILOILO', 'ISABELA', 'KALINGA', 'LA UNION', 'LAGUNA', 'LANAO DEL NORTE', 'LANAO DEL SUR',
  'LEYTE', 'MAGUINDANAO', 'MAGUINDANAO DEL NORTE', 'MAGUINDANAO DEL SUR', 'MARINDUQUE', 'MASBATE', 'MISAMIS OCCIDENTAL',
  'MISAMIS ORIENTAL', 'MOUNTAIN PROVINCE', 'NEGROS OCCIDENTAL', 'NEGROS ORIENTAL', 'NORTHERN SAMAR', 'NUEVA ECIJA',
  'NUEVA VIZCAYA', 'OCCIDENTAL MINDORO', 'ORIENTAL MINDORO', 'PALAWAN', 'PAMPANGA', 'PANGASINAN', 'QUEZON', 'QUIRINO',
  'RIZAL', 'ROMBLON', 'SAMAR', 'WESTERN SAMAR', 'SARANGANI', 'SIQUIJOR', 'SORSOGON', 'SOUTH COTABATO', 'SOUTHERN LEYTE',
  'SULTAN KUDARAT', 'SULU', 'SURIGAO DEL NORTE', 'SURIGAO DEL SUR', 'TARLAC', 'TAWI-TAWI', 'ZAMBALES',
  'ZAMBOANGA DEL NORTE', 'ZAMBOANGA DEL SUR', 'ZAMBOANGA SIBUGAY', 'METRO MANILA',
].sort((a, b) => b.split(' ').length - a.split(' ').length); // "EASTERN SAMAR" before "SAMAR"
// Metro Manila cities, printed without a province.
const NCR_CITIES = ['MANILA', 'QUEZON CITY', 'CALOOCAN', 'PASAY', 'MAKATI', 'TAGUIG', 'PASIG', 'MANDALUYONG', 'MARIKINA',
  'PARANAQUE', 'LAS PINAS', 'MUNTINLUPA', 'VALENZUELA', 'MALABON', 'NAVOTAS', 'SAN JUAN', 'PATEROS'];

/**
 * Splits a printed place of birth into the form's birth city / province /
 * country. "IMUS CAVITE", "CITY OF IMUS, CAVITE" and "IMUS, CAVITE" all give
 * { city: 'IMUS', province: 'CAVITE', country: 'Philippines' }; a Metro
 * Manila city alone gets province METRO MANILA. A place it can't place
 * (e.g. abroad) stays whole in city, with province and country left for the
 * resident to type: better than a wrong guess.
 */
export function splitPlaceOfBirth(text) {
  const clean = String(text || '').toUpperCase().replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ').trim().replace(/,$/, '');
  if (!clean) return { city: '', province: '', country: '' };
  const cityName = (c) => c.replace(/^CITY\s+OF\s+/, '').trim();
  const rest = clean.replace(/,?\s*PHILIPPINES$/, '').replace(/,/g, '').trim();
  const words = rest.split(' ');
  for (const prov of PH_PROVINCES) {
    const pw = prov.split(' ');
    if (words.length > pw.length && words.slice(-pw.length).join(' ') === prov) {
      return { city: cityName(words.slice(0, -pw.length).join(' ')), province: prov, country: 'Philippines' };
    }
  }
  const plain = cityName(rest).normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (NCR_CITIES.includes(plain) || NCR_CITIES.includes(`${plain} CITY`) || NCR_CITIES.includes(plain.replace(/\s+CITY$/, ''))) {
    return { city: cityName(rest), province: 'METRO MANILA', country: 'Philippines' };
  }
  return { city: rest, province: '', country: '' };
}
export const ocrFieldLabel = (key) => OCR_FIELD_LABELS[key] || key;

// Scanned values are listed in the form's own order (name, birth, address,
// other details, the ID's number last), not in the order the scan found them.
const OCR_FIELD_ORDER = ['surName', 'firstName', 'middleName', 'suffix', 'fullNameUnparsed', 'birthDate', 'sex',
  'placeOfBirth', 'address', 'civilStatus', 'bloodType', 'height', 'idNumber'];
export const orderedOcrFields = (fields = {}) => Object.entries(fields).sort(([a], [b]) => {
  const ia = OCR_FIELD_ORDER.indexOf(a), ib = OCR_FIELD_ORDER.indexOf(b);
  return (ia < 0 ? OCR_FIELD_ORDER.length : ia) - (ib < 0 ? OCR_FIELD_ORDER.length : ib);
});

// The scan's warnings as one plain message for the resident: fields it
// couldn't find are listed by name; the technical wording (checksums, field
// keys) stays inside this module, where the filters above compare it.
export const ocrWarningsMessage = (warnings = []) => {
  const missing = [];
  const notes = [];
  warnings.forEach((w) => {
    const m = /^Could not locate field: (\w+)$/.exec(w);
    if (m) missing.push(ocrFieldLabel(m[1]));
    else if (/checksum did not match/i.test(w)) notes.push('Please check the details read from your passport.');
    else if (w.startsWith('Name could not be split')) notes.push('Please check that your first, middle and last name are in the right boxes.');
    else if (w.startsWith('MIDDLE_INITIAL:')) notes.push(`Your ID shows only your middle initial (${w.slice(15)}). Please type your full middle name below.`);
    else if (w.startsWith('NOT_ON_CARD:')) {
      // In the form's order: "date of birth, sex or address".
      const keys = w.slice(12).split(',').sort((a, b) => OCR_FIELD_ORDER.indexOf(a) - OCR_FIELD_ORDER.indexOf(b));
      const names = keys.map((k) => ocrFieldLabel(k).toLowerCase());
      const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}` : names[0];
      notes.push(`This ID doesn't show your ${list}. Please type ${names.length > 1 ? 'them' : 'it'} in below.`);
    }
    else if (w.startsWith('No readable text')) notes.push("We couldn't read any text on the ID. Try a clearer photo, or type your details below.");
    else notes.push(w);
  });
  if (missing.length) notes.unshift(`We couldn't read: ${[...new Set(missing)].join(', ')}. Please type ${missing.length === 1 ? 'it' : 'them'} in below.`);
  return [...new Set(notes)].join(' ');
};
