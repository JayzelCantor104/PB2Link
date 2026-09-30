// PhilSys (National ID) card scanning, shared by Register and Edit Profile.
// Mirrors backend/api/philsys_scan_common.php — the server re-checks
// everything; this only drives what the page shows right away.

import { scanIdWithRetry } from './backendOcr';

export const PHILSYS_ID_TYPE = 'National ID (PhilID/ePhilID)';

/** "Peña, Ma. José" -> "PENA MA JOSE" (same rule as the server). */
export const normalizeName = (s = '') => String(s)
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[’'`^~"]/g, '')
  .toUpperCase()
  .replace(/[^A-Z0-9]+/g, ' ')
  .trim()
  .replace(/\s+/g, ' ');

/** "1234567890123456" / "1234 5678 9012 3456" -> "1234-5678-9012-3456". */
export const formatPhilsys = (value = '') => {
  const d = String(value).replace(/\D/g, '').slice(0, 16);
  return d.match(/.{1,4}/g)?.join('-') || '';
};

/**
 * Every word of the first and last name must be printed on the card; the
 * middle name too unless it's just an initial. Returns { match, missing }.
 */
export const philsysNameCheck = (ocrText, { fName, mName, lName }) => {
  const hay = ` ${normalizeName(ocrText)} `;
  const missing = [];
  const need = (label, value) => {
    const words = normalizeName(value).split(' ').filter(Boolean);
    if (words.some(w => !hay.includes(` ${w} `))) missing.push(label);
  };
  need('first name', fName);
  need('last name', lName);
  if (normalizeName(mName).replace(/\s/g, '').length > 1) need('middle name', mName);
  return { match: missing.length === 0, missing };
};

/**
 * Scans the FRONT of a PhilSys card (the number and name are printed there).
 * Resolves to { ok, number, scanToken, text, message }:
 *   ok=false  -> the card couldn't be read (blurry, scanning unavailable,
 *                monthly limit reached) — the page falls back to typing.
 */
export async function scanPhilsysFront(file) {
  try {
    // Retries once with the background washed out if the first read is poor.
    const { lines, scanToken, extracted } = await scanIdWithRetry(file, 'national');
    const text = lines.map(l => l.text).join('\n');
    const digits = String(extracted.fields?.idNumber?.value || '').replace(/\D/g, '');
    if (digits.length !== 16) {
      return { ok: false, number: '', scanToken, text, message: 'We could not read a 16-digit PhilSys number on this photo. Try a clearer photo of the front, or type the number.' };
    }
    return { ok: true, number: formatPhilsys(digits), scanToken, text, message: '' };
  } catch (err) {
    return {
      ok: false, number: '', scanToken: null, text: '',
      message: err?.code === 'RATE_LIMITED'
        ? 'Too many scans for now. Please type your PhilSys number instead.'
        : 'Card scanning is unavailable right now. Please type your PhilSys number instead.'
    };
  }
}
