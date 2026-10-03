import React, { useState, useEffect } from 'react';
import L from 'leaflet';
import { Circle, CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import './DisasterMap.css';
import { MAP_FEATURE_TYPES } from './disasterMapConfig';

const WEATHER_INTERVALS = [
  { label: 'Midnight', hours: [0, 1, 2, 3, 4, 5], range: '12 AM–6 AM', icon: 'bi-moon-stars-fill' },
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

const getTemperatureRange = (values) => {
  if (!values.length) return '--';
  const low = Math.round(Math.min(...values));
  const high = Math.round(Math.max(...values));
  return low === high ? `${low}°C` : `${low}°–${high}°C`;
};

const DEFAULT_CENTER = [14.3936564, 120.9618181];
const BARANGAY_BOUNDS = [
  [14.372, 120.935],
  [14.418, 120.99]
];
const AREA_TYPES = new Set(['priority_zone', 'affected_area', 'hazard_area']);
const HAZARD_TYPES = new Set([...AREA_TYPES, 'road_block']);
const TYPE_LOOKUP = Object.fromEntries([
  ...MAP_FEATURE_TYPES,
  { value: 'evacuation_center', color: '#16845b', icon: 'bi-house-heart-fill' }
].map((item) => [item.value, item]));
const PLACEMENT_OPTIONS = [
  { value: 'evacuation_center', label: 'Evacuation center', ...TYPE_LOOKUP.evacuation_center },
  ...MAP_FEATURE_TYPES
];

const MapViewportController = () => {
  const map = useMap();

  useEffect(() => {
    map.setMinZoom(14);
    map.setMaxZoom(18);
    map.setMaxBounds(BARANGAY_BOUNDS);
    map.fitBounds(BARANGAY_BOUNDS, { padding: [22, 22], maxZoom: 16 });
  }, [map]);

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

const getWeatherInfo = (code) => {
  const map = {
    0: { label: 'Clear sky', tone: 'sunny' },
    1: { label: 'Mostly clear', tone: 'sunny' },
    2: { label: 'Partly cloudy', tone: 'cloudy' },
    3: { label: 'Overcast', tone: 'cloudy' },
    45: { label: 'Foggy', tone: 'cloudy' },
    48: { label: 'Foggy', tone: 'cloudy' },
    51: { label: 'Light drizzle', tone: 'rainy' },
    53: { label: 'Drizzle', tone: 'rainy' },
    55: { label: 'Heavy drizzle', tone: 'rainy' },
    56: { label: 'Freezing drizzle', tone: 'rainy' },
    57: { label: 'Heavy freezing drizzle', tone: 'rainy' },
    61: { label: 'Light rain', tone: 'rainy' },
    63: { label: 'Rain', tone: 'rainy' },
    65: { label: 'Heavy rain', tone: 'rainy' },
    66: { label: 'Freezing rain', tone: 'rainy' },
    67: { label: 'Heavy freezing rain', tone: 'rainy' },
    71: { label: 'Light snow', tone: 'rainy' },
    73: { label: 'Snow', tone: 'rainy' },
    75: { label: 'Heavy snow', tone: 'rainy' },
    77: { label: 'Snow grains', tone: 'rainy' },
    80: { label: 'Rain showers', tone: 'rainy' },
    81: { label: 'Heavy showers', tone: 'rainy' },
    82: { label: 'Violent showers', tone: 'rainy' },
    85: { label: 'Snow showers', tone: 'rainy' },
    86: { label: 'Heavy snow showers', tone: 'rainy' },
    95: { label: 'Thunderstorm', tone: 'storm' },
    96: { label: 'Thunderstorm with hail', tone: 'storm' },
    99: { label: 'Severe thunderstorm', tone: 'storm' }
  };

  return map[code] || { label: 'Weather watch', tone: 'cloudy' };
};

const DisasterMap = ({ features = [], centers = [], editable = false, pickMode = false, pickHint, onMapPick, onStartPick }) => {
  const [selectedDate, setSelectedDate] = useState('');
  const [placementType, setPlacementType] = useState('evacuation_center');
  const [placementMenuOpen, setPlacementMenuOpen] = useState(false);
  const [mapLayers, setMapLayers] = useState({ hazards: true, centers: true, response: true });
  const [weatherData, setWeatherData] = useState(null);
  const [weatherError, setWeatherError] = useState(false);
  const [lastWeatherUpdate, setLastWeatherUpdate] = useState(null);

  useEffect(() => {
    let isActive = true;
    const fetchWeather = async () => {
      const url = new URL('https://api.open-meteo.com/v1/forecast');
      url.search = new URLSearchParams({
        latitude: '14.3936564',
        longitude: '120.9618181',
        current: 'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m',
        hourly: 'temperature_2m,relative_humidity_2m,precipitation,precipitation_probability,weather_code,wind_speed_10m',
        daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
        past_days: '1',
        forecast_days: '7',
        timezone: 'auto'
      }).toString();

      try {
        const res = await fetch(url.toString());
        if (!res.ok) throw new Error('Weather fetch failed');
        const data = await res.json();
        if (!isActive) return;
        setWeatherData(data);
        setWeatherError(false);
        setLastWeatherUpdate(new Date());
        setSelectedDate((current) => current || data.current?.time?.slice(0, 10) || data.daily?.time?.[0] || '');
      } catch (error) {
        if (!isActive) return;
        console.error('Unable to load live weather data:', error);
        setWeatherError(true);
      }
    };

    fetchWeather();
    const refreshTimer = window.setInterval(fetchWeather, 60 * 60 * 1000);
    return () => {
      isActive = false;
      window.clearInterval(refreshTimer);
    };
  }, []);

  const safeFeatures = features
    .filter((item) => editable || Number(item.is_active ?? 1) === 1)
    .map((item) => ({ ...item, type: item.type || item.feature_type }));
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
    const code = getMostCommon(codes);
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
    ? { title: weatherError ? 'Weather data unavailable' : 'Weather is loading', details: weatherError ? 'Open-Meteo could not be reached. Try refreshing the page.' : 'Connecting to Open-Meteo for the latest forecast.', tone: 'neutral' }
    : { title: `${activeDayLabel} · ${formatDate(activeDate, { weekday: 'long', month: 'long', day: 'numeric' })}`, details: `${dayWeatherInfo.label}${dayHigh !== null && dayLow !== null ? ` · High ${Math.round(dayHigh)}°C / Low ${Math.round(dayLow)}°C` : ''}`, tone: dayWeatherInfo.tone === 'storm' || dayWeatherInfo.tone === 'rainy' ? 'amber' : 'green' };

  const allItems = safeFeatures.concat(centerFeatures);
  const visibleItems = allItems.filter((item) => {
    if (item.type === 'evacuation_center') return mapLayers.centers;
    if (HAZARD_TYPES.has(item.type)) return mapLayers.hazards;
    return mapLayers.response;
  });
  const selectedPlacement = PLACEMENT_OPTIONS.find((item) => item.value === placementType) || PLACEMENT_OPTIONS[0];
  const toggleMapLayer = (layer) => setMapLayers((current) => ({ ...current, [layer]: !current[layer] }));
  const hazardCount = allItems.filter((item) => HAZARD_TYPES.has(item.type)).length;
  const centerCount = allItems.filter((item) => item.type === 'evacuation_center').length;
  const responseCount = allItems.length - hazardCount - centerCount;

  return (
    <section className={`disaster-map-shell${editable ? ' is-editable' : ''}`}>
      <div className="weather-map-header">
        <div>
          <span className="weather-map-kicker">Barangay weather watch</span>
          <h3>Pasong Buaya II DRRM overview</h3>
        </div>
        <div className="weather-map-badge"><i className="bi bi-cloud-arrow-down-fill"></i> Open-Meteo · hourly</div>
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
          <button type="button" className={mapLayers.hazards ? 'active' : ''} aria-pressed={mapLayers.hazards} onClick={() => toggleMapLayer('hazards')}>
            <i className="bi bi-exclamation-triangle-fill"></i><span>Hazard zones</span><small>{hazardCount}</small>
          </button>
          <button type="button" className={mapLayers.centers ? 'active' : ''} aria-pressed={mapLayers.centers} onClick={() => toggleMapLayer('centers')}>
            <i className="bi bi-house-heart-fill"></i><span>Evacuation centers</span><small>{centerCount}</small>
          </button>
          <button type="button" className={mapLayers.response ? 'active' : ''} aria-pressed={mapLayers.response} onClick={() => toggleMapLayer('response')}>
            <i className="bi bi-signpost-split-fill"></i><span>Response locations</span><small>{responseCount}</small>
          </button>
        </div>

        {editable && (
          <div className="disaster-map-admin-controls">
            <div className="disaster-map-placement-control" onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) setPlacementMenuOpen(false);
            }}>
              <span className="disaster-map-placement-label">{pickMode ? 'Now placing' : 'Add pin for'}</span>
              <button
                type="button"
                className="disaster-map-placement-trigger"
                aria-haspopup="listbox"
                aria-expanded={placementMenuOpen}
                disabled={pickMode}
                onClick={() => setPlacementMenuOpen((open) => !open)}
              >
                <span className="disaster-map-placement-icon" style={{ '--placement-color': selectedPlacement.color }}>
                  <i className={`bi ${selectedPlacement.icon}`} aria-hidden="true"></i>
                </span>
                <span>{selectedPlacement.label}</span>
                <i className="bi bi-chevron-down disaster-map-placement-chevron" aria-hidden="true"></i>
              </button>
              {placementMenuOpen && !pickMode && (
                <div className="disaster-map-placement-menu" role="listbox" aria-label="Pin purpose">
                  {PLACEMENT_OPTIONS.map((item) => (
                    <button
                      type="button"
                      role="option"
                      aria-selected={placementType === item.value}
                      className={`disaster-map-placement-option${placementType === item.value ? ' selected' : ''}`}
                      key={item.value}
                      onClick={() => {
                        setPlacementType(item.value);
                        setPlacementMenuOpen(false);
                      }}
                    >
                      <span className="disaster-map-placement-icon" style={{ '--placement-color': item.color }}>
                        <i className={`bi ${item.icon}`} aria-hidden="true"></i>
                      </span>
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              className={`disaster-map-pin-button${pickMode ? ' is-cancel' : ''}`}
              onClick={() => onStartPick?.(pickMode ? null : placementType)}
            >
              <i className={`bi ${pickMode ? 'bi-x-lg' : 'bi-geo-alt-fill'}`}></i>
              {pickMode ? 'Cancel' : 'Add pin'}
            </button>
            {pickMode && <span className="disaster-map-placement-help">Choose a spot on the map</span>}
          </div>
        )}
      </div>

      <div className={`disaster-map-frame${pickMode ? ' is-picking' : ''}`}>
        <MapContainer
          center={DEFAULT_CENTER}
          zoom={15}
          minZoom={14}
          maxZoom={18}
          scrollWheelZoom
          maxBounds={BARANGAY_BOUNDS}
          maxBoundsViscosity={1.0}
          className="disaster-map-canvas"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapViewportController />
          <MapClickHandler enabled={pickMode} onPick={onMapPick} />
          {visibleItems.map((item) => {
            const latitude = Number(item.latitude);
            const longitude = Number(item.longitude);
            const color = item.type === 'evacuation_center' ? '#16845b' : (TYPE_LOOKUP[item.type]?.color || '#16845b');
            const position = [latitude, longitude];
            const hasRouteEnd = item.type === 'route' && Number.isFinite(Number(item.end_latitude)) && Number.isFinite(Number(item.end_longitude));
            const routeEnd = hasRouteEnd ? [Number(item.end_latitude), Number(item.end_longitude)] : null;
            return (
              <React.Fragment key={`${item.type}-${item.id}`}>
                {AREA_TYPES.has(item.type) && (
                  <Circle
                    center={position}
                    radius={Math.max(70, Number(item.radius_meters) || 180)}
                    pathOptions={{ color, fillColor: color, fillOpacity: 0.2, weight: 2, opacity: 0.9 }}
                  />
                )}
                {routeEnd && (
                  <React.Fragment>
                    <Polyline
                      positions={[position, routeEnd]}
                      pathOptions={{
                        color,
                        weight: 6,
                        opacity: 0.95,
                        dashArray: '12 14',
                        lineCap: 'round',
                        lineJoin: 'round',
                        className: 'disaster-route-line'
                      }}
                    />
                    <Polyline
                      positions={[position, routeEnd]}
                      pathOptions={{
                        color: '#ffffff',
                        weight: 11,
                        opacity: 0.16,
                        lineCap: 'round',
                        lineJoin: 'round'
                      }}
                    />
                  </React.Fragment>
                )}
                {routeEnd && (
                  <CircleMarker center={position} radius={7} pathOptions={{ color: '#ffffff', weight: 3, fillColor: color, fillOpacity: 1 }} />
                )}
                <Marker position={position} icon={makeIcon(item.type)}>
                  <Popup>
                    <strong>{item.title || item.name}</strong>
                    {item.description && <p>{item.description}</p>}
                    {item.location && <p>{item.location}</p>}
                    {item.start_at && <small>From {new Date(item.start_at.replace(' ', 'T')).toLocaleString()}</small>}
                    {item.end_at && <small> · Until {new Date(item.end_at.replace(' ', 'T')).toLocaleString()}</small>}
                  </Popup>
                </Marker>
                {routeEnd && <Marker position={routeEnd} icon={makeIcon(item.type)} />}
              </React.Fragment>
            );
          })}
        </MapContainer>
        {pickMode && <div className="disaster-map-pick-hint">{pickHint || 'Click the map to set this location'}</div>}
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
          <span><i className="bi bi-arrow-repeat"></i> Refreshed hourly{lastWeatherUpdate ? ` · ${lastWeatherUpdate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}</span>
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