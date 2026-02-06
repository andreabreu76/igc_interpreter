const express = require('express');
const multer = require('multer');
const fs = require('fs').promises;
const IGCParser = require('igc-parser');

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.static('public'));

app.post('/upload', upload.single('igcFile'), async (req, res) => {
  try {
    const fileContent = await fs.readFile(req.file.path, 'utf-8');
    const igcData = IGCParser.parse(fileContent);

    const summary = calculateFlightSummary(igcData.fixes);

    const flightInfo = {
      pilot: igcData.pilot,
      copilot: igcData.copilot,
      gliderType: igcData.gliderType,
      registration: igcData.registration,
      callsign: igcData.callsign,
      date: igcData.date,
      fixes: igcData.fixes.length,
      firstFix: igcData.fixes[0],
      lastFix: igcData.fixes[igcData.fixes.length - 1],
      maxAltitude: Math.max(...igcData.fixes.map(f => f.gpsAltitude || 0)),
      minAltitude: Math.min(...igcData.fixes.map(f => f.gpsAltitude || 0)),
      duration: calculateDuration(igcData.fixes),
      task: igcData.task,
      summary,
      fixes: igcData.fixes.slice(0, 100)
    };

    await fs.unlink(req.file.path);

    res.json(flightInfo);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

function calculateDuration(fixes) {
  if (fixes.length < 2) return 0;
  const start = new Date(fixes[0].timestamp);
  const end = new Date(fixes[fixes.length - 1].timestamp);
  return Math.round((end - start) / 1000 / 60);
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function calculateFlightSummary(fixes) {
  if (fixes.length < 2) {
    return {
      maxAltitude: 0,
      minAltitude: 0,
      maxSpeed: 0,
      totalDistance: 0,
      flightTime: 0,
      altitudeGain: 0
    };
  }

  let maxAltitude = -Infinity;
  let minAltitude = Infinity;
  let maxSpeed = 0;
  let totalDistance = 0;
  let totalClimb = 0;

  for (let i = 0; i < fixes.length; i++) {
    const fix = fixes[i];
    const alt = fix.gpsAltitude || 0;

    if (alt > maxAltitude) maxAltitude = alt;
    if (alt < minAltitude) minAltitude = alt;

    if (i > 0) {
      const prevFix = fixes[i - 1];
      const distance = haversineDistance(
        prevFix.latitude,
        prevFix.longitude,
        fix.latitude,
        fix.longitude
      );
      totalDistance += distance;

      const timeDiff = (new Date(fix.timestamp) - new Date(prevFix.timestamp)) / 1000;
      if (timeDiff > 0) {
        const speed = (distance / timeDiff) * 3600;
        if (speed > maxSpeed && speed < 300) maxSpeed = speed;
      }

      const altDiff = alt - (prevFix.gpsAltitude || 0);
      if (altDiff > 0) totalClimb += altDiff;
    }
  }

  const flightTime = calculateDuration(fixes);

  return {
    maxAltitude: Math.round(maxAltitude),
    minAltitude: Math.round(minAltitude),
    maxSpeed: Math.round(maxSpeed),
    totalDistance: Math.round(totalDistance * 10) / 10,
    flightTime,
    altitudeGain: Math.round(totalClimb)
  };
}

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`IGC Interpreter running at http://localhost:${PORT}`);
});
