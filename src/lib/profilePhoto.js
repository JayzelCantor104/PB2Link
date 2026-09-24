// residents.profile_picture is stored relative to backend/api/ (register.php
// writes "uploads/Resident_submitted_valid_ID/<control_num>/profile_picture.jpg"),
// so it is served through the /api_backend proxy, not /uploads_backend.
export const getProfilePhotoUrl = (path) => {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  const normalized = path.replace(/^(\.\.\/)+/, '').replace(/^api\//, '').replace(/^\/+/, '');
  return `/api_backend/${normalized}`;
};

export const getInitial = (user) =>
  (user?.fName || user?.email || '?').trim().charAt(0).toUpperCase();

// "CANTOR" / "JAYZEL MARIE" -> "Cantor" / "Jayzel Marie" (names are stored uppercase).
const titleCase = (s = '') => s.toLowerCase().replace(/(^|[\s-])\S/g, (c) => c.toUpperCase());

// Header/avatar label: "Last Name, First Name", falling back to whatever exists.
export const getDisplayName = (user) => {
  const first = titleCase((user?.fName || '').trim());
  const last = titleCase((user?.lName || '').trim());
  if (last && first) return `${last}, ${first}`;
  return first || last || user?.email?.split('@')[0] || '';
};
