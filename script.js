const GEO_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

const DEFAULT_LOCATION = {
  name: 'Manchester',
  admin1: 'England',
  country: 'United Kingdom',
  latitude: 53.4808,
  longitude: -2.2426,
};

const els = {
  searchInput: document.querySelector('#location-search'),
  searchButton: document.querySelector('#search-button'),
  searchResults: document.querySelector('#search-results'),
  searchStatus: document.querySelector('#search-status'),
  panelContent: document.querySelector('#panel-content'),
  loadingState: document.querySelector('#loading-state'),
  errorState: document.querySelector('#error-state'),
  errorMessage: document.querySelector('#error-message'),
  retryButton: document.querySelector('#retry-button'),
  weatherContent: document.querySelector('#weather-content'),
  locationName: document.querySelector('#location-name'),
  updatedTime: document.querySelector('#updated-time'),
  currentIcon: document.querySelector('#current-icon'),
  currentCondition: document.querySelector('#current-condition'),
  currentTemp: document.querySelector('#current-temp'),
  feelsLike: document.querySelector('#feels-like'),
  windSpeed: document.querySelector('#wind-speed'),
  merchMessage: document.querySelector('#merch-message'),
  forecastGrid: document.querySelector('#forecast-grid'),
};

let selectedLocation = DEFAULT_LOCATION;
let searchController;
let forecastController;
let debounceTimer;

const WEATHER_CODES = {
  0: ['Clear sky', '☀️'],
  1: ['Mainly clear', '🌤️'],
  2: ['Partly cloudy', '⛅'],
  3: ['Overcast', '☁️'],
  45: ['Fog', '🌫️'],
  48: ['Rime fog', '🌫️'],
  51: ['Light drizzle', '🌦️'],
  53: ['Moderate drizzle', '🌦️'],
  55: ['Dense drizzle', '🌧️'],
  56: ['Light freezing drizzle', '🌧️'],
  57: ['Dense freezing drizzle', '🌧️'],
  61: ['Light rain', '🌦️'],
  63: ['Moderate rain', '🌧️'],
  65: ['Heavy rain', '🌧️'],
  66: ['Light freezing rain', '🌧️'],
  67: ['Heavy freezing rain', '🌧️'],
  71: ['Light snow', '🌨️'],
  73: ['Moderate snow', '🌨️'],
  75: ['Heavy snow', '❄️'],
  77: ['Snow grains', '❄️'],
  80: ['Light rain showers', '🌦️'],
  81: ['Moderate rain showers', '🌧️'],
  82: ['Heavy rain showers', '🌧️'],
  85: ['Light snow showers', '🌨️'],
  86: ['Heavy snow showers', '❄️'],
  95: ['Thunderstorm', '⛈️'],
  96: ['Thunderstorm with light hail', '⛈️'],
  99: ['Thunderstorm with heavy hail', '⛈️'],
};

function weatherInfo(code, isDay = 1) {
  if (isDay === 0 && (code === 0 || code === 1)) {
    return [WEATHER_CODES[code][0], '🌙'];
  }
  return WEATHER_CODES[code] || ['Changeable', '🌥️'];
}

function setPanelState(state, message = '') {
  els.panelContent.setAttribute('aria-busy', state === 'loading' ? 'true' : 'false');
  els.loadingState.hidden = state !== 'loading';
  els.errorState.hidden = state !== 'error';
  els.weatherContent.hidden = state !== 'success';
  if (message) els.errorMessage.textContent = message;
}

function setSearchBusy(isBusy) {
  els.searchButton.disabled = isBusy;
  els.searchButton.textContent = isBusy ? 'Searching…' : 'Search';
}

function closeResults() {
  els.searchResults.hidden = true;
  els.searchResults.innerHTML = '';
  els.searchInput.setAttribute('aria-expanded', 'false');
}

function formatLocation(location) {
  const region = location.admin1 && location.admin1 !== location.name ? location.admin1 : '';
  return [location.name, region].filter(Boolean).join(', ');
}

