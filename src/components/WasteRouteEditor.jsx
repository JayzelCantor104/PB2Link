import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Polygon, Polyline, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { PB2_BOUNDARY } from './pasongBuaya2Boundary';
import { makeRouteIcon, routeArrows } from './wasteRouteIcons';
import {
  buildGraph, distanceMeters, edgeName, edgesNamed, formatDistance, loadRoads, routeThrough, snapToStreet, streetNames,
} from '../lib/roadRouting';
import 'leaflet/dist/leaflet.css';
import './WasteRouteMap.css';

const BOUNDARY_BOUNDS = L.latLngBounds(PB2_BOUNDARY);
const MAP_BOUNDS = BOUNDARY_BOUNDS.pad(0.25);
// Shade everything outside the barangay, like the Issue Map.
const OUTSIDE_MASK = [[[-90, -180], [-90, 180], [90, 180], [90, -180]], PB2_BOUNDARY];
const MAX_POINTS = 40;

let graphPromise = null;
const loadGraph = () => {
  if (!graphPromise) {
    graphPromise = loadRoads().then(buildGraph).catch((error) => { graphPromise = null; throw error; });
  }
  return graphPromise;
};

const FitOnce = ({ points }) => {
  const map = useMap();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    map.setMinZoom(14);
    map.setMaxZoom(19);
    map.setMaxBounds(MAP_BOUNDS);
    if (points.length > 1) map.fitBounds(points, { padding: [40, 40], maxZoom: 17 });
    else map.fitBounds(BOUNDARY_BOUNDS, { padding: [8, 8] });
  }, [map, points]);
  // The pop-up grows as it opens; Leaflet must re-measure, or clicks land
  // away from the pointer and the outside shading is cut off. The first
  // framing is redone while the map was still small.
  const startPoints = useRef(points);
  useEffect(() => {
    const el = map.getContainer();
    let last = `${el.clientWidth}x${el.clientHeight}`;
    let wasSmall = el.clientWidth < 200 || el.clientHeight < 150;
    const observer = new ResizeObserver(() => {
      const now = `${el.clientWidth}x${el.clientHeight}`;
      if (now === last) return;
      last = now;
      map.invalidateSize();
      if (wasSmall && el.clientWidth >= 200 && el.clientHeight >= 150) {
        wasSmall = false;
        const p = startPoints.current;
        if (p.length > 1) map.fitBounds(p, { padding: [40, 40], maxZoom: 17, animate: false });
        else map.fitBounds(BOUNDARY_BOUNDS, { padding: [8, 8], animate: false });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [map]);
  return null;
};

// Brings a highlighted street into view, once typing pauses.
const FitHighlight = ({ lines }) => {
  const map = useMap();
  const key = lines.length ? `${lines.length}:${lines[0][0]}` : '';
  useEffect(() => {
    if (!lines.length) return undefined;
    const timer = setTimeout(() => map.fitBounds(lines.flat(), { padding: [60, 60], maxZoom: 17 }), 450);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);
  return null;
};

const ClickToAdd = ({ onClick }) => {
  useMapEvents({ click: (event) => onClick([event.latlng.lat, event.latlng.lng]) });
  return null;
};

const pathLength = (points) => points.slice(1).reduce((sum, p, i) => sum + distanceMeters(points[i], p), 0);

/**
 * Garbage truck route editor: a large map and, beside it, the route as a list
 * of streets. The two stay in step:
 *  - click where the truck starts and where it ends: the route is found along
 *    the streets and the list fills in by itself;
 *  - type a street in the list: it lights up on the map, and the next click
 *    near it lands on it;
 *  - drag a pin, or click the line to add a stop, and the list follows.
 *
 * Controlled: `waypoints` (the pins), `path` (the route along the streets) and
 * `stops` (the written list residents read) come from the form. Map changes
 * call onChange({ waypoints, path, streets }) and onStopsChange(streets);
 * typing calls onStopsChange(stops). `onMessage(text, type)` shows a notice.
 */
const WasteRouteEditor = ({ waypoints, path, stops, onChange, onStopsChange, onMessage }) => {
  const [graph, setGraph] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [activeRow, setActiveRow] = useState(-1);
  const inputRefs = useRef([]);

  useEffect(() => {
    let cancelled = false;
    loadGraph()
      .then((g) => { if (!cancelled) { setGraph(g); setStatus('ready'); } })
      .catch((e) => { if (!cancelled) { setError(e.message); setStatus('error'); } });
    return () => { cancelled = true; };
  }, []);

  const retry = () => {
    setStatus('loading');
    setError('');
    loadGraph()
      .then((g) => { setGraph(g); setStatus('ready'); })
      .catch((e) => { setError(e.message); setStatus('error'); });
  };

  const names = useMemo(() => (graph ? streetNames(graph) : []), [graph]);
  const rows = stops.length ? stops : [''];

  // The street being typed or picked in the list, lit up on the map.
  const highlightText = activeRow >= 0 ? String(stops[activeRow] ?? '') : '';
  const highlight = useMemo(() => {
    if (!graph) return { edges: [], lines: [] };
    const edges = edgesNamed(graph, highlightText);
    return { edges, lines: edges.map((e) => [graph.nodes[graph.edges[e][0]], graph.nodes[graph.edges[e][1]]]) };
  }, [graph, highlightText]);
  const highlightEdges = highlight.edges;
  const highlightLines = highlight.lines;

  // Path index where each pin lands, to know which part of the line a click belongs to.
  const waypointAt = useMemo(() => waypoints.map((w) => {
    let best = 0;
    let bestDistance = Infinity;
    path.forEach((p, i) => {
      const d = distanceMeters(p, w);
      if (d < bestDistance) { bestDistance = d; best = i; }
    });
    return best;
  }), [waypoints, path]);

  const apply = (next) => {
    if (!graph) return false;
    if (next.length > MAX_POINTS) {
      onMessage?.(`A route can have up to ${MAX_POINTS} points. Drag the existing ones instead.`);
      return false;
    }
    if (!next.length) {
      onChange({ waypoints: [], path: [], streets: [] });
      onStopsChange([]);
      return true;
    }
    const result = routeThrough(graph, next);
    if (result.brokenLeg >= 0) {
      onMessage?.('No street inside Pasong Buaya II connects those two points. Choose a spot on a connected street.');
      return false;
    }
    onChange({ waypoints: next, path: next.length < 2 ? [] : result.points, streets: result.streets });
    // The list follows the map; the row being typed in keeps its text until then.
    onStopsChange(result.streets);
    return true;
  };

  // A click lands on the street lit up in the list when it is close to it,
  // otherwise on the nearest street.
  const snapped = (point) => {
    if (!graph) return null;
    const hit = (highlightEdges.length && snapToStreet(graph, point, undefined, highlightEdges)) || snapToStreet(graph, point);
    if (!hit) {
      onMessage?.('Click on a street inside Pasong Buaya II (the clear area inside the dashed line).');
      return null;
    }
    return hit;
  };

  const addAtEnd = (point) => {
    const hit = snapped(point);
    if (!hit) return;
    if (apply([...waypoints, hit.point])) {
      setActiveRow(-1);
      if (!waypoints.length) onMessage?.(`Start set on ${edgeName(graph, hit.edge) || 'this street'}. Now click where the truck ends.`, 'info');
    }
  };

  // Returns false when the new spot can't be used (the pin then goes back).
  const moveTo = (index, point) => {
    const hit = snapped(point);
    if (!hit) return false;
    const next = waypoints.slice();
    next[index] = hit.point;
    return apply(next);
  };

  const insertOnLine = (point) => {
    const hit = snapped(point);
    if (!hit || waypoints.length < 2) return;
    let nearest = 0;
    let nearestDistance = Infinity;
    path.forEach((q, i) => {
      const d = distanceMeters(q, hit.point);
      if (d < nearestDistance) { nearestDistance = d; nearest = i; }
    });
    let leg = 0;
    for (let i = 0; i < waypointAt.length - 1; i += 1) if (waypointAt[i] <= nearest) leg = i;
    const next = [...waypoints.slice(0, leg + 1), hit.point, ...waypoints.slice(leg + 1)];
    if (apply(next)) onMessage?.('Stop added. Drag it onto the street the truck should take.', 'info');
  };

  const remove = (index) => apply(waypoints.filter((_, i) => i !== index));

  const typeRow = (index, value) => {
    const next = rows.slice();
    next[index] = value;
    onStopsChange(next);
    setActiveRow(index);
  };
  const addRow = () => {
    onStopsChange([...rows, '']);
    setActiveRow(rows.length);
    setTimeout(() => inputRefs.current[rows.length]?.focus(), 0);
  };
  const removeRow = (index) => {
    onStopsChange(rows.filter((_, i) => i !== index));
    setActiveRow(-1);
  };

  const ready = status === 'ready';
  const step = waypoints.length === 0 ? 1 : waypoints.length === 1 ? 2 : 3;
  const meters = pathLength(path);
  const arrows = useMemo(() => routeArrows(path, 120), [path]);

  return (
    <div className="wre">
      <ol className="wre-steps" aria-label="How to draw the route">
        <li className={step === 1 ? 'is-current' : 'is-done'}><b>1</b> Click where the truck starts</li>
        <li className={step === 2 ? 'is-current' : step > 2 ? 'is-done' : ''}><b>2</b> Click where it ends</li>
        <li className={step === 3 ? 'is-current' : ''}><b>3</b> Drag a pin or click the line to adjust</li>
      </ol>

      <div className="wre-body">
        <div className="wre-map-col">
          <div className="wre-tools" role="toolbar" aria-label="Route tools">
            <button type="button" className="wre-tool" disabled={!ready || !waypoints.length} onClick={() => apply(waypoints.slice(0, -1))}>
              <i className="bi bi-arrow-counterclockwise" aria-hidden="true"></i> Undo
            </button>
            <button type="button" className="wre-tool" disabled={!ready || waypoints.length < 2} onClick={() => apply([...waypoints, waypoints[0]])} title="The truck goes back to where it started">
              <i className="bi bi-arrow-repeat" aria-hidden="true"></i> Back to start
            </button>
            <button type="button" className="wre-tool" disabled={!ready || waypoints.length < 2} onClick={() => apply(waypoints.slice().reverse())} title="Swap the start and the end">
              <i className="bi bi-arrow-left-right" aria-hidden="true"></i> Reverse
            </button>
            <button type="button" className="wre-tool wre-tool-danger" disabled={!ready || !waypoints.length} onClick={() => apply([])}>
              <i className="bi bi-trash" aria-hidden="true"></i> Clear
            </button>
            {path.length > 1 && <span className="wre-length"><i className="bi bi-signpost-split" aria-hidden="true"></i> {formatDistance(meters)}</span>}
          </div>

          <div role="region" aria-label="Map for drawing the garbage truck route" className="waste-route-map-frame is-editable wre-map">
            <p className="sr-only">Drawing the route needs a mouse or touch. The street list beside the map can be typed instead.</p>
            <MapContainer
              center={BOUNDARY_BOUNDS.getCenter()}
              zoom={15}
              minZoom={14}
              maxZoom={19}
              zoomSnap={0.25}
              scrollWheelZoom
              doubleClickZoom={false}
              maxBounds={MAP_BOUNDS}
              maxBoundsViscosity={1}
              className="waste-route-map-canvas"
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                maxZoom={19}
              />
              <Polygon positions={OUTSIDE_MASK} interactive={false} pathOptions={{ stroke: false, fillColor: '#1f2937', fillOpacity: 0.35 }} />
              <Polygon positions={PB2_BOUNDARY} interactive={false} pathOptions={{ color: '#16845b', weight: 3, dashArray: '8 6', fill: false }} />
              <FitOnce points={path.length > 1 ? path : waypoints} />
              <FitHighlight lines={highlightLines} />
              {ready && <ClickToAdd onClick={addAtEnd} />}
              {highlightLines.length > 0 && (
                <Polyline positions={highlightLines} interactive={false} pathOptions={{ color: '#f59e0b', weight: 14, opacity: 0.55, lineCap: 'round' }} />
              )}
              {path.length > 1 && (
                <>
                  <Polyline positions={path} interactive={false} pathOptions={{ color: '#fff', weight: 11, opacity: 0.9, lineCap: 'round', lineJoin: 'round' }} />
                  <Polyline
                    positions={path}
                    pathOptions={{ color: '#047857', weight: 7, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }}
                    eventHandlers={{
                      click: (event) => {
                        L.DomEvent.stopPropagation(event);
                        insertOnLine([event.latlng.lat, event.latlng.lng]);
                      },
                    }}
                  />
                  {arrows.map((arrow) => (
                    <Marker key={arrow.key} position={arrow.position} icon={arrow.icon} interactive={false} keyboard={false} />
                  ))}
                </>
              )}
              {waypoints.map((point, index) => {
                const isStart = index === 0;
                const isEnd = index === waypoints.length - 1 && waypoints.length > 1;
                const type = isStart ? 'start' : isEnd ? 'end' : 'point';
                const name = isStart ? 'Truck starts here' : isEnd ? 'Route ends here' : `Stop ${index}`;
                return (
                  <Marker
                    key={`wp-${index}-${point[0]}-${point[1]}`}
                    position={point}
                    icon={makeRouteIcon(type, type === 'point' ? String(index) : '')}
                    title={`${name} (drag to move)`}
                    draggable={ready}
                    eventHandlers={{
                      dragend: (event) => {
                        const ll = event.target.getLatLng();
                        if (!moveTo(index, [ll.lat, ll.lng])) event.target.setLatLng(point);
                      },
                    }}
                  >
                    <Popup>
                      <strong>{name}</strong>
                      <br />
                      Drag the pin to move it.
                      <br />
                      <button type="button" className="waste-route-popup-remove" onClick={() => remove(index)}>
                        Remove this point
                      </button>
                    </Popup>
                  </Marker>
                );
              })}
            </MapContainer>
            {status === 'loading' && <div className="waste-route-road-status" role="status">Loading the barangay streets…</div>}
            {status === 'error' && (
              <div className="waste-route-road-status is-error" role="alert">
                <span>The street list couldn't be loaded{error ? `: ${error}` : ''}.</span>
                <button type="button" className="waste-route-road-retry" onClick={retry}>Try again</button>
              </div>
            )}
          </div>
        </div>

        <aside className="wre-panel" aria-labelledby="wre-panel-title">
          <div className="wre-panel-head">
            <h3 id="wre-panel-title">Streets, in order</h3>
            <p>Fills in as you draw. Type a street to find it on the map, then click the exact spot.</p>
          </div>
          <datalist id="wre-street-names">
            {names.map((name) => <option key={name} value={name} />)}
          </datalist>
          <ol className="wre-list">
            {rows.map((stop, index) => {
              const isStart = index === 0;
              const isEnd = index === rows.length - 1 && rows.length > 1;
              const found = activeRow === index && highlightText.trim().length >= 3 ? highlightEdges.length > 0 : null;
              const label = isStart ? 'Start' : isEnd ? 'End' : `Street ${index + 1}`;
              return (
                <li key={`row-${index}`} className={`wre-row${isStart ? ' is-start' : ''}${isEnd ? ' is-end' : ''}${activeRow === index ? ' is-active' : ''}`}>
                  <span className="wre-dot" aria-hidden="true">
                    {isStart ? <i className="bi bi-truck-front-fill"></i> : isEnd ? <i className="bi bi-flag-fill"></i> : index + 1}
                  </span>
                  <div className="wre-field">
                    <label htmlFor={`wre-stop-${index}`}>{label}</label>
                    <input
                      id={`wre-stop-${index}`}
                      ref={(el) => { inputRefs.current[index] = el; }}
                      type="text"
                      list="wre-street-names"
                      autoComplete="off"
                      placeholder={isStart ? 'Type or click the start street' : 'Next street'}
                      value={stop}
                      onFocus={() => setActiveRow(index)}
                      onChange={(e) => typeRow(index, e.target.value)}
                      aria-describedby={found !== null ? `wre-stop-${index}-hint` : undefined}
                    />
                    {found === true && <small id={`wre-stop-${index}-hint`} className="wre-hint is-found"><i className="bi bi-geo-alt-fill" aria-hidden="true"></i> Shown in yellow on the map. Click the exact spot.</small>}
                    {found === false && <small id={`wre-stop-${index}-hint`} className="wre-hint">Not a street on the map. It can still be written here.</small>}
                  </div>
                  {rows.length > 1 && (
                    <button type="button" className="wre-row-remove" onClick={() => removeRow(index)} aria-label={`Remove ${stop || label}`}>
                      <i className="bi bi-x-lg" aria-hidden="true"></i>
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
          <button type="button" className="wre-add" onClick={addRow}>
            <i className="bi bi-plus-lg" aria-hidden="true"></i> Add the next street
          </button>
        </aside>
      </div>
    </div>
  );
};

export default WasteRouteEditor;
