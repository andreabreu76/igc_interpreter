const { getTerrainElevations } = require('./elevation');

const AGL_THRESHOLD = 20;
const MIN_GROUND_DURATION_SECONDS = 5;
const PROXIMITY_FLY_SPEED_KMH = 20;

function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function speedBetweenFixes(fix1, fix2) {
  const dt = (fix2.timestamp - fix1.timestamp) / 1000;
  if (dt <= 0) return 0;
  const dist = haversineDistanceMeters(fix1.latitude, fix1.longitude, fix2.latitude, fix2.longitude);
  return (dist / dt) * 3.6;
}

function classifyFixes(fixes, terrainElevations) {
  const states = new Array(fixes.length);

  for (let i = 0; i < fixes.length; i++) {
    const agl = fixes[i].gpsAltitude - (terrainElevations[i] || 0);
    const speed = i > 0 ? speedBetweenFixes(fixes[i - 1], fixes[i]) : 0;

    if (agl > AGL_THRESHOLD) {
      states[i] = 'flight';
    } else if (agl <= AGL_THRESHOLD && speed > PROXIMITY_FLY_SPEED_KMH) {
      states[i] = 'flight';
    } else {
      states[i] = 'ground';
    }
  }

  for (let i = 0; i < states.length; i++) {
    if (states[i] !== 'ground') continue;

    let groundEnd = i;
    while (groundEnd < states.length && states[groundEnd] === 'ground') groundEnd++;

    const duration = (fixes[Math.min(groundEnd, fixes.length - 1)].timestamp - fixes[i].timestamp) / 1000;

    if (duration < MIN_GROUND_DURATION_SECONDS) {
      for (let j = i; j < groundEnd; j++) states[j] = 'flight';
    }

    i = groundEnd - 1;
  }

  return states;
}

function splitTracklog(fixes, states) {
  const hikeFixes = [];
  const flightFixes = [];
  const hikeSegments = [];
  let currentSegment = [];

  for (let i = 0; i < fixes.length; i++) {
    if (states[i] === 'ground') {
      hikeFixes.push(fixes[i]);
      currentSegment.push(fixes[i]);
    } else {
      flightFixes.push(fixes[i]);
      if (currentSegment.length > 0) {
        hikeSegments.push([...currentSegment]);
        currentSegment = [];
      }
    }
  }
  if (currentSegment.length > 0) {
    hikeSegments.push(currentSegment);
  }

  return { hikeFixes, flightFixes, hikeSegments };
}

function calculateHikeMetrics(hikeSegments) {
  const mainHike = hikeSegments.reduce((a, b) => a.length > b.length ? a : b, []);
  if (mainHike.length < 2) return null;

  let totalDistance = 0;
  let elevationGain = 0;
  let maxSpeed = 0;

  for (let i = 1; i < mainHike.length; i++) {
    const dist = haversineDistanceMeters(
      mainHike[i - 1].latitude, mainHike[i - 1].longitude,
      mainHike[i].latitude, mainHike[i].longitude
    );
    totalDistance += dist;

    const altDiff = mainHike[i].gpsAltitude - mainHike[i - 1].gpsAltitude;
    if (altDiff > 0) elevationGain += altDiff;

    const speed = speedBetweenFixes(mainHike[i - 1], mainHike[i]);
    if (speed > maxSpeed && speed < 30) maxSpeed = speed;
  }

  const durationSeconds = (mainHike[mainHike.length - 1].timestamp - mainHike[0].timestamp) / 1000;
  const durationMinutes = durationSeconds / 60;
  const totalDistanceKm = totalDistance / 1000;
  const avgSpeed = durationSeconds > 0 ? (totalDistanceKm / (durationSeconds / 3600)) : 0;
  const pace = totalDistanceKm > 0 ? (durationMinutes / totalDistanceKm) : 0;

  const straightLine = haversineDistanceMeters(
    mainHike[0].latitude, mainHike[0].longitude,
    mainHike[mainHike.length - 1].latitude, mainHike[mainHike.length - 1].longitude
  );

  return {
    duration: Math.round(durationMinutes),
    totalDistance: Math.round(totalDistanceKm * 100) / 100,
    straightLineDistance: Math.round(straightLine) / 1000,
    avgSpeed: Math.round(avgSpeed * 10) / 10,
    maxSpeed: Math.round(maxSpeed * 10) / 10,
    pace: Math.round(pace * 10) / 10,
    elevationGain: Math.round(elevationGain),
    startPosition: {
      latitude: mainHike[0].latitude,
      longitude: mainHike[0].longitude,
      time: mainHike[0].timestamp
    },
    endPosition: {
      latitude: mainHike[mainHike.length - 1].latitude,
      longitude: mainHike[mainHike.length - 1].longitude,
      time: mainHike[mainHike.length - 1].timestamp
    }
  };
}

function calculateTotalMetrics(fixes, hikeMetrics, flightSummary) {
  if (fixes.length < 2) return null;

  const durationMinutes = (fixes[fixes.length - 1].timestamp - fixes[0].timestamp) / 60000;

  const straightLine = haversineDistanceMeters(
    fixes[0].latitude, fixes[0].longitude,
    fixes[fixes.length - 1].latitude, fixes[fixes.length - 1].longitude
  );

  const straightLineKm = straightLine / 1000;
  const avgSpeed = durationMinutes > 0 ? (straightLineKm / (durationMinutes / 60)) : 0;

  return {
    duration: Math.round(durationMinutes),
    straightLineDistance: Math.round(straightLineKm * 100) / 100,
    avgSpeed: Math.round(avgSpeed * 10) / 10
  };
}

async function detectHikeAndFly(fixes, onProgress) {
  const terrainElevations = await getTerrainElevations(fixes, 10, onProgress);
  const states = classifyFixes(fixes, terrainElevations);
  const { hikeFixes, flightFixes, hikeSegments } = splitTracklog(fixes, states);

  const isHikeAndFly = hikeFixes.length > 0 && flightFixes.length > 0;
  const hikeMetrics = hikeSegments.length > 0 ? calculateHikeMetrics(hikeSegments) : null;

  return {
    isHikeAndFly,
    hikeFixes,
    flightFixes,
    hikeSegments,
    hikeMetrics,
    terrainElevations,
    states
  };
}

module.exports = { detectHikeAndFly, calculateTotalMetrics };