function uniqueLocations(results) {
  const seen = new Set();
  return results.filter((location) => {
    const key = `${location.name}|${location.admin1 || ''}|${location.latitude}|${location.longitude}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchJsonWithTimeout(url, controller, timeoutMs) {
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
    return await response.json();
  } catch (error) {
    if (error.name === 'AbortError' && timedOut) {
      throw new Error('The request took too long. Please try again.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function searchLocations(query) {
  const term = query.trim();

  if (searchController) {
    searchController.abort();
    searchController = null;
    setSearchBusy(false);
  }

  if (term.length < 2) {
    closeResults();
    els.searchStatus.textContent = term ? 'Type at least 2 characters.' : '';
    return;
  }

  const controller = new AbortController();
  searchController = controller;
  setSearchBusy(true);
  els.searchStatus.textContent = '';

  const params = new URLSearchParams({
    name: term,
    count: '5',
    countryCode: 'GB',
    language: 'en',
    format: 'json',
  });

  try {
    const data = await fetchJsonWithTimeout(`${GEO_URL}?${params}`, controller, 7000);
    if (controller !== searchController) return;

    const results = uniqueLocations(data.results || []);

    if (!results.length) {
      closeResults();
      els.searchStatus.textContent = 'No UK towns or cities found. Try another search.';
      return;
    }

    els.searchResults.innerHTML = results.map((location, index) => {
      const secondary = [location.admin1, location.country].filter(Boolean).join(' · ');
      return `
        <button class="result-button" type="button" role="option" data-index="${index}">
          <strong>${escapeHtml(location.name)}</strong>
          <span>${escapeHtml(secondary)}</span>
        </button>
      `;
    }).join('');

    els.searchResults.hidden = false;
    els.searchInput.setAttribute('aria-expanded', 'true');

    els.searchResults.querySelectorAll('.result-button').forEach((button) => {
      button.addEventListener('click', () => chooseLocation(results[Number(button.dataset.index)]));
    });
  } catch (error) {
    if (error.name === 'AbortError') return;
    closeResults();
    els.searchStatus.textContent = error.message.includes('too long')
      ? error.message
      : 'Location search failed. Please try again.';
  } finally {
    if (controller === searchController) {
      setSearchBusy(false);
      searchController = null;
    }
  }
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function chooseLocation(location) {
  selectedLocation = {
    name: location.name,
    admin1: location.admin1 || '',
    country: location.country || 'United Kingdom',
    latitude: location.latitude,
    longitude: location.longitude,
  };

  els.searchInput.value = formatLocation(selectedLocation);
  els.searchStatus.textContent = '';
  closeResults();
  await loadForecast(selectedLocation);
}

async function loadForecast(location) {
  if (forecastController) forecastController.abort();
  const controller = new AbortController();
  forecastController = controller;
  setPanelState('loading');

  const params = new URLSearchParams({
    latitude: location.latitude,
    longitude: location.longitude,
    current: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    timezone: 'Europe/London',
    forecast_days: '4',
  });

  try {
    const data = await fetchJsonWithTimeout(`${FORECAST_URL}?${params}`, controller, 9000);
    if (controller !== forecastController) return;
    validateForecast(data);
    renderWeather(data, location);
    setPanelState('success');
  } catch (error) {
    if (error.name === 'AbortError') return;
    if (controller !== forecastController) return;
    setPanelState(
      'error',
      error.message.includes('too long')
        ? error.message
        : 'The weather service is unavailable right now. Please retry.',
    );
  } finally {
    if (controller === forecastController) forecastController = null;
  }
}

function validateForecast(data) {
  const current = data?.current;
  const daily = data?.daily;
  const requiredCurrentValues = [
    current?.temperature_2m,
    current?.apparent_temperature,
    current?.weather_code,
    current?.wind_speed_10m,
    current?.precipitation,
    current?.is_day,
  ];
  const hasCurrent = typeof current?.time === 'string'
    && requiredCurrentValues.every(Number.isFinite);

  const hasFourDays = daily?.time?.length >= 4
    && daily?.weather_code?.length >= 4
    && daily?.temperature_2m_max?.length >= 4
    && daily?.temperature_2m_min?.length >= 4
    && daily?.precipitation_probability_max?.length >= 4
    && [0, 1, 2, 3].every((index) => (
      typeof daily.time[index] === 'string'
      && Number.isFinite(daily.weather_code[index])
      && Number.isFinite(daily.temperature_2m_max[index])
      && Number.isFinite(daily.temperature_2m_min[index])
      && Number.isFinite(daily.precipitation_probability_max[index])
    ));

  if (!hasCurrent || !hasFourDays) {
    throw new Error('The weather service returned incomplete data.');
  }
}

function renderWeather(data, location) {
  const current = data.current;
  const [condition, icon] = weatherInfo(current.weather_code, current.is_day);

  els.locationName.textContent = formatLocation(location);
  els.updatedTime.textContent = `Updated ${formatUpdatedTime(current.time)}`;
  els.currentIcon.textContent = icon;
  els.currentCondition.textContent = condition;
  els.currentTemp.textContent = Math.round(current.temperature_2m);
  els.feelsLike.textContent = Math.round(current.apparent_temperature);
  els.windSpeed.textContent = Math.round(current.wind_speed_10m);
  els.merchMessage.textContent = merchandisingMessage(current, data.daily);
  renderForecast(data.daily);
}

function merchandisingMessage(current, daily) {
  const rainyCodes = new Set([
    51, 53, 55, 56, 57,
    61, 63, 65, 66, 67,
    80, 81, 82,
    95, 96, 99
  ]);

  const snowCodes = new Set([
    71, 73, 75, 77, 85, 86
  ]);

  const fogCodes = new Set([45, 48]);
  const clearCodes = new Set([0, 1]);

  const rainChanceToday = Number(
    daily.precipitation_probability_max?.[0] || 0
  );

  // Rain or a high chance of rain
  if (
    rainyCodes.has(current.weather_code) ||
    current.precipitation > 0 ||
    rainChanceToday >= 60
  ) {
    return 'Waterproofs are 20% off this week.';
  }

  // Snow or cold conditions
  if (
    snowCodes.has(current.weather_code) ||
    current.apparent_temperature <= 7
  ) {
    return 'Time for knitwear and insulated layers.';
  }

  // Strong wind
  if (current.wind_speed_10m >= 30) {
    return 'Windproof layers for blustery days.';
  }

  // Warm conditions
  if (current.temperature_2m >= 18) {
    return 'Keep it light with breathable outer layers.';
  }

  // Foggy conditions
  if (fogCodes.has(current.weather_code)) {
    return 'A practical outer layer for cool, misty conditions.';
  }

  // Clear but mild conditions
  if (clearCodes.has(current.weather_code)) {
    return 'Clear skies, a lightweight jacket should do.';
  }

  // Cloudy / mild conditions
  return 'A lightweight jacket is a smart layer today.';
}

function renderForecast(daily) {
  const cards = [1, 2, 3].map((index) => {
    const [condition, icon] = weatherInfo(daily.weather_code[index]);
    const high = Math.round(daily.temperature_2m_max[index]);
    const low = Math.round(daily.temperature_2m_min[index]);
    const rain = Math.round(daily.precipitation_probability_max[index] || 0);

    return `
      <article class="forecast-card">
        <div class="forecast-card-top">
          <p class="forecast-day">${formatDay(daily.time[index])}</p>
          <span class="forecast-icon" aria-hidden="true">${icon}</span>
        </div>
        <p class="forecast-condition">${escapeHtml(condition)}</p>
        <div class="forecast-meta">
          <div class="forecast-temp">${high}° <span>/ ${low}°</span></div>
          <div class="rain-chance">${rain}% rain</div>
        </div>
      </article>
    `;
  });

  els.forecastGrid.innerHTML = cards.join('');
}

function formatDay(dateString) {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'Europe/London' })
    .format(new Date(`${dateString}T12:00:00Z`));
}

function formatUpdatedTime(dateTimeString) {
  const time = String(dateTimeString).split('T')[1];
  return time ? time.slice(0, 5) : 'just now';
}

els.searchButton.addEventListener('click', () => {
  clearTimeout(debounceTimer);
  searchLocations(els.searchInput.value);
});

els.searchInput.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => searchLocations(els.searchInput.value), 450);
});

els.searchInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    clearTimeout(debounceTimer);
    searchLocations(els.searchInput.value);
  }
  if (event.key === 'Escape') closeResults();
});

els.retryButton.addEventListener('click', () => loadForecast(selectedLocation));

document.addEventListener('click', (event) => {
  if (!event.target.closest('.search-wrap')) closeResults();
});

els.searchInput.value = formatLocation(selectedLocation);
loadForecast(selectedLocation);
