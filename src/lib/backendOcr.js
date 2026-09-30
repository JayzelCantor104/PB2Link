// Sends an ID photo to our backend, which forwards it to Google Cloud
// Vision for OCR and returns only the recognized text lines. Field
// extraction happens entirely client-side in idOcrExtraction.js, which is
// engine-agnostic and doesn't know or care that the lines came from a
// server call rather than a local WASM engine.

import { extractIdFields, getIdProfile, formatDate } from './idOcrExtraction';

const API_BASE = '/api_backend';

/**
 * Uploads the ID photo, returns [{text, confidence}, ...] in reading order.
 * Never resolves with a raw/unstructured error — throws an Error whose
 * `.code` matches the backend's contract (`OCR_UNAVAILABLE`/`RATE_LIMITED`)
 * when available, so callers can log/branch on it if ever needed, even
 * though the current UI collapses every failure to one honest message.
 */
export async function scanIdImageViaBackend(file, idTypeSlug, onProgress) {
  return (await scanIdImageWithToken(file, idTypeSlug, onProgress)).lines;
}

/**
 * Same as scanIdImageViaBackend, but also returns the server's one-time
 * `scanToken` for this photo (ocr_id.php / migration 013). Send it with the
 * same photo when submitting a PhilSys number, so the server can re-check
 * the number and name itself. `scanToken` may be null if it couldn't be stored.
 */
export async function scanIdImageWithToken(file, idTypeSlug, onProgress, { enhance = false } = {}) {
  const formData = new FormData();
  formData.append('id_image', file);
  formData.append('id_type', idTypeSlug);
  // Asks the server to wash out a light background/watermark first
  // (ocr_id.php suppressLightWatermark) — used by scanIdWithRetry's retry.
  if (enhance) formData.append('enhance', '1');

  // A single HTTP round-trip has no multi-phase progress the way a local
  // OCR engine's own progress events would — one synthetic bump while the
  // request is in flight, one on completion, is honest without faking
  // granular progress that doesn't exist.
  if (onProgress) onProgress(30);

  let response;
  try {
    response = await fetch(`${API_BASE}/ocr_id.php`, {
      method: 'POST',
      body: formData,
    });
  } catch (networkErr) {
    const err = new Error('OCR request failed: ' + (networkErr?.message || 'network error'));
    err.code = 'OCR_UNAVAILABLE';
    throw err;
  }

  let result;
  try {
    result = await response.json();
  } catch {
    const err = new Error('OCR service returned an unreadable response');
    err.code = 'OCR_UNAVAILABLE';
    throw err;
  }

  if (!result.success) {
    const err = new Error(result.error || 'OCR processing failed');
    err.code = result.code;
    throw err;
  }

  if (onProgress) onProgress(100);
  return { lines: result.data?.lines || [], scanToken: result.data?.scan_token || null };
}

/**
 * How many of this ID type's expected fields a read actually found:
 * { found, expected } over name / birth date / sex / address / ID number
 * (only the ones the card really carries — ID_PROFILES.fieldsPresent).
 */
export function scoreExtraction(extracted, idTypeSlug) {
  const present = getIdProfile(idTypeSlug).fieldsPresent;
  const f = extracted?.fields || {};
  const has = (k) => !!String(f[k]?.value || '').trim();
  const checks = {
    name: has('surName') || has('firstName'),
    birth_date: !!formatDate(String(f.birthDate?.value || '')),
    gender: has('sex'),
    address: has('address'),
    idNumber: has('idNumber'),
  };
  const keys = Object.keys(checks).filter((k) => present[k]);
  return { found: keys.filter((k) => checks[k]).length, expected: keys.length, name: checks.name };
}

// A read is "poor" when the name is missing or under half of the card's
// fields came back — the TIN ID's failure mode, where a background
// watermark drowned the text.
const isPoorRead = (s) => !s.name || s.found * 2 < s.expected;

/**
 * Scans an ID and extracts its fields, retrying ONCE with the background
 * washed out (enhance) when the first read is poor. Keeps whichever read
 * found more fields. A good first read costs one scan, exactly as before;
 * only a poor one spends a second. TIN IDs are always enhanced by the
 * server already, so they're never retried.
 *
 * Resolves to { lines, scanToken, extracted, retried }.
 */
export async function scanIdWithRetry(file, idTypeSlug, onProgress) {
  const first = await scanIdImageWithToken(file, idTypeSlug, onProgress ? (p) => onProgress(Math.min(p, 60)) : undefined);
  const firstExtracted = extractIdFields(first.lines, idTypeSlug);
  const firstScore = scoreExtraction(firstExtracted, idTypeSlug);

  if (idTypeSlug === 'tin' || !isPoorRead(firstScore)) {
    if (onProgress) onProgress(100);
    return { ...first, extracted: firstExtracted, retried: false };
  }

  let second = null;
  try {
    second = await scanIdImageWithToken(file, idTypeSlug, onProgress ? (p) => onProgress(60 + p * 0.4) : undefined, { enhance: true });
  } catch {
    // Scanning became unavailable (limit reached, network) — keep the first read.
  }
  if (onProgress) onProgress(100);
  if (!second) return { ...first, extracted: firstExtracted, retried: false };

  const secondExtracted = extractIdFields(second.lines, idTypeSlug);
  const secondScore = scoreExtraction(secondExtracted, idTypeSlug);
  return secondScore.found > firstScore.found || (secondScore.name && !firstScore.name)
    ? { ...second, extracted: secondExtracted, retried: true }
    : { ...first, extracted: firstExtracted, retried: true };
}
