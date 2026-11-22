import { PB2_BOUNDARY } from '../components/pasongBuaya2Boundary';

/**
 * Street routing for the garbage truck route editor (WasteRouteEditor.jsx).
 *
 * Staff place a few points (start, stops, end); the route between them is
 * found along the barangay's streets, so nobody has to click every corner.
 * The streets come from public/data/pb2_roads.json (OpenStreetMap, saved with
 * the site; rebuilt by scripts/roads/build.mjs), and only street pieces inside
 * Pasong Buaya II are used, because the server refuses a route that leaves it.
 */

const ROADS_URL = '/data/pb2_roads.json';
const METERS_PER_DEGREE = 111320;
// How far from a street a click may land and still count (a click on the
// middle of a block picks the nearest street).
export const MAX_SNAP_METERS = 60;

export const pointInBoundary = ([lat, lng]) => {
  let inside = false;
  for (let i = 0, j = PB2_BOUNDARY.length - 1; i < PB2_BOUNDARY.length; j = i++) {
    const [latI, lngI] = PB2_BOUNDARY[i];
    const [latJ, lngJ] = PB2_BOUNDARY[j];
    if ((latI > lat) !== (latJ > lat) && lng < ((lngJ - lngI) * (lat - latI)) / (latJ - latI) + lngI) {
      inside = !inside;
    }
  }
  return inside;
};

// Streets within this many metres of the boundary line count as inside: some
// run right along it and join the two halves of the street network. The
// server allows 20 m (pb2_point_near_pb2 in issue_map_common.php).
const BOUNDARY_TOLERANCE_METERS = 15;

const distanceToBoundary = (p) => {
  const scale = Math.cos((p[0] * Math.PI) / 180) * METERS_PER_DEGREE;
  const px = p[1] * scale;
  const py = p[0] * METERS_PER_DEGREE;
  let best = Infinity;
  for (let i = 0, j = PB2_BOUNDARY.length - 1; i < PB2_BOUNDARY.length; j = i++) {
    const ax = PB2_BOUNDARY[j][1] * scale; const ay = PB2_BOUNDARY[j][0] * METERS_PER_DEGREE;
    const bx = PB2_BOUNDARY[i][1] * scale; const by = PB2_BOUNDARY[i][0] * METERS_PER_DEGREE;
    const dx = bx - ax; const dy = by - ay;
    const length = dx * dx + dy * dy;
    const t = length ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length)) : 0;
    best = Math.min(best, Math.hypot(px - ax - t * dx, py - ay - t * dy));
  }
  return best;
};

/** Inside the barangay or within the boundary allowance. */
export const pointNearBoundary = (p) => pointInBoundary(p) || distanceToBoundary(p) <= BOUNDARY_TOLERANCE_METERS;

// Sampled every 8 m, finer than the server's 0.0002 degrees (about 22 m).
const segmentNearBoundary = (from, to) => {
  const steps = Math.max(1, Math.ceil(distanceMeters(from, to) / 8));
  for (let step = 1; step < steps; step += 1) {
    const ratio = step / steps;
    if (!pointNearBoundary([from[0] + (to[0] - from[0]) * ratio, from[1] + (to[1] - from[1]) * ratio])) return false;
  }
  return true;
};

export const distanceMeters = (a, b) => {
  const east = (b[1] - a[1]) * METERS_PER_DEGREE * Math.cos((a[0] * Math.PI) / 180);
  const north = (b[0] - a[0]) * METERS_PER_DEGREE;
  return Math.hypot(north, east);
};

const projectOnSegment = (point, a, b) => {
  const scale = Math.cos((point[0] * Math.PI) / 180);
  const dx = (b[1] - a[1]) * scale;
  const dy = b[0] - a[0];
  const px = (point[1] - a[1]) * scale;
  const py = point[0] - a[0];
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1, (px * dx + py * dy) / lengthSquared)) : 0;
  const snapped = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  return { t, point: snapped, distance: distanceMeters(point, snapped) };
};

