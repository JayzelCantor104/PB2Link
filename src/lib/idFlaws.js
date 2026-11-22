// Problems staff can tick when an ID, selfie or PhilSys card doesn't pass
// review (ResidentProfile's check review, "Ask for action", Profile
// Approvals). Mirrors PB2_ID_FLAWS / PB2_ID_FLAWS_FOR in
// backend/api/id_flaws.php, which the server checks and stores
// (resident_check_reviews.flaws, migration 056). The resident is told in the
// same words.

export const ID_FLAWS = {
  blurry: 'Blurry or out of focus',
  glare: 'Glare or reflection covers part of it',
  dark: 'Too dark or too bright',
  cropped: 'Cut off: part of the ID is missing',
  unreadable: "Text on the ID can't be read",
  wrong_side: 'Wrong side, or front and back are the same photo',
  screen_copy: 'A photo of a screen or a photocopy, not the card itself',
  expired: 'The ID is expired',
  not_accepted: 'Not one of the accepted IDs',
  tampered: 'The ID looks edited or tampered with',
  name_mismatch: "The name on the ID doesn't match the details given",
  birth_mismatch: "The birth date on the ID doesn't match the details given",
  face_mismatch: "The face doesn't match the photo on the ID",
  id_not_visible: "The ID isn't clearly visible in the selfie",
  number_mismatch: "The PhilSys number doesn't match the card",
  address_not_pb2: "The address on the ID isn't in Pasong Buaya II",
};

// Which problems fit which check (check keys of admin_residents.php review_check).
export const ID_FLAWS_FOR = {
  id: ['blurry', 'glare', 'dark', 'cropped', 'unreadable', 'wrong_side', 'screen_copy', 'expired', 'not_accepted', 'tampered', 'name_mismatch', 'birth_mismatch'],
  selfie: ['blurry', 'dark', 'face_mismatch', 'id_not_visible', 'screen_copy'],
  philsys: ['blurry', 'glare', 'cropped', 'unreadable', 'wrong_side', 'screen_copy', 'tampered', 'name_mismatch', 'number_mismatch'],
  address: ['blurry', 'unreadable', 'address_not_pb2'],
};

/** "Blurry or out of focus; The ID is expired." for a note or a notice. */
export const flawSentence = (keys) => keys.map((k) => ID_FLAWS[k]).filter(Boolean).join('; ') + (keys.length ? '.' : '');
