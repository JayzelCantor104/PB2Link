import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Polygon, Polyline, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { PB2_BOUNDARY } from './pasongBuaya2Boundary';
import { parseRoutePoints } from '../lib/wasteRoute';
import 'leaflet/dist/leaflet.css';
import './WasteRouteMap.css';

const BOUNDARY_BOUNDS = L.latLngBounds(PB2_BOUNDARY);
const MAP_BOUNDS = BOUNDARY_BOUNDS.pad(0.25);
const MAP_CENTER = BOUNDARY_BOUNDS.getCenter();
const MAX_ROAD_SNAP_DISTANCE_METERS = 18;
const MAX_ROUTE_DISTANCE_FROM_ROAD_METERS = 6;
const METERS_PER_DEGREE = 111320;
const ROAD_NETWORK_CACHE_KEY = 'pb2-osm-road-network-v1';
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
];
const roadNetworkPromises = new Map();

const parseRoadNetwork = (data) => {
  const roads = (data.elements || [])
    .filter((element) => element.type === 'way' && Array.isArray(element.geometry))
    .map((element) => ({
      id: element.id,
      coordinates: element.geometry
        .map(({ lat, lon }) => [Number(lat), Number(lon)])
        .filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1]))
    }))
    .filter((road) => road.coordinates.length >= 2);
  if (!roads.length) throw new Error('No truck-accessible streets are mapped in this map area.');
  return roads;
};

const loadRoadNetwork = (bounds, force = false) => {
  const key = [bounds.south, bounds.west, bounds.north, bounds.east].map((value) => value.toFixed(3)).join(',');
  const cacheKey = `${ROAD_NETWORK_CACHE_KEY}:${key}`;
  if (force) {
    roadNetworkPromises.delete(key);
    try {
      sessionStorage.removeItem(cacheKey);
    } catch {
      // The in-memory road cache remains available if session storage is blocked.
    }
  }
  if (roadNetworkPromises.has(key)) return roadNetworkPromises.get(key);

  let cachedRoads = null;
  try {
    const cached = JSON.parse(sessionStorage.getItem(cacheKey) || 'null');
    if (Array.isArray(cached) && cached.length) cachedRoads = cached;
  } catch {
    cachedRoads = null;
  }
  if (cachedRoads) {
    roadNetworkPromises.set(key, Promise.resolve(cachedRoads));
    return roadNetworkPromises.get(key);
  }

  const query = `[out:json][timeout:25];way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|road|track)$"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});out geom qt;`;
  const requestFrom = async (endpointIndex) => {
    const endpoint = OVERPASS_ENDPOINTS[endpointIndex];
    if (!endpoint) throw new Error('OpenStreetMap street data servers are unavailable. Try again shortly.');
    try {
      const url = `${endpoint}?data=${encodeURIComponent(query)}`;
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(30000)
      });
      if (!response.ok) throw new Error(`Street data server returned HTTP ${response.status}.`);
      return parseRoadNetwork(await response.json());
    } catch (error) {
      if (endpointIndex + 1 >= OVERPASS_ENDPOINTS.length) throw error;
      return requestFrom(endpointIndex + 1);
    }
  };

  const request = requestFrom(0)
    .then((roads) => {
      try {
        sessionStorage.setItem(cacheKey, JSON.stringify(roads));
      } catch {
        // The in-memory road cache still serves this map session.
      }
      return roads;
    })
    .catch((error) => {
      roadNetworkPromises.delete(key);
      throw error;
    });
  roadNetworkPromises.set(key, request);
  return request;
};

