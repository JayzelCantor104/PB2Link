// Display helpers shared by the admin amenity pages (AmenityDashboard.jsx, AmenityDetail.jsx).

const pad = (n) => String(n).padStart(2, '0');

export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// "14:30" -> "2:30 PM"
export const to12h = (hhmm) => {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`;
};

export const longDate = (s) => (s
  ? new Date(`${s}T00:00:00`).toLocaleDateString('en-PH', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })
  : '');

// CSS class for a booking status (see AmenityDashboard.css .st-*).
export const stClass = (status) => `st-${String(status || 'pending').toLowerCase()}`;

// Booking photos are saved under backend/api/uploads/..., served through the /api_backend proxy.
export const amenityFileUrl = (path) => (path
  ? `/api_backend/${String(path).replace(/^(\.\.\/)+/, '').replace(/^\/+/, '')}`
  : null);

// Bookings made since migration 010 reuse the resident's registration ID
// (stored under Resident_submitted_valid_ID/); older ones carry photos taken
// for that booking.
export const verificationPhotosLabel = (b) => (String(b?.id_front || '').includes('Resident_submitted_valid_ID/')
  ? 'Valid ID on File (from Registration)'
  : 'Verification Photos');

// "8:00 AM – 12:00 PM" for timed bookings, "20 unit(s) of 150" for equipment.
export const bookingWhen = (b) => (b.category === 'Equipment'
  ? `${b.quantity} unit(s)${b.total_quantity ? ` of ${b.total_quantity}` : ''}`
  : b.start_time ? `${to12h(b.start_time)} – ${to12h(b.end_time)}` : (b.time_slot || '—'));
