import L from 'leaflet';
import './IssueMap.css';
import { CATEGORY_LOOKUP, OPEN_STATUSES, TIER_COLORS } from './issueMapConfig';

/** Flag marker for a community issue, coloured by report tier (grey once closed). */
export const flagIcon = (issue, selected = false) => {
  const cat = CATEGORY_LOOKUP[issue.category] || { emoji: '❗' };
  const closed = !OPEN_STATUSES.includes(issue.status);
  const color = closed ? '#64748b' : TIER_COLORS[issue.tier] || TIER_COLORS.yellow;
  const count = issue.report_count > 99 ? '99+' : issue.report_count;
  return L.divIcon({
    className: 'issue-flag-wrap',
    html: `<div class="issue-flag${selected ? ' is-selected' : ''}${closed ? ' is-closed' : ''}${issue.mine ? ' is-mine' : ''}" style="--flag:${color}">
             <span class="issue-flag-cloth"><span class="issue-flag-emoji">${closed ? '✔️' : cat.emoji}</span></span>
             <span class="issue-flag-pole"></span>
             <span class="issue-flag-count">${count}</span>
           </div>`,
    iconSize: [44, 52],
    iconAnchor: [6, 50],
  });
};
