// Shared by Profiling.jsx and ResidentProfile.jsx (admin_residents.php).
// The fixed lists match the residents table's own lists exactly; the server
// checks them again.

export const API_BASE = '/api_backend';

export const STATUS_VIEWS = [
  { key: 'all', label: 'All residents', icon: 'bi-people' },
  { key: 'Pending', label: 'Needs review', icon: 'bi-hourglass-split' },
  { key: 'Action Required', label: 'Action required', icon: 'bi-exclamation-circle' },
  { key: 'Active', label: 'Active', icon: 'bi-check-circle' },
  { key: 'Archived', label: 'Archived', icon: 'bi-archive' },
];

export const STATUS_CLASS = {
  Pending: 'is-pending',
  Active: 'is-active',
  'Action Required': 'is-action',
  Archived: 'is-archived',
};

export const STATUS_LABEL = {
  Pending: 'Needs review',
  Active: 'Active',
  'Action Required': 'Action required',
  Archived: 'Archived',
};

export const SECTORS = [
  { key: 'is_senior', label: 'Senior Citizen', short: 'Senior', proof: null },
  { key: 'is_pwd', label: 'PWD', short: 'PWD', proof: 'proof_pwd' },
  { key: 'is_solo_parent', label: 'Solo Parent', short: 'Solo Parent', proof: 'proof_solo_parent' },
  { key: 'is_indigent', label: 'Indigent', short: 'Indigent', proof: 'proof_indigent' },
  { key: 'is_4ps', label: '4Ps Beneficiary', short: '4Ps', proof: 'proof_4ps' },
];

export const SUFFIXES = ['Jr.', 'Sr.', 'II', 'III', 'IV'];
export const GENDERS = ['Male', 'Female', 'Other'];
export const CIVIL_STATUSES = ['Single', 'Married', 'Widowed', 'Separated'];
export const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
export const RESIDENCY_STATUSES = ['Homeowner', 'Tenant', 'Sharer'];
export const NOTIFY_CHANNELS = [
  { value: 'email', label: 'Email' },
  { value: 'sms', label: 'SMS' },
  { value: 'both', label: 'Email and SMS' },
];
export const ID_TYPES = [
  'National ID (PhilID/ePhilID)', 'Passport', 'Drivers License', 'UMID (SSS/GSIS)', 'PRC ID',
  'Postal ID', 'Voters ID', 'PhilHealth ID', 'TIN ID',
];

/** Files on a resident's record are stored relative to backend/api. */
export const fileUrl = (path) => {
  if (!path) return null;
  if (/^https?:/i.test(path)) return path;
  return `${API_BASE}/${String(path).replace(/^(\.\.\/)+/, '').replace(/^api\//, '').replace(/^\/+/, '')}`;
};

export const isPdf = (path) => /\.pdf$/i.test(path || '');

export const fullAddress = (r) => [
  r.house_no,
  r.block_lot,
  r.street,
  r.subdivision,
  r.zone ? `Zone ${r.zone}` : '',
  r.area,
].filter((p) => p && String(p).trim()).join(', ');

export const initials = (r) => `${(r.fName || '?')[0]}${(r.lName || '')[0] || ''}`.toUpperCase();

export const fmtDate = (value, withTime = false) => {
  if (!value) return '';
  const d = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('en-PH', withTime
    ? { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }
    : { month: 'short', day: 'numeric', year: 'numeric' });
};

export const fmtMonth = (value) => {
  if (!value) return '';
  const d = new Date(`${String(value).slice(0, 7)}-01T00:00:00`);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
};

export const ageGroup = (age) => {
  if (age === null || age === undefined) return '';
  if (age < 18) return 'minor';
  if (age >= 60) return 'senior';
  return 'adult';
};

/**
 * The automatic checks, as { key, label, tone: ok|warn|bad|none, text }.
 * Used for the list's check icons and the profile's verification cards.
 */
export const verificationChecks = (r) => {
  const id = r.id_verification_status || 'Not Scanned';
  const selfie = r.selfie_check_status || 'Not Checked';
  const philsys = r.philsys_verification_status || 'Not Provided';
  const hasPhilsys = r.has_philsys !== undefined ? !!r.has_philsys : !!r.philsys_nat_id;
  return [
    {
      key: 'id',
      label: 'ID scan',
      status: id,
      tone: id === 'Matched' ? 'ok' : id === 'Mismatch' ? 'bad' : 'warn',
      text: {
        Matched: 'The name on the ID was read by the scanner and matches the form.',
        Mismatch: 'The ID was scanned but the name or birth date differs from the form. Compare the photo with the record.',
        'Manual Entry': 'Typed in or replaced by staff; no usable scan. Compare the ID photo with the record.',
        'Not Scanned': 'The ID was not scanned. Compare the ID photo with the record.',
      }[id] || '',
    },
    {
      key: 'selfie',
      label: 'Selfie with ID',
      status: selfie,
      tone: selfie === 'Verified' ? 'ok' : selfie === 'Needs Review' ? 'bad' : 'warn',
      text: selfie === 'Verified'
        ? 'A face and the photo on the ID were found, and the name on the ID could be read.'
        : (r.selfie_check_notes || 'Not checked automatically. Compare the selfie with the ID photo.'),
    },
    {
      key: 'philsys',
      label: 'PhilSys card',
      status: hasPhilsys ? philsys : 'Not provided',
      tone: !hasPhilsys ? 'none' : philsys === 'Matched' ? 'ok' : philsys === 'Mismatch' ? 'bad' : 'warn',
      text: !hasPhilsys ? 'No PhilSys number on the record.' : {
        Matched: 'The number and name were read from the card and match.',
        Mismatch: 'The card was scanned but its number or name does not match. Compare the card photos.',
        'Manual Entry': 'The number was typed in. Compare it with the card photos.',
      }[philsys] || '',
    },
    // Only in a full record (the list has no id_address_match): reviewable by staff.
    ...(r.id_address_match === undefined ? [] : [{
      key: 'address',
      label: 'Address on the ID',
      status: r.id_address_match === null ? 'Not read' : Number(r.id_address_match) === 1 ? 'Pasong Buaya II' : 'Not PB2',
      tone: r.id_address_match === null ? 'warn' : Number(r.id_address_match) === 1 ? 'ok' : 'warn',
      text: r.id_address_match === null
        ? 'No address could be read from the ID. Look at the ID front: does it show a Pasong Buaya II address?'
        : Number(r.id_address_match) === 1
          ? 'The ID shows a Pasong Buaya II address, so no separate proof of address is needed.'
          : 'The ID does not show a Pasong Buaya II address, so a proof of address is needed.',
    }]),
    {
      key: 'mobile',
      label: 'Mobile number',
      status: !r.contact_num ? 'None' : (r.mobile_verified || r.mobile_verified_at) ? 'Verified' : 'Not verified',
      tone: !r.contact_num ? 'none' : (r.mobile_verified || r.mobile_verified_at) ? 'ok' : 'warn',
      text: !r.contact_num ? 'No mobile number on the record.'
        : (r.mobile_verified || r.mobile_verified_at) ? 'Confirmed by an SMS code.' : 'Not yet confirmed by an SMS code. Ask the resident to update it if it is wrong.',
    },
  ];
};
