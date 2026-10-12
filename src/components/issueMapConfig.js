// Community Issue Map (migration 019). Mirrors PB2_ISSUE_CATEGORIES and the
// status rules in backend/api/issue_map_common.php — the server enforces them.
import { PB2_BOUNDARY } from './pasongBuaya2Boundary';

export const ISSUE_CATEGORIES = [
  { value: 'streetlight', label: 'Broken Streetlight', emoji: '💡' },
  { value: 'illegal_dumping', label: 'Illegal Dumping', emoji: '🗑️' },
  { value: 'road_damage', label: 'Road Damage', emoji: '🚧' },
  { value: 'flooding', label: 'Flooding', emoji: '🌊' },
  { value: 'stray_animals', label: 'Stray Animals', emoji: '🐕' },
  { value: 'noise', label: 'Noise Complaint', emoji: '🔊' },
  { value: 'fire_hazard', label: 'Fire Hazard', emoji: '🔥' },
  { value: 'water', label: 'Water Problem', emoji: '💧' },
];
export const CATEGORY_LOOKUP = Object.fromEntries(ISSUE_CATEGORIES.map((c) => [c.value, c]));

// Flag colour by number of reports; thresholds come from the server
// (system_settings 'issue_flag_tiers' = minimums for orange, red, purple).
export const DEFAULT_TIERS = [2, 5, 10];
export const TIER_COLORS = {
  yellow: '#eab308',
  orange: '#f97316',
  red: '#dc2626',
  purple: '#7c3aed',
};
export const tierOf = (count, tiers = DEFAULT_TIERS) => {
  if (count >= tiers[2]) return 'purple';
  if (count >= tiers[1]) return 'red';
  if (count >= tiers[0]) return 'orange';
  return 'yellow';
};
// Staff heatmap colours, in the same order as the flag tiers.
export const HEAT_GRADIENT = { 0.25: TIER_COLORS.yellow, 0.5: TIER_COLORS.orange, 0.75: TIER_COLORS.red, 1: TIER_COLORS.purple };

/** Legend rows: [{ tier, label: '1 report' | '2–4 reports' | '10+ reports' }]. */
export const tierLegend = (tiers = DEFAULT_TIERS) => {
  const range = (lo, hi) => (lo === hi ? `${lo}` : `${lo}–${hi}`);
  return [
    { tier: 'yellow', label: `${range(1, tiers[0] - 1)} report${tiers[0] - 1 > 1 ? 's' : ''}` },
    { tier: 'orange', label: `${range(tiers[0], tiers[1] - 1)} reports` },
    { tier: 'red', label: `${range(tiers[1], tiers[2] - 1)} reports` },
    { tier: 'purple', label: `${tiers[2]}+ reports` },
  ];
};

export const OPEN_STATUSES = ['Reported', 'Acknowledged', 'In Progress'];
export const STATUS_STYLE = {
  Reported: { cls: 'is-reported', icon: 'bi-flag-fill' },
  Acknowledged: { cls: 'is-ack', icon: 'bi-eye-fill' },
  'In Progress': { cls: 'is-progress', icon: 'bi-tools' },
  Resolved: { cls: 'is-resolved', icon: 'bi-check-circle-fill' },
  Rejected: { cls: 'is-rejected', icon: 'bi-x-circle-fill' },
  Merged: { cls: 'is-merged', icon: 'bi-intersect' },
};

export const COMMENT_MAX = 500;
export const LANDMARK_MAX = 150;

/** Same ray-casting test the server runs (pb2_point_in_pb2). */
export const isInsidePb2 = (lat, lng) => {
  let inside = false;
  for (let i = 0, j = PB2_BOUNDARY.length - 1; i < PB2_BOUNDARY.length; j = i++) {
    const [yi, xi] = PB2_BOUNDARY[i];
    const [yj, xj] = PB2_BOUNDARY[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

export const formatIssueDate = (value, withTime = false) => {
  if (!value) return '';
  const d = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('en-PH', withTime
    ? { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }
    : { month: 'short', day: 'numeric', year: 'numeric' });
};
