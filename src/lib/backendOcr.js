// Sends an ID photo to our backend, which forwards it to Google Cloud
// Vision for OCR and returns only the recognized text lines. Field
// extraction happens entirely client-side in idOcrExtraction.js, which is
// engine-agnostic and doesn't know or care that the lines came from a
// server call rather than a local WASM engine.

const API_BASE = '/api_backend';

/**
 * Uploads the ID photo, returns [{text, confidence}, ...] in reading order.
 * Never resolves with a raw/unstructured error — throws an Error whose
 * `.code` matches the backend's contract (`OCR_UNAVAILABLE`/`RATE_LIMITED`)
 * when available, so callers can log/branch on it if ever needed, even
 * though the current UI collapses every failure to one honest message.
 */
export async function scanIdImageViaBackend(file, idTypeSlug, onProgress) {
  const formData = new FormData();
  formData.append('id_image', file);
  formData.append('id_type', idTypeSlug);

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
  return result.data?.lines || [];
}
