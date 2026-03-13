// When migrating to Aerolog, replace this JSON file cache with a PostgreSQL table.
// Suggested schema:
//   CREATE TABLE elevation_cache (
//     coord_key VARCHAR(20) PRIMARY KEY,  -- "lat,lng" rounded to 4 decimal places
//     elevation REAL NOT NULL,
//     dataset VARCHAR(20) DEFAULT 'srtm30m',
//     created_at TIMESTAMP DEFAULT NOW()
//   );
// The lookup/save logic stays the same, just swap fs read/write for SQL queries.

const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join(__dirname, 'elevation-cache.json');
const API_BASE = 'https://api.opentopodata.org/v1/srtm30m';
const MAX_LOCATIONS_PER_REQUEST = 100;
const REQUEST_DELAY_MS = 1100;
const COORD_PRECISION = 4;

function roundCoord(value) {
  return parseFloat(value.toFixed(COORD_PRECISION));
}

function coordKey(lat, lng) {
  return `${roundCoord(lat)},${roundCoord(lng)}`;
}

function loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
    }
  } catch (e) {
    console.error('Failed to load elevation cache:', e.message);
  }
  return {};
}

function saveCache(cache) {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
  } catch (e) {
    console.error('Failed to save elevation cache:', e.message);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchElevations(locations) {
  const locString = locations.map(l => `${l.lat},${l.lng}`).join('|');
  const url = `${API_BASE}?locations=${locString}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`OpenTopoData API error: ${response.status}`);
  }

  const data = await response.json();
  if (data.status !== 'OK') {
    throw new Error(`OpenTopoData API error: ${data.error || data.status}`);
  }

  return data.results;
}

async function getTerrainElevations(fixes, sampleIntervalSeconds = 10, onProgress) {
  const cache = loadCache();
  const sampled = [];
  let lastTimestamp = -Infinity;

  for (let i = 0; i < fixes.length; i++) {
    const fix = fixes[i];
    const elapsed = (fix.timestamp - fixes[0].timestamp) / 1000;

    if (i === 0 || i === fixes.length - 1 || elapsed - lastTimestamp >= sampleIntervalSeconds) {
      sampled.push({ index: i, lat: roundCoord(fix.latitude), lng: roundCoord(fix.longitude) });
      lastTimestamp = elapsed;
    }
  }

  const uncached = [];
  const elevationMap = {};

  for (const point of sampled) {
    const key = coordKey(point.lat, point.lng);
    if (cache[key] !== undefined) {
      elevationMap[point.index] = cache[key];
    } else {
      uncached.push(point);
    }
  }

  const cached = sampled.length - uncached.length;

  if (uncached.length > 0) {
    if (onProgress) onProgress(`Elevacao: ${cached} pontos no cache, ${uncached.length} pendentes da API...`);

    const batches = [];
    for (let i = 0; i < uncached.length; i += MAX_LOCATIONS_PER_REQUEST) {
      batches.push(uncached.slice(i, i + MAX_LOCATIONS_PER_REQUEST));
    }

    for (let b = 0; b < batches.length; b++) {
      if (b > 0) await sleep(REQUEST_DELAY_MS);

      if (onProgress) onProgress(`Elevacao: consultando API batch ${b + 1}/${batches.length}...`);

      const batch = batches[b];
      const results = await fetchElevations(batch.map(p => ({ lat: p.lat, lng: p.lng })));

      for (let j = 0; j < results.length; j++) {
        const elevation = results[j].elevation;
        const point = batch[j];
        const key = coordKey(point.lat, point.lng);
        cache[key] = elevation;
        elevationMap[point.index] = elevation;
      }
    }

    saveCache(cache);
  } else {
    if (onProgress) onProgress(`Elevacao: todos os ${cached} pontos encontrados no cache`);
  }

  const result = new Array(fixes.length);
  const sampledIndices = Object.keys(elevationMap).map(Number).sort((a, b) => a - b);

  for (let i = 0; i < fixes.length; i++) {
    if (elevationMap[i] !== undefined) {
      result[i] = elevationMap[i];
      continue;
    }

    let before = null, after = null;
    for (const idx of sampledIndices) {
      if (idx <= i) before = idx;
      if (idx >= i && after === null) after = idx;
    }

    if (before !== null && after !== null && before !== after) {
      const ratio = (i - before) / (after - before);
      result[i] = elevationMap[before] + ratio * (elevationMap[after] - elevationMap[before]);
    } else if (before !== null) {
      result[i] = elevationMap[before];
    } else if (after !== null) {
      result[i] = elevationMap[after];
    }
  }

  return result;
}

module.exports = { getTerrainElevations, coordKey, roundCoord };
