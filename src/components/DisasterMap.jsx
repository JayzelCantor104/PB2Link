import React, { useState, useEffect } from 'react';
import L from 'leaflet';
import { CircleMarker, ImageOverlay, MapContainer, Marker, Polygon, Polyline, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { Link } from 'react-router-dom';
import 'leaflet/dist/leaflet.css';
import './DisasterMap.css';
import { PB2_BOUNDARY } from './pasongBuaya2Boundary';
import { CATEGORY_LOOKUP, OPEN_STATUSES } from './issueMapConfig';
import { flagIcon } from './issueFlagIcon';
import { getWeatherInfo } from '../lib/weatherCodes';

const API_BASE = '/api_backend';

const WEATHER_INTERVALS = [
  { label: 'Overnight', hours: [0, 1, 2, 3, 4, 5], range: '12 AM–6 AM', icon: 'bi-moon-stars-fill' },
  { label: 'Morning', hours: [6, 7, 8, 9, 10, 11], range: '6 AM–12 PM', icon: 'bi-sunrise-fill' },
  { label: 'Noon', hours: [12, 13], range: '12 PM–2 PM', icon: 'bi-sun-fill' },
  { label: 'Afternoon', hours: [14, 15, 16, 17], range: '2 PM–6 PM', icon: 'bi-brightness-high-fill' },
  { label: 'Night', hours: [18, 19, 20, 21, 22, 23], range: '6 PM–12 AM', icon: 'bi-moon-fill' }
];

const formatDate = (date, options = { month: 'short', day: 'numeric' }) =>
  new Intl.DateTimeFormat('en-US', options).format(new Date(`${date}T12:00:00`));

const getDayLabel = (date, today) => {
  const offset = (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000;
  if (offset === -1) return 'Yesterday';
  if (offset === 0) return 'Today';
  if (offset === 1) return 'Tomorrow';
  return formatDate(date, { weekday: 'short', month: 'short', day: 'numeric' });
};

const getMostCommon = (values) => {
  const counts = values.reduce((result, value) => {
    result[value] = (result[value] || 0) + 1;
    return result;
  }, {});
  const mostCommon = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  return mostCommon === undefined ? null : Number(mostCommon);
};

// A time-of-day card names its worst wet hour (drizzle, rain, showers,
// thunderstorm: WMO codes 51+), else its most common sky. Open-Meteo labels a
// whole day by its worst hour, so this keeps the cards agreeing with the day.
const getPeriodCode = (codes) => {
  const wet = codes.filter((code) => code >= 51);
  return wet.length ? Math.max(...wet) : getMostCommon(codes);
};

const getTemperatureRange = (values) => {
  if (!values.length) return '--';
  const low = Math.round(Math.min(...values));
  const high = Math.round(Math.max(...values));
  return low === high ? `${low}°C` : `${low}°–${high}°C`;
};

// Fit the view to the barangay outline; panning may stray a little past it so
// residents can still see the streets just outside the border.
const BARANGAY_BOUNDS = L.latLngBounds(PB2_BOUNDARY);
const PAN_BOUNDS = BARANGAY_BOUNDS.pad(0.25);
const DEFAULT_CENTER = BARANGAY_BOUNDS.getCenter();
// Outer ring covering the world, with the barangay cut out as a hole, so
// everything outside Pasong Buaya II is shaded.
const OUTSIDE_MASK = [
  [[-90, -180], [-90, 180], [90, 180], [90, -180]],
  PB2_BOUNDARY
];
// Project NOAH 100-year flood hazard overlay for the barangay (public/data/noah,
// ODbL). One small image serves both the map layer and "flood level here".
const FLOOD_URL = '/data/noah/flood_100yr.png';
const FLOOD_META_URL = '/data/noah/flood_100yr.json';
const FLOOD_LEVELS = {
  1: { label: 'Low', detail: 'up to 0.5 m, knee-deep or less', color: '#facc15' },
  2: { label: 'Medium', detail: '0.5–1.5 m, knee to neck deep', color: '#f97316' },
  3: { label: 'High', detail: 'over 1.5 m, above the neck', color: '#dc2626' }
};
const FLOOD_ATTRIBUTION = 'Flood hazard: <a href="https://noah.up.edu.ph" target="_blank" rel="noopener noreferrer">Project NOAH</a> 100-year map (ODbL)';

// RainViewer free radar: past 2 hours in 10-minute frames, native detail up to
// zoom 7 (about 1 km per pixel), attribution required.
const RAINVIEWER_INDEX = 'https://api.rainviewer.com/public/weather-maps.json';
const RADAR_ATTRIBUTION = 'Weather data by <a href="https://www.rainviewer.com" target="_blank" rel="noopener noreferrer">RainViewer</a>';

// During an advisory residents see these Community Issue Map reports.
const LIVE_ISSUE_CATEGORIES = ['flooding', 'road_damage'];
const CLOSED_CENTER_STATUSES = ['Full', 'Closed'];

const distanceMeters = ([lat1, lng1], [lat2, lng2]) => {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};
const formatDistance = (m) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`);
// Streets add roughly 30% over a straight line; an unhurried walk is ~75 m a minute.
const walkMinutes = (m) => Math.max(1, Math.round((m * 1.3) / 75));

let floodRasterPromise = null;
const loadFloodRaster = () => {
  if (!floodRasterPromise) {
    floodRasterPromise = (async () => {
      const meta = await (await fetch(FLOOD_META_URL)).json();
      const img = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Flood map image failed to load'));
        image.src = FLOOD_URL;
      });
      const canvas = document.createElement('canvas');
      canvas.width = meta.width;
      canvas.height = meta.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      return { meta, ctx };
    })().catch((error) => {
      floodRasterPromise = null;
      throw error;
    });
  }
  return floodRasterPromise;
};

// 0 = outside NOAH's mapped flood areas, 1-3 = hazard level, null = no data here.
const floodLevelAt = (raster, lat, lng) => {
  const [[south, west], [north, east]] = raster.meta.bounds;
  if (lat < south || lat > north || lng < west || lng > east) return null;
  const x = Math.min(raster.meta.width - 1, Math.floor(((lng - west) / (east - west)) * raster.meta.width));
  const y = Math.min(raster.meta.height - 1, Math.floor(((north - lat) / (north - south)) * raster.meta.height));
  const [, green, , alpha] = raster.ctx.getImageData(x, y, 1, 1).data;
  if (alpha < 128) return 0;
  if (green > 160) return 1;
  if (green > 70) return 2;
  return 3;
};

// A contact field may hold several numbers ("(046) 471-0000 / 0917-123-4567"):
// one call link each, dialing digits only.
const phoneNumbers = (value) => String(value || '')
  .split(/[/,;]|\s+or\s+/i)
  .map((part) => part.trim())
  .filter((part) => part.replace(/\D/g, '').length >= 7)
  .map((label) => ({ label, href: `tel:${label.replace(/[^\d+]/g, '')}` }));

const radarTime = (unix) => new Date(unix * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

// The only pins staff place are evacuation centers.
const TYPE_LOOKUP = { evacuation_center: { color: '#16845b', icon: 'bi-house-heart-fill' } };

const MapViewportController = ({ regionView }) => {
  const map = useMap();

  useEffect(() => {
    if (regionView) {
      // Wider view to see rain approaching on the radar.
      map.setMaxBounds(null);
      map.setMinZoom(6);
      map.flyTo(DEFAULT_CENTER, 8, { duration: 0.8 });
      return;
    }
    map.setMinZoom(14);
    map.setMaxZoom(18);
    map.setMaxBounds(PAN_BOUNDS);
    map.fitBounds(BARANGAY_BOUNDS, { padding: [16, 16], maxZoom: 17 });
  }, [map, regionView]);

  return null;
};

// Frames the resident and their nearest evacuation center together.
const FitPoints = ({ points }) => {
  const map = useMap();
  useEffect(() => {
    if (points && points.length >= 2) map.fitBounds(L.latLngBounds(points), { padding: [56, 56], maxZoom: 17 });
  }, [map, points]);
  return null;
};

const makeIcon = (type) => {
  const definition = TYPE_LOOKUP[type] || { color: '#16845b', icon: 'bi-geo-alt-fill' };
  return L.divIcon({
    className: 'disaster-map-marker-wrap',
    html: `<span class="disaster-map-marker" style="--marker-color:${definition.color}"><i class="bi ${definition.icon}" aria-hidden="true"></i></span>`,
    iconSize: [34, 34],
    iconAnchor: [17, 32],
    popupAnchor: [0, -26]
  });
};

const MapClickHandler = ({ enabled, onPick }) => {
  useMapEvents({
    click(event) {
      if (enabled && onPick) {
        onPick({ lat: event.latlng.lat, lng: event.latlng.lng });
      }
    }
  });
  return null;
};


/**
 * issues: open community issues (admin_issue_map.php) to overlay on the
 * disaster layers. Staff only; when omitted, the "Community issues" layer
 * toggle isn't shown.
 * onPlaceCenter(center): staff place an existing evacuation center that has no
 * map location yet (the page opens its form with the picked spot).
 * advisoryActive: a disaster advisory is in effect. On the public map this
 * turns on "Live reports": residents' open flooding and road-damage reports
 * from the Community Issue Map (public data, never names).
 */
const DisasterMap = ({ centers = [], issues, advisoryActive = false, editable = false, pickMode = false, pickHint, onMapPick, onStartPick, onPlaceCenter }) => {
  const [selectedDate, setSelectedDate] = useState('');
  // Issues start hidden so their flags don't get in the way of placing pins.
  const [mapLayers, setMapLayers] = useState({ centers: true, issues: false, flood: false, radar: false, live: true });
  // Nearest evacuation center: { origin, source, best, others, allFull, floodHere, farAway } or { noCenters }.
  const [nearest, setNearest] = useState(null);
  const [locating, setLocating] = useState(null); // 'gps' | 'pick' | null
  const [locateNote, setLocateNote] = useState('');
  const [floodRaster, setFloodRaster] = useState(null);
  const [floodError, setFloodError] = useState(false);
  const [radar, setRadar] = useState(null); // { host, frames }
  const [radarError, setRadarError] = useState(false);
  const [radarIndex, setRadarIndex] = useState(0);
  const [radarPlaying, setRadarPlaying] = useState(false);
  const [regionView, setRegionView] = useState(false);
  const [liveIssues, setLiveIssues] = useState([]);
  const showLive = advisoryActive && !issues;
  const [weatherData, setWeatherData] = useState(null);
  const [weatherError, setWeatherError] = useState(false);
  const [lastWeatherUpdate, setLastWeatherUpdate] = useState(null);

  useEffect(() => {
    let isActive = true;
    const fetchWeather = async () => {
      // The server fetches Open-Meteo on a timer and caches it (hazard_feeds.php),
      // so every visitor shares one request and the last forecast survives an outage.
      try {
        const res = await fetch(`${API_BASE}/hazard_feeds.php?action=weather`);
        if (!res.ok) throw new Error('Weather fetch failed');
        const json = await res.json();
        if (!json.success || !json.weather) throw new Error(json.message || 'Weather unavailable');
        const data = json.weather;
        if (!isActive) return;
        setWeatherData(data);
        setWeatherError(false);
        // Show when the server last read the forecast, not when this page loaded.
        setLastWeatherUpdate(json.source?.updated_at ? new Date(json.source.updated_at.replace(' ', 'T')) : new Date());
        setSelectedDate((current) => current || data.current?.time?.slice(0, 10) || data.daily?.time?.[0] || '');
      } catch (error) {
        if (!isActive) return;
        console.error('Unable to load live weather data:', error);
        setWeatherError(true);
      }
    };

    fetchWeather();
    const refreshTimer = window.setInterval(fetchWeather, 30 * 60 * 1000);
    return () => {
      isActive = false;
      window.clearInterval(refreshTimer);
    };
  }, []);

  // Flood overlay: load once, when the layer is first turned on.
  useEffect(() => {
    if (!mapLayers.flood || floodRaster) return;
    loadFloodRaster().then(setFloodRaster).catch(() => setFloodError(true));
  }, [mapLayers.flood, floodRaster]);

  // Rain radar frames: load when turned on, refresh every 10 minutes.
  useEffect(() => {
    if (!mapLayers.radar) {
      setRadarPlaying(false);
      setRegionView(false);
      return undefined;
    }
    let alive = true;
    const loadFrames = async () => {
      try {
        const json = await (await fetch(RAINVIEWER_INDEX)).json();
        const frames = (json.radar?.past || []).slice(-13);
        if (!alive) return;
        if (!frames.length) throw new Error('No radar frames');
        setRadar({ host: json.host, frames });
        setRadarIndex(frames.length - 1);
        setRadarError(false);
      } catch {
        if (alive) setRadarError(true);
      }
    };
    loadFrames();
    const timer = window.setInterval(loadFrames, 10 * 60 * 1000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [mapLayers.radar]);

  useEffect(() => {
    if (!radarPlaying || !radar) return undefined;
    const timer = window.setInterval(() => setRadarIndex((i) => (i + 1) % radar.frames.length), 700);
    return () => window.clearInterval(timer);
  }, [radarPlaying, radar]);

  // Live reports during an advisory (public map only; staff have the full issue layer).
  useEffect(() => {
    if (!showLive) return undefined;
    let alive = true;
    const loadLive = async () => {
      try {
        const json = await (await fetch(`${API_BASE}/issue_map.php?action=list`, { credentials: 'include' })).json();
        if (!alive || !json.success) return;
        setLiveIssues((json.issues || []).filter((i) => LIVE_ISSUE_CATEGORIES.includes(i.category) && OPEN_STATUSES.includes(i.status)));
      } catch {
        /* keep the last list */
      }
    };
    loadLive();
    const timer = window.setInterval(loadLive, 2 * 60 * 1000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [showLive]);

  const centerFeatures = centers
    .filter((item) => item.latitude !== null && item.latitude !== '' && item.longitude !== null && item.longitude !== ''
      && Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude)))
    .map((item) => ({
      ...item,
      id: `center-${item.id}`,
      type: 'evacuation_center',
      title: item.name,
      description: item.contact_number || '',
      latitude: Number(item.latitude),
      longitude: Number(item.longitude)
    }));

  const weatherDates = [...new Set((weatherData?.hourly?.time || []).map((time) => time.slice(0, 10)))];
  const today = weatherData?.current?.time?.slice(0, 10) || weatherDates[0] || '';
  const activeDate = weatherDates.includes(selectedDate) ? selectedDate : today;
  const activeDayLabel = activeDate ? getDayLabel(activeDate, today) : 'Weather forecast';
  const activeHourlyIndices = (weatherData?.hourly?.time || [])
    .map((time, index) => time.startsWith(activeDate) ? index : -1)
    .filter((index) => index >= 0);
  const hourly = weatherData?.hourly || {};
  const daily = weatherData?.daily || {};
  const dailyIndex = (daily.time || []).indexOf(activeDate);
  const dayWeatherCode = dailyIndex >= 0 ? daily.weather_code?.[dailyIndex] : null;
  const dayWeatherInfo = getWeatherInfo(dayWeatherCode ?? getMostCommon(activeHourlyIndices.map((index) => hourly.weather_code?.[index]).filter(Number.isFinite)));
  const dayHigh = dailyIndex >= 0 ? daily.temperature_2m_max?.[dailyIndex] : null;
  const dayLow = dailyIndex >= 0 ? daily.temperature_2m_min?.[dailyIndex] : null;
  const dayRainChance = dailyIndex >= 0 ? daily.precipitation_probability_max?.[dailyIndex] : null;
  const weatherOverview = [
    { label: 'Weather', value: dayWeatherInfo.label, tone: dayWeatherInfo.tone === 'storm' || dayWeatherInfo.tone === 'rainy' ? 'amber' : dayWeatherInfo.tone === 'sunny' ? 'blue' : 'green', icon: dayWeatherInfo.tone === 'storm' ? 'bi-cloud-lightning-rain-fill' : dayWeatherInfo.tone === 'rainy' ? 'bi-cloud-rain-fill' : dayWeatherInfo.tone === 'sunny' ? 'bi-sun-fill' : 'bi-cloudy-fill' },
    { label: 'High / low', value: dayHigh !== null && dayLow !== null ? `${Math.round(dayHigh)}° / ${Math.round(dayLow)}°C` : getTemperatureRange(activeHourlyIndices.map((index) => hourly.temperature_2m?.[index]).filter(Number.isFinite)), tone: 'blue', icon: 'bi-thermometer-half' },
    { label: 'Rain chance', value: dayRainChance !== null && dayRainChance !== undefined ? `${Math.round(dayRainChance)}%` : '--', tone: 'amber', icon: 'bi-droplet-half' },
    { label: 'Wind', value: activeHourlyIndices.length ? `${Math.round(Math.max(...activeHourlyIndices.map((index) => hourly.wind_speed_10m?.[index] || 0)))} km/h max` : '--', tone: 'neutral', icon: 'bi-wind' }
  ];

  const weatherSlots = WEATHER_INTERVALS.map((interval) => {
    const indices = activeHourlyIndices.filter((index) => interval.hours.includes(Number(hourly.time[index].slice(11, 13))));
    const temperatures = indices.map((index) => hourly.temperature_2m?.[index]).filter(Number.isFinite);
    const codes = indices.map((index) => hourly.weather_code?.[index]).filter(Number.isFinite);
    const code = getPeriodCode(codes);
    const info = code === null ? null : getWeatherInfo(code);
    const rainValues = indices.map((index) => hourly.precipitation_probability?.[index]).filter(Number.isFinite);
    const windValues = indices.map((index) => hourly.wind_speed_10m?.[index]).filter(Number.isFinite);
    const humidityValues = indices.map((index) => hourly.relative_humidity_2m?.[index]).filter(Number.isFinite);
    return {
      ...interval,
      available: indices.length > 0,
      temperature: getTemperatureRange(temperatures),
      info,
      rainChance: rainValues.length ? Math.max(...rainValues) : null,
      wind: windValues.length ? Math.max(...windValues) : null,
      humidity: humidityValues.length ? Math.round(humidityValues.reduce((sum, value) => sum + value, 0) / humidityValues.length) : null
    };
  });

  const weatherStatus = !weatherData || !activeDate
    ? { title: weatherError ? 'Weather data unavailable' : 'Weather is loading', details: weatherError ? 'The forecast could not be loaded. Try refreshing the page.' : 'Loading the latest forecast.', tone: 'neutral' }
    : { title: `${activeDayLabel} · ${formatDate(activeDate, { weekday: 'long', month: 'long', day: 'numeric' })}`, details: `${dayWeatherInfo.label}${dayHigh !== null && dayLow !== null ? ` · High ${Math.round(dayHigh)}°C / Low ${Math.round(dayLow)}°C` : ''}`, tone: dayWeatherInfo.tone === 'storm' || dayWeatherInfo.tone === 'rainy' ? 'amber' : 'green' };

  const visibleItems = mapLayers.centers ? centerFeatures : [];
  const toggleMapLayer = (layer) => setMapLayers((current) => ({ ...current, [layer]: !current[layer] }));
  const centerCount = centerFeatures.length;
  const unmappedList = centers.filter((center) => !centerFeatures.some((mapped) => mapped.id === `center-${center.id}`));
  const unmappedCenters = unmappedList.length;

  const findFrom = async (origin, source) => {
    const ranked = centerFeatures
      .map((center) => ({ ...center, distance: distanceMeters(origin, [center.latitude, center.longitude]) }))
      .sort((a, b) => a.distance - b.distance);
    const open = ranked.filter((center) => !CLOSED_CENTER_STATUSES.includes(center.status));
    // The answer shows at once; the flood note is added when the flood map is
    // ready (or left out if it takes more than 6 seconds).
    setNearest({
      origin,
      source,
      best: open[0] || null,
      others: open.slice(1, 3),
      allFull: ranked.length > 0 && open.length === 0,
      floodHere: null,
      farAway: distanceMeters(origin, [DEFAULT_CENTER.lat, DEFAULT_CENTER.lng]) > 4000
    });
    setLocating(null);
    setLocateNote('');
    try {
      const raster = await Promise.race([
        loadFloodRaster(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 6000))
      ]);
      setFloodRaster(raster);
      const floodHere = floodLevelAt(raster, origin[0], origin[1]);
      setNearest((current) => (current?.origin === origin ? { ...current, floodHere } : current));
    } catch {
      /* the result still works without the flood note */
    }
  };

  const startNearest = () => {
    setNearest(null);
    if (!centerFeatures.length) {
      setNearest({ noCenters: true });
      return;
    }
    if (!navigator.geolocation) {
      setLocating('pick');
      setLocateNote('This browser can’t share its location.');
      return;
    }
    setLocating('gps');
    navigator.geolocation.getCurrentPosition(
      (pos) => findFrom([pos.coords.latitude, pos.coords.longitude], 'gps'),
      (error) => {
        setLocating('pick');
        setLocateNote(error.code === 1 ? 'Location access was not allowed.' : 'Your location could not be found.');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  const clearNearest = () => {
    setNearest(null);
    setLocating(null);
    setLocateNote('');
  };

  const nearestPoints = nearest?.best ? [nearest.origin, [nearest.best.latitude, nearest.best.longitude]] : null;
  // Staff planning note: is the recommended center itself in a NOAH flood area?
  const centerFlood = editable && floodRaster && nearest?.best ? floodLevelAt(floodRaster, nearest.best.latitude, nearest.best.longitude) : null;
  const activeFrame = radar?.frames?.[radarIndex];

  return (
    <section className={`disaster-map-shell${editable ? ' is-editable' : ''}`}>
      <div className="weather-map-header">
        <div>
          <span className="weather-map-kicker">Barangay weather watch</span>
          <h3>Pasong Buaya II DRRM overview</h3>
        </div>
        <div className="weather-map-badge"><i className="bi bi-cloud-arrow-down-fill"></i> Open-Meteo model · not an official PAGASA forecast</div>
      </div>

      <div className={`weather-status-banner ${weatherStatus.tone}`}>
        <div>
          <small>Weather status</small>
          <strong>{weatherStatus.title}</strong>
        </div>
        <span>{weatherStatus.details}</span>
      </div>

      <div className="disaster-map-controls">
        <div className="disaster-map-layer-controls" aria-label="Map layers">
          <button type="button" className={mapLayers.centers ? 'active' : ''} aria-pressed={mapLayers.centers} onClick={() => toggleMapLayer('centers')}>
            <i className="bi bi-house-heart-fill"></i><span>Evacuation centers</span><small>{centerCount}</small>
          </button>
          {issues && (
            <button type="button" className={mapLayers.issues ? 'active' : ''} aria-pressed={mapLayers.issues} onClick={() => toggleMapLayer('issues')}>
              <i className="bi bi-flag-fill"></i><span>Community issues</span><small>{issues.length}</small>
            </button>
          )}
          {showLive && (
            <button type="button" className={`is-live${mapLayers.live ? ' active' : ''}`} aria-pressed={mapLayers.live} onClick={() => toggleMapLayer('live')}>
              <i className="bi bi-broadcast"></i><span>Live reports</span><small>{liveIssues.length}</small>
            </button>
          )}
          <button type="button" className={`is-flood${mapLayers.flood ? ' active' : ''}`} aria-pressed={mapLayers.flood} onClick={() => toggleMapLayer('flood')}>
            <i className="bi bi-water"></i><span>Flood-prone areas</span>
          </button>
          <button type="button" className={`is-radar${mapLayers.radar ? ' active' : ''}`} aria-pressed={mapLayers.radar} onClick={() => toggleMapLayer('radar')}>
            <i className="bi bi-cloud-rain-heavy-fill"></i><span>Rain radar</span>
          </button>
        </div>

        {editable && (
          <div className="disaster-map-admin-controls">
            <button
              type="button"
              className={`disaster-map-pin-button${pickMode ? ' is-cancel' : ''}`}
              onClick={() => onStartPick?.(pickMode ? null : 'evacuation_center')}
            >
              <i className={`bi ${pickMode ? 'bi-x-lg' : 'bi-house-add-fill'}`}></i>
              {pickMode ? 'Cancel' : 'Add evacuation center'}
            </button>
            {pickMode && <span className="disaster-map-placement-help">Click the map where the center is</span>}
          </div>
        )}
      </div>

      {/* Nearest evacuation center */}
      <div className="dm-nearest">
        {!nearest && !locating && (
          <div className="dm-nearest-start">
            <div>
              <strong>Where should I evacuate?</strong>
              <span>Find the closest open evacuation center from where you are.</span>
            </div>
            <button type="button" className="dm-nearest-btn" onClick={startNearest}>
              <i className="bi bi-crosshair"></i> Find my nearest evacuation center
            </button>
          </div>
        )}
        {locating === 'gps' && (
          <p className="dm-nearest-status"><i className="bi bi-hourglass-split"></i> Finding your location… allow location access if your browser asks.</p>
        )}
        {locating === 'pick' && (
          <div className="dm-nearest-status is-pick">
            <span><i className="bi bi-hand-index-thumb"></i> {locateNote ? `${locateNote} ` : ''}Tap your location on the map instead.</span>
            <button type="button" className="dm-link" onClick={clearNearest}>Cancel</button>
          </div>
        )}
        {nearest?.noCenters && (
          <div className="dm-nearest-status is-warn">
            <span>
              <i className="bi bi-info-circle-fill"></i>{' '}
              {editable
                ? `None of the ${centers.length} evacuation centers has a map location yet. Edit each one in Evacuation Centers and set its location, so residents can find the nearest.`
                : 'Evacuation centers haven’t been placed on the map yet. See the Evacuation Centers tab or call the barangay hotline.'}
            </span>
            <button type="button" className="dm-link" onClick={clearNearest}>Close</button>
          </div>
        )}
        {nearest && !nearest.noCenters && (
          <div className="dm-nearest-card">
            <div className="dm-nearest-head">
              <span className="dm-nearest-kicker">{nearest.source === 'gps' ? 'From your current location' : 'From the spot you tapped'}</span>
              <button type="button" className="dm-link" onClick={clearNearest}>Clear</button>
            </div>
            {nearest.best ? (
              <>
                <div className="dm-nearest-main">
                  <i className="bi bi-house-heart-fill dm-nearest-icon"></i>
                  <div>
                    <h4>{nearest.best.name}</h4>
                    <p>
                      About <strong>{formatDistance(nearest.best.distance)}</strong> away · roughly {walkMinutes(nearest.best.distance)} min walk
                      {' · '}<span className={`dm-center-status is-${String(nearest.best.status || 'available').toLowerCase()}`}>{nearest.best.status || 'Available'}</span>
                    </p>
                    {Number(nearest.best.capacity_families) > 0 && (
                      <p className="dm-muted">Room for about {Math.max(0, Number(nearest.best.capacity_families) - Number(nearest.best.current_families || 0))} more families{nearest.best.location ? ` · ${nearest.best.location}` : ''}</p>
                    )}
                  </div>
                </div>
                <div className="dm-nearest-actions">
                  <a className="dm-nearest-btn" href={`https://www.google.com/maps/dir/?api=1&destination=${nearest.best.latitude},${nearest.best.longitude}&travelmode=walking`} target="_blank" rel="noopener noreferrer">
                    <i className="bi bi-sign-turn-right-fill"></i> Walking directions
                  </a>
                  {phoneNumbers(nearest.best.contact_number).map((phone) => (
                    <a key={phone.href} className="dm-nearest-btn is-ghost" href={phone.href}><i className="bi bi-telephone-fill"></i> {phone.label}</a>
                  ))}
                </div>
              </>
            ) : (
              <p className="dm-nearest-status is-warn"><i className="bi bi-exclamation-triangle-fill"></i> All mapped evacuation centers are marked full or closed. Call the barangay hotline for where to go.</p>
            )}
            {nearest.floodHere > 0 && (
              <p className="dm-flood-note" style={{ '--flood-color': FLOOD_LEVELS[nearest.floodHere].color }}>
                <i className="bi bi-water"></i> Your spot is in a <strong>{FLOOD_LEVELS[nearest.floodHere].label.toLowerCase()} flood hazard</strong> area ({FLOOD_LEVELS[nearest.floodHere].detail}) on Project NOAH’s 100-year flood map. Leave early when an advisory is raised.
              </p>
            )}
            {nearest.floodHere === 0 && (
              <p className="dm-flood-note is-clear"><i className="bi bi-check-circle-fill"></i> Your spot is outside Project NOAH’s mapped flood areas. Streets around it may still flood.</p>
            )}
            {centerFlood > 0 && (
              <p className="dm-flood-note" style={{ '--flood-color': FLOOD_LEVELS[centerFlood].color }}>
                <i className="bi bi-exclamation-triangle-fill"></i> Staff note: {nearest.best.name} itself is in a <strong>{FLOOD_LEVELS[centerFlood].label.toLowerCase()} flood hazard</strong> area on Project NOAH’s map. Check that it stays safe (e.g. upper floors) in heavy rain.
              </p>
            )}
            {nearest.farAway && <p className="dm-muted"><i className="bi bi-info-circle"></i> You seem to be outside Pasong Buaya II, so these distances may not be useful.</p>}
            {nearest.others.length > 0 && (
              <ul className="dm-nearest-others">
                {nearest.others.map((center) => (
                  <li key={center.id}><span>{center.name}</span><span>{formatDistance(center.distance)} · {center.status || 'Available'}</span></li>
                ))}
              </ul>
            )}
            <p className="dm-muted dm-fine">Distances are straight-line estimates; the walking route may be longer. Your location stays on your device.</p>
          </div>
        )}
        {editable && unmappedCenters > 0 && !pickMode && (
          <div className="dm-unmapped">
            <p><i className="bi bi-geo-alt"></i> <strong>{unmappedCenters} evacuation center{unmappedCenters === 1 ? ' is' : 's are'} not on the map yet</strong>, so residents can’t be directed there.</p>
            <ul>
              {unmappedList.map((center) => (
                <li key={center.id}>
                  <span>{center.name}<small>{center.location}</small></span>
                  <button type="button" className="dm-place-btn" onClick={() => onPlaceCenter?.(center)}>
                    <i className="bi bi-pin-map-fill"></i> Place on map
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Layer notes: live reports, flood legend, radar player */}
      {showLive && mapLayers.live && (
        <p className="dm-layer-note is-live">
          <i className="bi bi-broadcast"></i> An advisory is in effect: the map shows residents’ open <strong>flooding</strong> and <strong>road damage</strong> reports from the <Link to="/issue-map">Community Issue Map</Link>{liveIssues.length ? '' : ' (none right now)'}.
        </p>
      )}
      {mapLayers.flood && (
        <div className="dm-layer-note is-flood">
          {floodError ? (
            <span><i className="bi bi-exclamation-circle"></i> The flood map could not be loaded.</span>
          ) : (
            <>
              <span className="dm-legend">
                {[1, 2, 3].map((level) => (
                  <span key={level}><i style={{ background: FLOOD_LEVELS[level].color }}></i>{FLOOD_LEVELS[level].label} <small>{FLOOD_LEVELS[level].detail}</small></span>
                ))}
              </span>
              <small>Where flooding is likely in a very heavy (100-year) rain, from <a href="https://noah.up.edu.ph" target="_blank" rel="noopener noreferrer">Project NOAH</a> / PAGASA modelling. A planning guide, not a live flood report.</small>
            </>
          )}
        </div>
      )}
      {mapLayers.radar && (
        <div className="dm-layer-note is-radar">
          {radarError && <span><i className="bi bi-exclamation-circle"></i> The rain radar could not be loaded right now.</span>}
          {!radarError && !radar && <span><i className="bi bi-hourglass-split"></i> Loading the rain radar…</span>}
          {radar && activeFrame && (
            <>
              <div className="dm-radar-controls">
                <button type="button" className="dm-icon-btn" onClick={() => setRadarPlaying((v) => !v)} aria-label={radarPlaying ? 'Pause radar' : 'Play the last 2 hours'}>
                  <i className={`bi ${radarPlaying ? 'bi-pause-fill' : 'bi-play-fill'}`}></i>
                </button>
                <input
                  type="range"
                  min={0}
                  max={radar.frames.length - 1}
                  value={radarIndex}
                  onChange={(e) => { setRadarPlaying(false); setRadarIndex(Number(e.target.value)); }}
                  aria-label="Radar time"
                />
                <strong>{radarTime(activeFrame.time)}{radarIndex === radar.frames.length - 1 ? ' (latest)' : ''}</strong>
                <button type="button" className="dm-link" onClick={() => setRegionView((v) => !v)}>
                  <i className={`bi ${regionView ? 'bi-zoom-in' : 'bi-zoom-out'}`}></i> {regionView ? 'Back to the barangay' : 'See rain nearby'}
                </button>
              </div>
              <small>Rain detected by radar over the last 2 hours (blue = light, yellow/red = heavy). About 1 km detail. Weather data by <a href="https://www.rainviewer.com" target="_blank" rel="noopener noreferrer">RainViewer</a>.</small>
            </>
          )}
        </div>
      )}

      <div className={`disaster-map-frame${pickMode || locating === 'pick' ? ' is-picking' : ''}`}>
        <MapContainer
          center={DEFAULT_CENTER}
          zoom={15}
          minZoom={14}
          maxZoom={18}
          zoomSnap={0.25}
          scrollWheelZoom
          maxBounds={PAN_BOUNDS}
          maxBoundsViscosity={1.0}
          className="disaster-map-canvas"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {mapLayers.flood && floodRaster && (
            <ImageOverlay url={FLOOD_URL} bounds={floodRaster.meta.bounds} opacity={0.5} attribution={FLOOD_ATTRIBUTION} zIndex={2} />
          )}
          {/* Every frame stays loaded; only the current one is visible, so playback is smooth. */}
          {mapLayers.radar && radar && radar.frames.map((frame, index) => (
            <TileLayer
              key={frame.path}
              url={`${radar.host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`}
              opacity={index === radarIndex ? 0.7 : 0}
              maxNativeZoom={7}
              maxZoom={18}
              zIndex={3}
              attribution={index === radar.frames.length - 1 ? RADAR_ATTRIBUTION : undefined}
            />
          ))}
          <Polygon
            positions={OUTSIDE_MASK}
            interactive={false}
            // Lighter in the zoomed-out radar view, so the region stays readable.
            pathOptions={{ stroke: false, fillColor: '#1f2937', fillOpacity: regionView ? 0.08 : 0.35 }}
          />
          <Polygon
            positions={PB2_BOUNDARY}
            interactive={false}
            pathOptions={{ color: '#16845b', weight: 3, dashArray: '8 6', fill: false }}
          />
          <MapViewportController regionView={regionView} />
          <FitPoints points={nearestPoints} />
          <MapClickHandler
            enabled={pickMode || locating === 'pick'}
            onPick={(point) => (pickMode ? onMapPick?.(point) : findFrom([point.lat, point.lng], 'map'))}
          />
          {visibleItems.map((item) => (
            <Marker key={item.id} position={[item.latitude, item.longitude]} icon={makeIcon('evacuation_center')}>
              <Popup>
                <strong>{item.name}</strong>
                {item.location && <p>{item.location}</p>}
                <p>
                  {item.status || 'Available'}
                  {Number(item.capacity_families) > 0 ? ` · ${Number(item.current_families || 0)} of ${item.capacity_families} families` : ''}
                </p>
                {phoneNumbers(item.contact_number).length > 0 && (
                  <p>{phoneNumbers(item.contact_number).map((phone, i) => <React.Fragment key={phone.href}>{i > 0 && ' · '}<a href={phone.href}>{phone.label}</a></React.Fragment>)}</p>
                )}
                {editable && <small>Edit or move it from Evacuation Centers.</small>}
              </Popup>
            </Marker>
          ))}
          {nearest?.origin && (
            <CircleMarker center={nearest.origin} radius={9} pathOptions={{ color: '#ffffff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 }}>
              <Popup>{nearest.source === 'gps' ? 'You are here' : 'The spot you tapped'}</Popup>
            </CircleMarker>
          )}
          {nearestPoints && (
            <Polyline positions={nearestPoints} pathOptions={{ color: '#2563eb', weight: 4, dashArray: '8 10', opacity: 0.9 }} />
          )}
          {showLive && mapLayers.live && liveIssues.map((issue) => (
            <Marker key={`live-${issue.issue_id}`} position={[issue.lat, issue.lng]} icon={flagIcon(issue)} zIndexOffset={500 + issue.report_count}>
              <Popup>
                <strong>{CATEGORY_LOOKUP[issue.category]?.label || issue.category}</strong>
                <p>Reported by {issue.report_count} resident{issue.report_count === 1 ? '' : 's'} · {issue.status}</p>
                {issue.landmark && <p>{issue.landmark}</p>}
                {issue.last_reported_at && <small>Last report {new Date(issue.last_reported_at.replace(' ', 'T')).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</small>}
                <p><Link to={`/issue-map?issue=${issue.issue_id}`}>Open on the Community Issue Map</Link></p>
              </Popup>
            </Marker>
          ))}
          {issues && mapLayers.issues && issues.map((issue) => (
            <Marker key={`issue-${issue.issue_id}`} position={[issue.lat, issue.lng]} icon={flagIcon(issue)} zIndexOffset={issue.report_count}>
              <Popup>
                <strong>{CATEGORY_LOOKUP[issue.category]?.label || issue.category} · Issue #{issue.issue_id}</strong>
                <p>{issue.report_count} resident report{issue.report_count === 1 ? '' : 's'} · {issue.status}</p>
                {issue.landmark && <p>{issue.landmark}</p>}
                <Link to="/admin/issue-map">Open the Community Issue Map</Link>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
        {pickMode && <div className="disaster-map-pick-hint">{pickHint || 'Click the map to set this location'}</div>}
        {!pickMode && locating === 'pick' && <div className="disaster-map-pick-hint">Tap where you are</div>}
      </div>

      <div className="weather-stats-grid">
        {weatherOverview.map((item) => (
          <div key={item.label} className={`weather-stat-card ${item.tone}`}>
            <div className="weather-stat-icon"><i className={`bi ${item.icon}`} /></div>
            <div className="weather-stat-copy">
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          </div>
        ))}
      </div>

      <div className="weather-timeframe-bar" aria-label="Select forecast date">
        {weatherDates.map((date) => (
          <button
            key={date}
            type="button"
            className={activeDate === date ? 'selected' : ''}
            onClick={() => setSelectedDate(date)}
          >
            <span>{getDayLabel(date, today)}</span>
            <small>{formatDate(date)}</small>
          </button>
        ))}
      </div>

      <section className="weather-interval-section" aria-label={`${activeDayLabel} hourly forecast`}>
        <div className="weather-interval-heading">
          <div>
            <h4>Weather through the day</h4>
            <p>Hourly forecast grouped by time of day</p>
          </div>
          <span><i className="bi bi-arrow-repeat"></i> {lastWeatherUpdate ? `Updated ${lastWeatherUpdate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · ` : ''}checked every 30 minutes</span>
        </div>
        <div className="weather-interval-grid">
          {weatherSlots.map((slot) => (
            <article className={`weather-interval-card${slot.available ? '' : ' unavailable'}`} key={slot.label}>
              <div className="weather-interval-card-heading">
                <div className="weather-interval-icon"><i className={`bi ${slot.icon}`}></i></div>
                <div>
                  <h5>{slot.label}</h5>
                  <span>{slot.range}</span>
                </div>
              </div>
              {slot.available ? (
                <>
                  <strong className="weather-interval-temperature">{slot.temperature}</strong>
                  <div className="weather-interval-condition">{slot.info?.label || 'Conditions unavailable'}</div>
                  <dl>
                    <div><dt><i className="bi bi-droplet-half"></i> Rain</dt><dd>{slot.rainChance === null ? '--' : `${Math.round(slot.rainChance)}%`}</dd></div>
                    <div><dt><i className="bi bi-wind"></i> Wind</dt><dd>{slot.wind === null ? '--' : `${Math.round(slot.wind)} km/h`}</dd></div>
                    <div><dt><i className="bi bi-moisture"></i> Humidity</dt><dd>{slot.humidity === null ? '--' : `${slot.humidity}%`}</dd></div>
                  </dl>
                </>
              ) : (
                <p className="weather-interval-empty">No hourly data available</p>
              )}
            </article>
          ))}
        </div>
      </section>

    </section>
  );
};

export default DisasterMap;