const pointInBoundary = ([lat, lng]) => {
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

const segmentInBoundary = (from, to) => {
  const steps = Math.ceil(Math.max(Math.abs(to[0] - from[0]), Math.abs(to[1] - from[1])) / 0.0002);
  for (let step = 1; step < steps; step += 1) {
    const ratio = step / steps;
    if (!pointInBoundary([
      from[0] + (to[0] - from[0]) * ratio,
      from[1] + (to[1] - from[1]) * ratio
    ])) return false;
  }
  return true;
};

const distanceInMeters = (pointA, pointB) => {
  const latitudeScale = METERS_PER_DEGREE;
  const longitudeScale = METERS_PER_DEGREE * Math.cos((pointA[0] * Math.PI) / 180);
  const north = (pointB[0] - pointA[0]) * latitudeScale;
  const east = (pointB[1] - pointA[1]) * longitudeScale;
  return Math.hypot(north, east);
};

const closestPointOnSegment = (point, start, end) => {
  const longitudeScale = METERS_PER_DEGREE * Math.cos((point[0] * Math.PI) / 180);
  const northLength = (end[0] - start[0]) * METERS_PER_DEGREE;
  const eastLength = (end[1] - start[1]) * longitudeScale;
  const northOffset = (point[0] - start[0]) * METERS_PER_DEGREE;
  const eastOffset = (point[1] - start[1]) * longitudeScale;
  const segmentLengthSquared = northLength ** 2 + eastLength ** 2;
  const ratio = segmentLengthSquared
    ? Math.max(0, Math.min(1, (northOffset * northLength + eastOffset * eastLength) / segmentLengthSquared))
    : 0;
  const snappedPoint = [
    start[0] + ((end[0] - start[0]) * ratio),
    start[1] + ((end[1] - start[1]) * ratio)
  ];
  return { point: snappedPoint, distance: distanceInMeters(point, snappedPoint) };
};

const closestPointOnRoadNetwork = (point, roads) => {
  let closest = null;
  roads.forEach((road) => {
    for (let index = 0; index < road.coordinates.length - 1; index += 1) {
      const candidate = closestPointOnSegment(point, road.coordinates[index], road.coordinates[index + 1]);
      if (!closest || candidate.distance < closest.distance) closest = candidate;
    }
  });
  return closest;
};

const segmentFollowsRoad = (from, to, roads) => {
  const segmentLength = distanceInMeters(from, to);
  const steps = Math.max(1, Math.ceil(segmentLength / 4));
  for (let step = 0; step <= steps; step += 1) {
    const ratio = step / steps;
    const sample = [
      from[0] + ((to[0] - from[0]) * ratio),
      from[1] + ((to[1] - from[1]) * ratio)
    ];
    const nearestRoad = closestPointOnRoadNetwork(sample, roads);
    if (!nearestRoad || nearestRoad.distance > MAX_ROUTE_DISTANCE_FROM_ROAD_METERS) return false;
  }
  return true;
};

const routeFollowsRoadNetwork = (points, roads) => points.every((point) => {
  const nearestRoad = closestPointOnRoadNetwork(point, roads);
  return nearestRoad && nearestRoad.distance <= MAX_ROUTE_DISTANCE_FROM_ROAD_METERS;
}) && points.slice(1).every((point, index) => segmentFollowsRoad(points[index], point, roads));

const makeRouteIcon = (type, label = '') => {
  const icon = type === 'start' ? 'bi-truck-front-fill' : type === 'end' ? 'bi-flag-fill' : 'bi-circle-fill';
  return L.divIcon({
    className: `waste-route-marker-wrap waste-route-marker-${type}`,
    html: `<span class="waste-route-marker"><i class="bi ${icon}" aria-hidden="true"></i>${label ? `<b>${label}</b>` : ''}</span>`,
    iconSize: type === 'point' ? [26, 26] : [38, 38],
    iconAnchor: type === 'point' ? [13, 13] : [19, 34],
    popupAnchor: [0, -30]
  });
};

const makeArrowIcon = (bearing) => L.divIcon({
  className: 'waste-route-arrow-wrap',
  html: `<span class="waste-route-arrow" style="transform:rotate(${bearing - 90}deg)" aria-hidden="true">➤</span>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11]
});

const getBearing = ([lat1, lng1], [lat2, lng2]) => {
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const y = Math.sin(toRadians(lng2 - lng1)) * Math.cos(toRadians(lat2));
  const x = Math.cos(toRadians(lat1)) * Math.sin(toRadians(lat2))
    - Math.sin(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.cos(toRadians(lng2 - lng1));
  return (Math.atan2(y, x) * 180) / Math.PI;
};

const RouteMapController = ({ points, editable }) => {
  const map = useMap();
  const hasFittedBounds = useRef(false);

  useEffect(() => {
    map.setMinZoom(14);
    map.setMaxZoom(18);
    map.setMaxBounds(MAP_BOUNDS);
    if (!hasFittedBounds.current) {
      if (editable) {
        map.setView(points[0] || MAP_CENTER, 16);
      } else if (points.length > 1) {
        map.fitBounds(points, { padding: [32, 32], maxZoom: 17 });
      } else {
        map.fitBounds(BOUNDARY_BOUNDS, { padding: [16, 16], maxZoom: 17 });
      }
      hasFittedBounds.current = true;
    }
  }, [editable, map, points]);

  return null;
};

const RoadNetworkController = ({ onBoundsChange }) => {
  const map = useMap();
  const reportBounds = useCallback(() => onBoundsChange(map.getBounds()), [map, onBoundsChange]);
  useMapEvents({ moveend: reportBounds });

  useEffect(() => {
    const timer = setTimeout(reportBounds, 100);
    return () => clearTimeout(timer);
  }, [reportBounds]);

  return null;
};

const RouteMapClickHandler = ({
  editable,
  points,
  roads,
  roadNetworkStatus,
  onAddPoint,
  onOutOfBoundary,
  onOffRoad,
  onRouteOffRoad
}) => {
  useMapEvents({
    click(event) {
      if (!editable || roadNetworkStatus !== 'ready') return;
      const point = [event.latlng.lat, event.latlng.lng];
      if (!pointInBoundary(point)) {
        onOutOfBoundary?.();
        return;
      }
      const nearestRoad = closestPointOnRoadNetwork(point, roads);
      if (!nearestRoad || nearestRoad.distance > MAX_ROAD_SNAP_DISTANCE_METERS) {
        onOffRoad?.();
        return;
      }
      const snappedPoint = nearestRoad.point;
      if (!pointInBoundary(snappedPoint)
        || (points.length && !segmentInBoundary(points[points.length - 1], snappedPoint))) {
        onOutOfBoundary?.();
        return;
      }
      if (points.length && !segmentFollowsRoad(points[points.length - 1], snappedPoint, roads)) {
        onRouteOffRoad?.();
        return;
      }
      onAddPoint(snappedPoint);
    }
  });
  return null;
};

const WasteRouteMap = ({
  points: pointsValue = [],
  editable = false,
  onPointsChange,
  onRouteValidationChange,
  onOutOfBoundary,
  onOffRoad,
  onRouteOffRoad,
  label = 'Garbage collection route'
}) => {
  const points = useMemo(() => parseRoutePoints(pointsValue), [pointsValue]);
  const [roads, setRoads] = React.useState([]);
  const [roadNetworkStatus, setRoadNetworkStatus] = React.useState(editable ? 'loading' : 'not-needed');
  const [roadNetworkError, setRoadNetworkError] = React.useState('');
  const loadedRoadBounds = useRef(new Set());
  const latestRoadRequest = useRef(0);
  const lastRoadBounds = useRef(null);
  const routeIsOnRoads = useMemo(
    () => routeFollowsRoadNetwork(points, roads),
    [points, roads]
  );
  const addPoint = (point) => onPointsChange?.([...points, point]);

  const loadVisibleRoads = useCallback((mapBounds, force = false) => {
    if (!editable || !mapBounds) return;
    const boundarySouth = BOUNDARY_BOUNDS.getSouth();
    const boundaryWest = BOUNDARY_BOUNDS.getWest();
    const boundaryNorth = BOUNDARY_BOUNDS.getNorth();
    const boundaryEast = BOUNDARY_BOUNDS.getEast();
    const south = Math.max(boundarySouth, mapBounds.getSouth());
    const west = Math.max(boundaryWest, mapBounds.getWest());
    const north = Math.min(boundaryNorth, mapBounds.getNorth());
    const east = Math.min(boundaryEast, mapBounds.getEast());
    if (south >= north || west >= east) return;

    const bounds = {
      south: Math.max(boundarySouth, Math.floor(south * 1000) / 1000),
      west: Math.max(boundaryWest, Math.floor(west * 1000) / 1000),
      north: Math.min(boundaryNorth, Math.ceil(north * 1000) / 1000),
      east: Math.min(boundaryEast, Math.ceil(east * 1000) / 1000)
    };
    const key = [bounds.south, bounds.west, bounds.north, bounds.east]
      .map((value) => value.toFixed(3))
      .join(',');
    lastRoadBounds.current = mapBounds;
    if (!force && loadedRoadBounds.current.has(key)) {
      latestRoadRequest.current += 1;
      setRoadNetworkStatus('ready');
      setRoadNetworkError('');
      return;
    }

    const requestId = latestRoadRequest.current + 1;
    latestRoadRequest.current = requestId;
    setRoadNetworkStatus('loading');
    setRoadNetworkError('');
    loadRoadNetwork(bounds, force)
      .then((loadedRoads) => {
        loadedRoadBounds.current.add(key);
        setRoads((currentRoads) => {
          const knownIds = new Set(currentRoads.map((road) => road.id));
          return [...currentRoads, ...loadedRoads.filter((road) => !knownIds.has(road.id))];
        });
        if (latestRoadRequest.current === requestId) setRoadNetworkStatus('ready');
      })
      .catch((error) => {
        console.error('Unable to load mapped PB2 roads for route plotting:', error);
        if (latestRoadRequest.current === requestId) {
          setRoadNetworkError(error.message);
          setRoadNetworkStatus('error');
        }
      });
  }, [editable]);

  useEffect(() => {
    if (editable && roadNetworkStatus === 'ready') onRouteValidationChange?.(routeIsOnRoads);
  }, [editable, onRouteValidationChange, roadNetworkStatus, routeIsOnRoads]);

  return (
    <div className={`waste-route-map-frame${editable ? ' is-editable' : ''}`}>
      <MapContainer
        center={MAP_CENTER}
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
        <Polygon
          positions={PB2_BOUNDARY}
          interactive={false}
          pathOptions={{ color: '#16845b', weight: 3, dashArray: '8 6', fill: false }}
        />
        {roads.map((road, index) => (
          <Polyline
            key={`street-way-${road.id}-${index}`}
            positions={road.coordinates}
            interactive={false}
            pathOptions={{ color: '#64748b', weight: 3, opacity: 0.65 }}
          />
        ))}
        <RouteMapController points={points} editable={editable} />
        {editable && <RoadNetworkController onBoundsChange={loadVisibleRoads} />}
        <RouteMapClickHandler
          editable={editable}
          points={points}
          roads={roads}
          roadNetworkStatus={roadNetworkStatus}
          onAddPoint={addPoint}
          onOutOfBoundary={onOutOfBoundary}
          onOffRoad={onOffRoad}
          onRouteOffRoad={onRouteOffRoad}
        />
        {points.length > 1 && (
          <Polyline
            positions={points}
            pathOptions={{ color: '#087f5b', weight: 6, opacity: 0.9, lineCap: 'round', lineJoin: 'round' }}
          />
        )}
        {points.map((point, index) => {
          const isStart = index === 0;
          const isEnd = index === points.length - 1 && points.length > 1;
          const markerType = isStart ? 'start' : isEnd ? 'end' : 'point';
          return (
            <Marker
              key={`route-point-${index}`}
              position={point}
              icon={makeRouteIcon(markerType, markerType === 'point' ? String(index + 1) : '')}
            >
              <Popup>{isStart ? 'Truck route start' : isEnd ? 'Route end' : `Route point ${index + 1}`}</Popup>
            </Marker>
          );
        })}
        {points.slice(0, -1).map((point, index) => {
          const nextPoint = points[index + 1];
          const midpoint = [(point[0] + nextPoint[0]) / 2, (point[1] + nextPoint[1]) / 2];
          return (
            <Marker
              key={`route-arrow-${index}`}
              position={midpoint}
              icon={makeArrowIcon(getBearing(point, nextPoint))}
              interactive={false}
            />
          );
        })}
      </MapContainer>
      <span className="waste-route-map-label">{label}</span>
      {editable && roadNetworkStatus !== 'ready' && (
        <div className={`waste-route-road-status${roadNetworkStatus === 'error' ? ' is-error' : ''}`} role={roadNetworkStatus === 'error' ? 'alert' : 'status'}>
          {roadNetworkStatus === 'loading'
            ? 'Loading mapped PB2 streets from OpenStreetMap…'
            : (
              <>
                <span>Street data unavailable{roadNetworkError ? `: ${roadNetworkError}` : ''}. Route plotting is disabled.</span>
                <button
                  type="button"
                  className="waste-route-road-retry"
                  onClick={() => {
                    loadVisibleRoads(lastRoadBounds.current, true);
                  }}
                >
                  Retry
                </button>
              </>
            )}
        </div>
      )}
      {editable && roadNetworkStatus === 'ready' && (
        <div className="waste-route-road-attribution">Snapping to mapped streets · © OpenStreetMap contributors</div>
      )}
      {editable && roadNetworkStatus === 'ready' && !routeIsOnRoads && (
        <div className="waste-route-road-status is-error route-warning" role="alert">
          This saved route leaves mapped streets. Clear and redraw it on the road lines.
        </div>
      )}
    </div>
  );
};

export default WasteRouteMap;
