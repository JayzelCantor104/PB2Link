// WMO weather codes (Open-Meteo) to a plain label, a tone and an icon.
// Shared by the Disaster Risk map and the Home page snapshot.
const WEATHER_CODES = {
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
  99: { label: 'Severe thunderstorm', tone: 'storm' },
};

const TONE_ICONS = {
  sunny: 'bi-sun-fill',
  cloudy: 'bi-cloud-sun-fill',
  rainy: 'bi-cloud-rain-heavy-fill',
  storm: 'bi-cloud-lightning-rain-fill',
};

export const getWeatherInfo = (code) => {
  const info = WEATHER_CODES[code] || { label: 'Weather watch', tone: 'cloudy' };
  // Overcast and fog read better as a plain cloud.
  const icon = code === 3 || code === 45 || code === 48 ? 'bi-clouds-fill' : TONE_ICONS[info.tone];
  return { ...info, icon };
};
