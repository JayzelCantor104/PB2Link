// Verification selfie check, shared by Register and Edit Profile.
// The server (check_selfie.php) asks Google Vision for the faces and text in
// the photo; the submit endpoint re-judges that stored result itself, so what
// this returns only drives what the page shows.

const API_BASE = '/api_backend';

// After this many failed checks the resident may continue anyway — the
// record is then flagged "Needs Review" for staff.
export const SELFIE_MAX_FAILED_TRIES = 2;

const sha256 = async (file) => {
  try {
    if (!file || !globalThis.crypto?.subtle) return null;
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
};

/**
 * Checks a selfie-holding-ID photo. Resolves to
 *   { status: 'verified' | 'failed' | 'unavailable', token, message }
 * - idPhotos: the ID front/back files; a selfie that is the same file is
 *   rejected right here without spending a scan.
 * - context 'profile' makes the server use the signed-in resident's name;
 *   'register' uses fName/lName (whatever is known so far, may be blank).
 */
export async function checkIdSelfie(selfie, { idPhotos = [], context = 'register', fName = '', lName = '' } = {}) {
  const selfieHash = await sha256(selfie);
  if (selfieHash) {
    for (const photo of idPhotos) {
      if (photo && (await sha256(photo)) === selfieHash) {
        return { status: 'failed', token: null, message: 'This is the same photo as your ID. Please take a selfie of yourself holding your ID.' };
      }
    }
  }

  const body = new FormData();
  body.append('selfie_image', selfie);
  body.append('context', context);
  if (context !== 'profile') {
    body.append('fName', fName || '');
    body.append('lName', lName || '');
  }
  try {
    const res = await fetch(`${API_BASE}/check_selfie.php`, { method: 'POST', body, credentials: 'include' });
    const data = await res.json();
    if (!data.success) {
      if (data.code === 'OCR_UNAVAILABLE' || data.code === 'RATE_LIMITED' || !data.error) {
        return { status: 'unavailable', token: null, message: '' };
      }
      return { status: 'failed', token: null, message: data.error };
    }
    const r = data.data || {};
    return r.status === 'Verified'
      ? { status: 'verified', token: r.check_token, message: '' }
      : { status: 'failed', token: r.check_token, message: r.message || 'Please retake your selfie holding your ID.' };
  } catch {
    return { status: 'unavailable', token: null, message: '' };
  }
}