let roadsPromise = null;
/** The saved street file, read once per page. */
export const loadRoads = () => {
  if (!roadsPromise) {
    roadsPromise = fetch(ROADS_URL, { headers: { Accept: 'application/json' } })
      .then((response) => {
        if (!response.ok) throw new Error(`The street file (data/pb2_roads.json) returned HTTP ${response.status}.`);
        return response.json();
      })
      .then((data) => {
        // [id, name, coordinates]; older files had [id, coordinates].
        const roads = (data.roads || []).map((row) => (row.length === 2
          ? { id: row[0], name: null, coordinates: row[1] }
          : { id: row[0], name: row[1], coordinates: row[2] }));
        if (!roads.length) throw new Error('The street file is empty.');
        return roads;
      })
      .catch((error) => {
        roadsPromise = null; // try again next time
        throw error;
      });
  }
  return roadsPromise;
};

/** A street graph of the pieces inside the barangay. */
export const buildGraph = (roads) => {
  const keyOf = (p) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`;
  const nodeIndex = new Map();
  const nodes = [];
  const adjacency = [];
  const edges = []; // [a, b, name] for snapping
  const nodeFor = (p) => {
    const key = keyOf(p);
    let index = nodeIndex.get(key);
    if (index === undefined) {
      index = nodes.length;
      nodeIndex.set(key, index);
      nodes.push([p[0], p[1]]);
      adjacency.push([]);
    }
    return index;
  };
  const insideCache = new Map();
  const inside = (p) => {
    const key = keyOf(p);
    if (!insideCache.has(key)) insideCache.set(key, pointNearBoundary(p));
    return insideCache.get(key);
  };
  roads.forEach((road) => {
    const c = road.coordinates;
    for (let i = 0; i < c.length - 1; i += 1) {
      if (!inside(c[i]) || !inside(c[i + 1]) || !segmentNearBoundary(c[i], c[i + 1])) continue;
      const a = nodeFor(c[i]);
      const b = nodeFor(c[i + 1]);
      if (a === b) continue;
      const weight = distanceMeters(c[i], c[i + 1]);
      const edge = edges.length;
      edges.push([a, b, road.name]);
      adjacency[a].push([b, weight, edge]);
      adjacency[b].push([a, weight, edge]);
    }
  });
  return { nodes, adjacency, edges };
};

/**
 * The nearest street point to a click, or null when none is close enough.
 * `only` (edge indexes) limits it to one street, e.g. the street typed in the
 * route list, so a click near it lands on it.
 */
export const snapToStreet = (graph, point, maxMeters = MAX_SNAP_METERS, only = null) => {
  let best = null;
  (only || graph.edges.map((_, i) => i)).forEach((edge) => {
    const [a, b] = graph.edges[edge];
    const hit = projectOnSegment(point, graph.nodes[a], graph.nodes[b]);
    if (!best || hit.distance < best.distance) best = { ...hit, edge };
  });
  if (!best || best.distance > maxMeters) return null;
  return best;
};

// A small binary heap for Dijkstra.
class Heap {
  constructor() { this.items = []; }
  get size() { return this.items.length; }
  push(item) {
    const a = this.items;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (a[parent][0] <= a[i][0]) break;
      [a[parent], a[i]] = [a[i], a[parent]];
      i = parent;
    }
  }
  pop() {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

/**
 * The shortest way along the streets between two snapped points.
 * Returns { points, meters, names } or null when they aren't connected.
 */
const routeLeg = (graph, from, to) => {
  const [fa, fb, fName] = graph.edges[from.edge];
  const [ta, tb, tName] = graph.edges[to.edge];
  if (from.edge === to.edge) {
    return { points: [from.point, to.point], meters: distanceMeters(from.point, to.point), names: [fName] };
  }
  const dist = new Map();
  const prev = new Map(); // node -> [previous node or -1 (the start), edge]
  const heap = new Heap();
  const seed = (node, meters) => {
    if (meters < (dist.get(node) ?? Infinity)) {
      dist.set(node, meters);
      prev.set(node, [-1, from.edge]);
      heap.push([meters, node]);
    }
  };
  seed(fa, distanceMeters(from.point, graph.nodes[fa]));
  seed(fb, distanceMeters(from.point, graph.nodes[fb]));
  const targets = new Map([
    [ta, distanceMeters(graph.nodes[ta], to.point)],
    [tb, distanceMeters(graph.nodes[tb], to.point)],
  ]);
  let best = Infinity;
  let bestNode = -1;
  while (heap.size) {
    const [meters, node] = heap.pop();
    if (meters > (dist.get(node) ?? Infinity)) continue;
    if (meters >= best) break;
    if (targets.has(node) && meters + targets.get(node) < best) {
      best = meters + targets.get(node);
      bestNode = node;
    }
    graph.adjacency[node].forEach(([next, weight, edge]) => {
      const total = meters + weight;
      if (total < (dist.get(next) ?? Infinity)) {
        dist.set(next, total);
        prev.set(next, [node, edge]);
        heap.push([total, next]);
      }
    });
  }
  if (bestNode < 0) return null;
  const nodePath = [];
  const edgePath = [];
  for (let node = bestNode; node !== -1;) {
    nodePath.push(node);
    const [before, edge] = prev.get(node);
    edgePath.push(edge);
    node = before;
  }
  nodePath.reverse();
  edgePath.reverse();
  const names = edgePath.map((edge) => graph.edges[edge][2]);
  names.push(tName);
  return {
    points: [from.point, ...nodePath.map((node) => graph.nodes[node]), to.point],
    meters: best,
    names,
  };
};

const sameSpot = (a, b) => Math.abs(a[0] - b[0]) < 1e-7 && Math.abs(a[1] - b[1]) < 1e-7;

/**
 * The full route through the waypoints in order.
 * Returns { points, meters, streets, brokenLeg } — brokenLeg is the index of
 * the first pair that no street connects (or -1).
 */
export const routeThrough = (graph, waypoints) => {
  const snapped = waypoints.map((p) => snapToStreet(graph, p, Infinity));
  const points = [];
  const names = [];
  let meters = 0;
  for (let i = 0; i < snapped.length - 1; i += 1) {
    if (!snapped[i] || !snapped[i + 1]) return { points: [], meters: 0, streets: [], brokenLeg: i };
    const leg = routeLeg(graph, snapped[i], snapped[i + 1]);
    if (!leg) return { points: [], meters: 0, streets: [], brokenLeg: i };
    leg.points.forEach((p) => { if (!points.length || !sameSpot(points[points.length - 1], p)) points.push(p); });
    names.push(...leg.names);
    meters += leg.meters;
  }
  if (snapped.length === 1 && snapped[0]) {
    points.push(snapped[0].point);
    names.push(graph.edges[snapped[0].edge][2]);
  }
  // Each street once, in the order the truck first reaches it (a truck often
  // goes in and back out of a street; residents only need to know it passes).
  const streets = [];
  const seen = new Set();
  names.forEach((name) => {
    const clean = (name || '').trim();
    const key = streetNameKey(clean);
    if (clean && !seen.has(key)) { seen.add(key); streets.push(clean); }
  });
  return {
    points: points.map(([lat, lng]) => [Math.round(lat * 1e6) / 1e6, Math.round(lng * 1e6) / 1e6]),
    meters,
    streets,
    brokenLeg: -1,
  };
};

/** At most `max` points of a saved route, evenly spread, first and last kept. */
export const samplePoints = (points, max = 12) => {
  if (points.length <= max) return points.slice();
  const out = [];
  for (let i = 0; i < max; i += 1) out.push(points[Math.round((i * (points.length - 1)) / (max - 1))]);
  return out;
};

export const formatDistance = (meters) => (meters >= 1000
  ? `${(meters / 1000).toFixed(1)} km`
  : `${Math.round(meters / 10) * 10} m`);

/** Street names compared without case, dots or extra spaces. */
export const streetNameKey = (name) => String(name || '').toLowerCase().replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();

/** The named streets inside the barangay, sorted, for suggestions. */
export const streetNames = (graph) => {
  const names = new Map();
  graph.edges.forEach(([, , name]) => { if (name) names.set(streetNameKey(name), name); });
  return [...names.values()].sort((a, b) => a.localeCompare(b));
};

/**
 * The street pieces whose name matches what was typed (whole name first,
 * else names starting with it, else containing it), as edge indexes.
 */
export const edgesNamed = (graph, typed) => {
  const key = streetNameKey(typed);
  if (key.length < 3) return [];
  const pick = (test) => graph.edges.reduce((list, [, , name], i) => (name && test(streetNameKey(name)) ? [...list, i] : list), []);
  let found = pick((k) => k === key);
  if (!found.length) found = pick((k) => k.startsWith(key));
  if (!found.length) found = pick((k) => k.includes(key));
  return found;
};

/** The street name of a snapped point. */
export const edgeName = (graph, edge) => (edge == null ? null : graph.edges[edge]?.[2] || null);
