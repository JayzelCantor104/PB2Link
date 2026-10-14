// Staff change requests (migration 028). Mirrors
// backend/api/resident_change_common.php; the server decides, this only labels.

export const CHANGE_CATEGORIES = [
  { key: 'name', label: 'Name', section: 'ep-sec-identity', proof: 'a supporting document' },
  { key: 'address', label: 'Address or move-in month', section: 'ep-sec-address', proof: 'a proof of address' },
  { key: 'sectors', label: 'Sector membership', section: 'ep-sec-sectors', proof: "the sector's document" },
  { key: 'philsys', label: 'PhilSys number', section: 'ep-sec-identity', proof: 'photos of the PhilSys card' },
  { key: 'id', label: 'Valid ID', section: 'ep-sec-id', proof: 'new ID photos and a selfie' },
  { key: 'contact', label: 'Email or mobile number', section: 'ep-sec-account', proof: 'a confirmation code' },
];

export const CHANGE_CATEGORY_LOOKUP = Object.fromEntries(CHANGE_CATEGORIES.map((c) => [c.key, c]));

/** Record fields staff can't change themselves -> the category to ask for. */
export const PROOF_FIELDS = {
  fName: 'name', mName: 'name', lName: 'name', suffix: 'name',
  house_no: 'address', block_lot: 'address', street: 'address', subdivision: 'address',
  zone: 'address', area: 'address', landmark: 'address', residing_since: 'address',
  is_pwd: 'sectors', is_4ps: 'sectors', is_solo_parent: 'sectors', is_indigent: 'sectors',
  philsys_nat_id: 'philsys', valid_id: 'id', email: 'contact', contact_num: 'contact',
};

export const REQUEST_STATES = {
  open: { label: 'Waiting for the resident', tone: 'warn' },
  waiting_code: { label: 'Changed, code not entered yet', tone: 'warn' },
  submitted: { label: 'Proof uploaded: review it on Profile Approvals', tone: 'info' },
  rejected: { label: 'Rejected: waiting for a new upload', tone: 'bad' },
  done: { label: 'Done', tone: 'ok' },
  cancelled: { label: 'Cancelled', tone: 'muted' },
};

/** What the resident sees for each state on Edit Profile. */
export const RESIDENT_REQUEST_STATES = {
  open: 'Please update this',
  waiting_code: 'Enter the verification code to finish',
  submitted: 'Sent: waiting for staff to check your proof',
  rejected: 'Not accepted: please try again',
};
