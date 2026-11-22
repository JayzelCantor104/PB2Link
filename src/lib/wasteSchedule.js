import { parseRouteStreets } from './wasteRoute';

/**
 * Garbage schedule helpers for the resident Waste Management page: which days
 * a schedule runs, when the truck next comes, and whether it passes a street.
 */

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Weekday numbers (0 = Sunday) named in "Monday & Thursday", "Mon, Thu", "Daily"... */
export const scheduleWeekdays = (collectionDay = '') => {
  const text = collectionDay.toLowerCase();
  if (/daily|every ?day|araw-araw/.test(text)) return [0, 1, 2, 3, 4, 5, 6];
  return WEEKDAYS.map((name, i) => (new RegExp(`\\b${name.slice(0, 3).toLowerCase()}`).test(text) ? i : -1)).filter((i) => i >= 0);
};

const pad = (n) => String(n).padStart(2, '0');
export const dateValue = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** The next date (today included) the schedule runs, or null. */
export const nextPickupDate = (schedule, from = new Date()) => {
  if (schedule.status === 'Suspended' || schedule.status === 'Completed') return null;
  const days = scheduleWeekdays(schedule.collection_day);
  if (!days.length) return null;
  for (let add = 0; add < 7; add += 1) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + add, 12);
    if (days.includes(d.getDay())) return d;
  }
  return null;
};

/** "Today", "Tomorrow" or "Thursday, Nov 19". */
export const friendlyDate = (d, from = new Date()) => {
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 12);
  const diff = Math.round((d - today) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric' }).format(d);
};

// Street names compared without case, dots or the usual endings, so
// "Kapatiran Rd." finds "KAPATIRAN ROAD".
const streetKey = (name) => name.toLowerCase()
  .replace(/[.,]/g, ' ')
  .replace(/\b(street|st|road|rd|drive|dr|avenue|ave|extension|ext)\b/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

/** The streets a schedule passes: from the map (route_streets) and the written route. */
export const scheduleStreets = (schedule) => {
  const fromMap = parseRouteStreets(schedule.route_streets);
  const written = String(schedule.truck_route || '').split(/->|→|,|;/).map((s) => s.trim()).filter(Boolean);
  const seen = new Set();
  return [...fromMap, ...written].filter((name) => {
    const key = streetKey(name);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/** Does the schedule pass (or cover the area named by) the typed street? */
export const schedulePassesStreet = (schedule, query) => {
  const key = streetKey(query || '');
  if (key.length < 3) return false;
  if (streetKey(schedule.zone_area || '').includes(key)) return true;
  return scheduleStreets(schedule).some((name) => {
    const k = streetKey(name);
    return k.includes(key) || (k.length >= 3 && key.includes(k));
  });
};
