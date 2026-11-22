import L from 'leaflet';
import { distanceMeters } from '../lib/roadRouting';

/** Colours for several routes on one map, in a fixed order (each is 4.5:1 or more on white). */
export const ROUTE_COLORS = ['#047857', '#1d4ed8', '#b45309', '#7c3aed', '#be123c', '#0e7490', '#4d7c0f', '#9d174d'];

/** Map pins for garbage truck routes (WasteRouteMap and WasteRouteEditor). */
export const makeRouteIcon = (type, label = '') => {
  const icon = type === 'start' ? 'bi-truck-front-fill' : type === 'end' ? 'bi-flag-fill' : '';
  return L.divIcon({
    className: `waste-route-marker-wrap waste-route-marker-${type}`,
    html: `<span class="waste-route-marker">${icon ? `<i class="bi ${icon}" aria-hidden="true"></i>` : ''}${label ? `<b>${label}</b>` : ''}</span>`,
    iconSize: type === 'point' ? [26, 26] : [38, 38],
    iconAnchor: type === 'point' ? [13, 13] : [19, 34],
    popupAnchor: [0, -30],
  });
};

const makeArrowIcon = (bearing, color) => L.divIcon({
  className: 'waste-route-arrow-wrap',
  html: `<span class="waste-route-arrow" style="transform:rotate(${bearing - 90}deg)${color ? `;color:${color}` : ''}" aria-hidden="true">➤</span>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

const getBearing = ([lat1, lng1], [lat2, lng2]) => {
  const rad = (degrees) => (degrees * Math.PI) / 180;
  const y = Math.sin(rad(lng2 - lng1)) * Math.cos(rad(lat2));
  const x = Math.cos(rad(lat1)) * Math.sin(rad(lat2)) - Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(rad(lng2 - lng1));
  return (Math.atan2(y, x) * 180) / Math.PI;
};

/**
 * Direction arrows spaced along the route (one every `spacing` meters), so a
 * route drawn along every street corner doesn't get an arrow per corner.
 */
export const routeArrows = (points, spacing = 140, color = '') => {
  const arrows = [];
  let carried = spacing / 2;
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const length = distanceMeters(a, b);
    if (!length) continue;
    let along = carried;
    while (along <= length) {
      const t = along / length;
      arrows.push({ key: `${i}-${Math.round(along)}`, position: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], icon: makeArrowIcon(getBearing(a, b), color) });
      along += spacing;
    }
    carried = along - length;
  }
  return arrows;
};
