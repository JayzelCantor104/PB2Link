import React, { useEffect, useMemo } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Polygon, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
// leaflet.heat attaches L.heatLayer to the global L that Leaflet sets on load.
import 'leaflet.heat';
import 'leaflet/dist/leaflet.css';
import './IssueMap.css';
import { PB2_BOUNDARY } from './pasongBuaya2Boundary';
import { CATEGORY_LOOKUP, DEFAULT_TIERS, HEAT_GRADIENT } from './issueMapConfig';
import { flagIcon } from './issueFlagIcon';

// Same framing as DisasterMap: fit to the barangay, shade everything outside.
const BARANGAY_BOUNDS = L.latLngBounds(PB2_BOUNDARY);
const PAN_BOUNDS = BARANGAY_BOUNDS.pad(0.25);
const OUTSIDE_MASK = [[[-90, -180], [-90, 180], [90, 180], [90, -180]], PB2_BOUNDARY];

const Viewport = ({ focus }) => {
  const map = useMap();
  useEffect(() => {
    map.setMaxBounds(PAN_BOUNDS);
    map.fitBounds(BARANGAY_BOUNDS, { padding: [16, 16], maxZoom: 17 });
  }, [map]);
  useEffect(() => {
    if (focus) map.flyTo([focus.lat, focus.lng], Math.max(map.getZoom(), 17), { duration: 0.6 });
  }, [map, focus]);
  return null;
};

const ClickToPick = ({ enabled, onPick }) => {
  useMapEvents({
    click(e) {
      if (enabled && onPick) onPick({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
};

/**
 * Report-density heatmap: each pin weighs its report_count, so a pin with
 * many reports glows hotter. Full heat at the purple-tier count.
 */
const HeatLayer = ({ issues, tiers }) => {
  const map = useMap();
  const points = useMemo(
    () => issues.filter((i) => i.status !== 'Merged' && i.report_count > 0).map((i) => [i.lat, i.lng, i.report_count]),
    [issues],
  );
  const max = Math.max(1, tiers?.[2] || DEFAULT_TIERS[2]);
  useEffect(() => {
    if (!points.length) return undefined;
    // maxZoom 15 ≈ the zoom that fits the whole barangay; below it leaflet.heat
    // would fade the points, so the overview would look empty.
    const layer = L.heatLayer(points, { radius: 32, blur: 24, maxZoom: 15, max, minOpacity: 0.3, gradient: HEAT_GRADIENT });
    layer.addTo(map);
    return () => { map.removeLayer(layer); };
  }, [map, points, max]);
  return null;
};

const pickIcon = L.divIcon({
  className: 'issue-flag-wrap',
  html: '<div class="issue-pick-pin"><i class="bi bi-geo-alt-fill"></i></div>',
  iconSize: [34, 40],
  iconAnchor: [17, 38],
});

/**
 * Leaflet map of community issues inside Pasong Buaya II.
 * props: issues (from issue_map.php / admin_issue_map.php), selectedId,
 *        onSelect(issue), pickMode, picked {lat,lng}, onPick({lat,lng}), focus {lat,lng},
 *        layer 'flags' | 'heat' | 'both' (staff only; residents always get flags), tiers
 */
const IssueMap = ({ issues = [], selectedId = null, onSelect, pickMode = false, picked = null, onPick, focus = null, height, layer = 'flags', tiers }) => {
  const showFlags = layer !== 'heat';
  const markers = useMemo(() => (showFlags ? issues : []).map((issue) => ({
    issue,
    icon: flagIcon(issue, issue.issue_id === selectedId),
  })), [issues, selectedId, showFlags]);

  return (
    <div className={`issue-map-frame${pickMode ? ' is-picking' : ''}`} style={height ? { height } : undefined}>
      <MapContainer
        center={BARANGAY_BOUNDS.getCenter()}
        zoom={15}
        minZoom={14}
        maxZoom={19}
        zoomSnap={0.25}
        scrollWheelZoom
        maxBounds={PAN_BOUNDS}
        maxBoundsViscosity={1.0}
        className="issue-map-canvas"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxNativeZoom={19}
        />
        <Polygon positions={OUTSIDE_MASK} interactive={false} pathOptions={{ stroke: false, fillColor: '#1f2937', fillOpacity: 0.35 }} />
        <Polygon positions={PB2_BOUNDARY} interactive={false} pathOptions={{ color: '#16845b', weight: 3, dashArray: '8 6', fill: false }} />
        <Viewport focus={focus} />
        <ClickToPick enabled={pickMode} onPick={onPick} />
        {layer !== 'flags' && <HeatLayer issues={issues} tiers={tiers} />}
        {markers.map(({ issue, icon }) => (
          <Marker
            key={issue.issue_id}
            position={[issue.lat, issue.lng]}
            icon={icon}
            zIndexOffset={issue.issue_id === selectedId ? 1000 : issue.report_count}
            eventHandlers={{ click: () => { if (!pickMode && onSelect) onSelect(issue); } }}
          >
            <Tooltip direction="top" offset={[14, -44]}>
              {(CATEGORY_LOOKUP[issue.category]?.label || issue.category_label)} · {issue.report_count} report{issue.report_count === 1 ? '' : 's'}
            </Tooltip>
          </Marker>
        ))}
        {picked && <Marker position={[picked.lat, picked.lng]} icon={pickIcon} interactive={false} />}
      </MapContainer>
      {pickMode && <div className="issue-map-pick-hint"><i className="bi bi-hand-index-thumb"></i> Tap the exact spot of the problem inside the barangay</div>}
    </div>
  );
};

export default IssueMap;
