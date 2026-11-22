export const parseRoutePoints = (value) => {
  let points = value;
  if (typeof points === 'string') {
    try {
      points = JSON.parse(points);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(points)) return [];
  return points
    .filter((point) => Array.isArray(point) && point.length === 2)
    .map((point) => [Number(point[0]), Number(point[1])])
    .filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1]));
};

/** The street names a route passes, in order (waste_schedules.route_streets). */
export const parseRouteStreets = (value) => {
  let streets = value;
  if (typeof streets === 'string') {
    try {
      streets = JSON.parse(streets);
    } catch {
      return [];
    }
  }
  return Array.isArray(streets) ? streets.filter((name) => typeof name === 'string' && name.trim()) : [];
};
