// Residency-length rule shared by registration and the request pages.
// Mirrors backend/api/residency_requirement.php — the server is the one that
// enforces it; this only drives what the forms show.

export const MIN_RESIDENCY_MONTHS = 6;

// Accepted proofs for residents under 6 months. HOA Certification (Permit to
// Reside) is the standard one; the others cover areas without an HOA,
// tenants, and sharers.
export const RESIDENCY_PROOF_TYPES = [
  { value: 'HOA Certification', label: 'HOA Certification / Permit to Reside', hint: 'Signed by your HOA president or secretary' },
  { value: 'Lease Contract', label: 'Lease / Rental Contract', hint: 'For tenants — must show your name and address' },
  { value: 'Landlord Certification', label: 'Landlord / Household Head Certification', hint: 'For tenants and sharers — signed, with their contact number' },
  { value: 'Purok/Kagawad Certification', label: 'Purok Leader / Kagawad Certification', hint: 'For areas without a homeowners association' },
];

// Registration, 6+ months, when the scanned ID doesn't show a Pasong Buaya II
// address (migration 018): any document with the resident's name and a PB2
// address. Mirrors PB2_ADDRESS_PROOF_TYPES in residency_requirement.php.
export const ADDRESS_PROOF_TYPES = [
  { value: 'Utility Bill', label: 'Utility Bill (electric, water, internet)', hint: 'Recent, in your name, with your Pasong Buaya II address' },
  { value: 'Bank/Billing Statement', label: 'Bank / Credit Card / Billing Statement', hint: 'In your name, with your Pasong Buaya II address' },
  { value: 'Other ID with Address', label: 'Another ID with your PB2 address', hint: 'Any ID showing your name and Pasong Buaya II, Imus address' },
  { value: 'Parcel/Delivery Receipt', label: 'Parcel / Delivery Receipt', hint: 'Waybill showing your name and Pasong Buaya II address' },
  { value: 'HOA Certification', label: 'HOA Endorsement / Certification', hint: 'Signed by your HOA president or secretary' },
  { value: 'Lease Contract', label: 'Lease / Rental Contract', hint: 'For tenants — must show your name and address' },
  { value: 'Landlord Certification', label: 'Landlord / Household Head Certification', hint: 'For tenants and sharers — signed, with their contact number' },
  { value: 'Purok/Kagawad Certification', label: 'Purok Leader / Kagawad Certification', hint: 'For areas without a homeowners association' },
];

/**
 * Does the ID scan show a Pasong Buaya II address? Same rule as
 * pb2_text_has_pb2_address() in residency_requirement.php (the server
 * re-checks its own copy of the scan): "Pasong Buaya II"/"2", never "I".
 */
export const idShowsPb2Address = (lines) => {
  const t = (Array.isArray(lines) ? lines.join(' ') : String(lines || ''))
    .replace(/[^A-Za-z0-9]+/g, ' ').toUpperCase().replace(/\s+/g, ' ');
  return /\bPASONG ?BUAYA ?(II|2|IL|LI|LL|11)\b/.test(t)
    || /\bP ?BUAYA ?(II|2|IL|LI|LL|11)\b.*\bIMUS\b/.test(t);
};

/**
 * Which proof registration asks for: 'endorsement' (under 6 months),
 * 'address' (6+ months but the ID doesn't show PB2 / wasn't scanned) or null.
 */
export const registrationProofKind = (months, idAddressInPb2) => {
  if (months === null) return null;
  if (months < MIN_RESIDENCY_MONTHS) return 'endorsement';
  return idAddressInPb2 ? null : 'address';
};

// Suggested proof per residency status (first entry is the usual one).
export const SUGGESTED_PROOFS = {
  Homeowner: ['HOA Certification', 'Purok/Kagawad Certification'],
  Tenant: ['Lease Contract', 'Landlord Certification', 'HOA Certification'],
  Sharer: ['Landlord Certification', 'HOA Certification', 'Purok/Kagawad Certification'],
};

/** "YYYY-MM" for the current month (max value for <input type="month">). */
export const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/** Whole months from a "YYYY-MM" (or "YYYY-MM-DD") move-in month to today; null if invalid. */
export const monthsSince = (value) => {
  const m = /^(\d{4})-(\d{2})/.exec(value || '');
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12 || year < 1900) return null;
  const now = new Date();
  const months = (now.getFullYear() - year) * 12 + (now.getMonth() + 1 - month);
  return months < 0 ? null : months;
};

/**
 * Why the resident can't leave a request page's verification step yet, or
 * null. `idOnFile` / `residency` come from get_user_profile.php; the server
 * enforces the same rules on submit.
 */
export const verificationBlocker = ({ idOnFile, residency, requireResidency }) => {
  if (!idOnFile) return 'We could not find the valid ID from your registration. Please update your ID in your profile first.';
  if (!requireResidency || !residency) return null;
  if (residency.under_minimum === null) return 'Please tell us the month you started living in Pasong Buaya II.';
  if (residency.under_minimum && !residency.proof_in_force) {
    return `You have lived here for less than ${MIN_RESIDENCY_MONTHS} months. Please upload your HOA Certification or another accepted proof of residency.`;
  }
  return null;
};

export const isUnderMinimum =(months) => months !== null && months < MIN_RESIDENCY_MONTHS;

/** "2 years, 3 months" / "4 months" / "less than a month". */
export const formatResidency = (months) => {
  if (months === null || months === undefined) return 'Not recorded';
  if (months < 1) return 'Less than a month';
  const y = Math.floor(months / 12);
  const mo = months % 12;
  const parts = [];
  if (y) parts.push(`${y} year${y > 1 ? 's' : ''}`);
  if (mo) parts.push(`${mo} month${mo > 1 ? 's' : ''}`);
  return parts.join(', ');
};
