// Downloads a CSV export from an admin endpoint (backend/api/csv_export.php).
// Fetching first, instead of opening the URL, means a refusal (no access,
// session expired) comes back as a message for the page to show, rather than
// a raw JSON page replacing the admin screen.
import { forceAdminReauth, isAuthFailure } from './apiClient';

/** Resolves { ok: true, count? } or { ok: false, message }. */
export async function downloadCsv(url, fallbackName = 'export.csv') {
  let res;
  try {
    res = await fetch(url, { credentials: 'include', cache: 'no-store' });
  } catch {
    return { ok: false, message: 'Unable to reach the server.' };
  }
  if (isAuthFailure(res.status)) {
    forceAdminReauth();
    return { ok: false, message: 'Please sign in again.' };
  }
  const type = res.headers.get('Content-Type') || '';
  if (!res.ok || !type.includes('text/csv')) {
    let message = `The export failed (HTTP ${res.status}).`;
    try {
      const data = await res.json();
      if (data?.message) message = data.message;
    } catch {
      // not JSON: keep the generic message
    }
    return { ok: false, message };
  }

  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') || '';
  const name = (disposition.match(/filename="?([^";]+)"?/) || [])[1] || fallbackName;
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
  return { ok: true, count: Number(res.headers.get('X-Row-Count')) || null, name };
}
