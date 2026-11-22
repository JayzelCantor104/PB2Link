import React, { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Polygon, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import { PB2_BOUNDARY } from './pasongBuaya2Boundary';
import { parseRoutePoints } from '../lib/wasteRoute';
import { makeRouteIcon, routeArrows, ROUTE_COLORS } from './wasteRouteIcons';
import 'leaflet/dist/leaflet.css';
import './WasteRouteMap.css';

const BOUNDARY_BOUNDS = L.latLngBounds(PB2_BOUNDARY);
const MAP_BOUNDS = BOUNDARY_BOUNDS.pad(0.25);
// Shade everything outside the barangay, like the Issue Map.
const OUTSIDE_MASK = [[[-90, -180], [-90, 180], [90, 180], [90, -180]], PB2_BOUNDARY];

const FitRoutes = ({ routes, focusId }) => {
  const map = useMap();
  const key = routes.map((r) => `${r.id}:${r.points.length}`).join('|') + `#${focusId ?? ''}`;
  const fitRef = useRef(() => {});
  useEffect(() => {
    fitRef.current = () => {
      const focus = routes.find((r) => r.id === focusId);
      const all = (focus ? [focus] : routes).flatMap((r) => r.points);
      if (all.length > 1) map.fitBounds(all, { padding: [32, 32], maxZoom: 17, animate: false });
      else map.fitBounds(BOUNDARY_BOUNDS, { padding: [16, 16], maxZoom: 17, animate: false });
    };
    map.setMinZoom(14);
    map.setMaxZoom(18);
    map.setMaxBounds(MAP_BOUNDS);
    fitRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);
  // The map can be created before its box reaches full size (a tab or panel
  // still opening). Leaflet then keeps the old size: the outside shading is
  // cut off and the routes are framed wrongly. Re-measure and frame again.
  useEffect(() => {
    const el = map.getContainer();
    let last = `${el.clientWidth}x${el.clientHeight}`;
    const observer = new ResizeObserver(() => {
      const now = `${el.clientWidth}x${el.clientHeight}`;
      if (now === last) return;
      last = now;
      map.invalidateSize();
      fitRef.current();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [map]);
  return null;
};

/**
 * Shows garbage truck routes (display only; staff draw them in
 * WasteRouteEditor). Pass `points` for one route, or `routes`
 * ([{ id, name, points, color }]) to show several in different colours, with
 * `focusId` drawn on top and the others faded.
 */
const WasteRouteMap = ({ points, routes: routesValue, focusId = null, onSelect, label = 'Garbage collection route' }) => {
  const routes = useMemo(() => {
    if (routesValue) {
      return routesValue
        .map((r, i) => ({ ...r, points: parseRoutePoints(r.points), color: r.color || ROUTE_COLORS[i % ROUTE_COLORS.length] }))
        .filter((r) => r.points.length > 1);
    }
    const single = parseRoutePoints(points);
    return single.length > 1 ? [{ id: 'route', name: label, points: single, color: ROUTE_COLORS[0] }] : [];
  }, [routesValue, points, label]);

  const ordered = useMemo(() => {
    // The focused route last, so it is drawn on top.
    const rest = routes.filter((r) => r.id !== focusId);
    const focus = routes.filter((r) => r.id === focusId);
    return [...rest, ...focus];
  }, [routes, focusId]);

  return (
    <div role="region" aria-label="Map of the garbage collection route" className="waste-route-map-frame">
      <p className="sr-only">This map needs a mouse or touch. The route is also written out, street by street, in the schedule details.</p>
      <MapContainer
        center={BOUNDARY_BOUNDS.getCenter()}
        zoom={15}
        minZoom={14}
        maxZoom={18}
        zoomSnap={0.25}
        scrollWheelZoom
        maxBounds={MAP_BOUNDS}
        maxBoundsViscosity={1}
        className="waste-route-map-canvas"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Polygon positions={OUTSIDE_MASK} interactive={false} pathOptions={{ stroke: false, fillColor: '#1f2937', fillOpacity: 0.35 }} />
        <Polygon positions={PB2_BOUNDARY} interactive={false} pathOptions={{ color: '#16845b', weight: 3, dashArray: '8 6', fill: false }} />
        <FitRoutes routes={routes} focusId={focusId} />
        {ordered.map((route) => {
          const faded = focusId != null && route.id !== focusId;
          // Several routes side by side (nothing brought forward): lines only,
          // or the pins and arrows of six routes would hide the lines.
          const overview = focusId == null && routes.length > 1;
          const start = route.points[0];
          const end = route.points[route.points.length - 1];
          return (
            <React.Fragment key={route.id}>
              {/* A white casing under the line keeps it readable on any map colour. */}
              <Polyline positions={route.points} interactive={false} pathOptions={{ color: '#fff', weight: faded ? 6 : 10, opacity: faded ? 0.5 : 0.9, lineCap: 'round', lineJoin: 'round' }} />
              <Polyline
                positions={route.points}
                pathOptions={{ color: route.color, weight: faded ? 3 : 6, opacity: faded ? 0.55 : 0.95, lineCap: 'round', lineJoin: 'round' }}
                eventHandlers={onSelect ? { click: () => onSelect(route.id) } : undefined}
              >
                {route.name && <Popup>{route.name}</Popup>}
              </Polyline>
              {!faded && !overview && routeArrows(route.points, 140, route.color).map((arrow) => (
                <Marker key={`${route.id}-${arrow.key}`} position={arrow.position} icon={arrow.icon} interactive={false} keyboard={false} />
              ))}
              {!faded && !overview && (
                <>
                  <Marker position={start} icon={makeRouteIcon('start')} title={`Truck starts here${route.name ? ` · ${route.name}` : ''}`}>
                    <Popup>Truck starts here{route.name ? <><br />{route.name}</> : null}</Popup>
                  </Marker>
                  <Marker position={end} icon={makeRouteIcon('end')} title={`Route ends here${route.name ? ` · ${route.name}` : ''}`}>
                    <Popup>Route ends here{route.name ? <><br />{route.name}</> : null}</Popup>
                  </Marker>
                </>
              )}
            </React.Fragment>
          );
        })}
      </MapContainer>
      <span className="waste-route-map-label">{label}</span>
    </div>
  );
};

export default WasteRouteMap;
