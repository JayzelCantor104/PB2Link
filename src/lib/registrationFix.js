// Fixing a registration online (migration 027). Mirrors
// backend/api/registration_fix_common.php; the server decides, this only labels.

export const MAX_RESUBMITS = 3;
export const ADULT_AGE = 18;

/**
 * key -> label, what the resident does, and where in Edit Profile (section id).
 * `panel: true` items are done in the "Fix your registration" panel itself.
 */
export const FIX_ITEMS = [
  { key: 'id', label: 'Valid ID photos and selfie', help: 'Upload new, clear photos of your valid ID (front and back) and a selfie holding it.', section: 'ep-sec-id' },
  { key: 'details', label: 'Name, birth date or sex', help: 'Correct your name, birth date or sex so they match your ID exactly.', section: 'ep-sec-identity' },
  { key: 'philsys', label: 'PhilSys number and card photos', help: 'Re-enter your PhilSys number and upload clear photos of the card.', section: 'ep-sec-identity' },
  { key: 'address', label: 'Proof of address', help: 'Upload a document with your name and your Pasong Buaya II address.', panel: true },
  { key: 'sectors', label: 'Sector documents', help: 'Upload the document for your PWD, 4Ps, Solo Parent or Indigent claim, or remove the claim.', section: 'ep-sec-sectors' },
  { key: 'mobile', label: 'Mobile number', help: 'Enter your mobile number and confirm it with the code we text you.', section: 'ep-sec-account' },
  { key: 'guardian', label: 'Parent or guardian documents', help: "Upload your parent's or guardian's ID (with signature); if their surname differs from yours, also a letter they signed.", panel: true },
  { key: 'confirm', label: 'Confirm your details', help: 'Check that everything on your profile is correct and that this is your only account, then send it back.' },
];

export const FIX_ITEM_LOOKUP = Object.fromEntries(FIX_ITEMS.map((i) => [i.key, i]));

export const GUARDIAN_RELATIONSHIPS = ['Mother', 'Father', 'Legal Guardian', 'Grandparent', 'Sibling', 'Aunt/Uncle', 'Other Relative'];

/** Same surname, ignoring case, accents, spaces and punctuation (as the server does). */
export const sameSurname = (a, b) => {
  const norm = (s) => String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z]/g, '');
  return norm(a) !== '' && norm(a) === norm(b);
};

/**
 * Items staff would most likely tick for a registration, from its automatic
 * review reasons (used to pre-fill the "Ask for action" dialog).
 */
export const suggestFixItems = (reasons = [], age = null) => {
  const text = reasons.join(' ').toLowerCase();
  const out = new Set();
  if (/\bid:|scanned id|id scan/.test(text)) out.add('id');
  if (/selfie/.test(text)) out.add('id');
  if (/philsys/.test(text)) out.add('philsys');
  if (/proof|residen|address|endorsement/.test(text)) out.add('address');
  if (/duplicate/.test(text)) out.add('confirm');
  if ((age !== null && age < ADULT_AGE) || /under 18|minor|guardian/.test(text)) out.add('guardian');
  return FIX_ITEMS.filter((i) => out.has(i.key)).map((i) => i.key);
};
