require('dotenv').config();
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

    if (!igcData.fixes || igcData.fixes.length === 0) {
      await fs.unlink(req.file.path);
      return res.status(400).json({ error: 'No GPS fixes found in IGC file' });
    }

    const summary = calculateFlightSummary(igcData.fixes, igcData);

    let xcScore = null;
    try {
      const { solver, scoringRules } = await import('igc-xc-score');

      const customMultipliers = {
        'Free Flight': parseFloat(process.env.XC_FREE_FLIGHT_MULTIPLIER) || 1.5,
        'Free Triangle': parseFloat(process.env.XC_FREE_TRIANGLE_MULTIPLIER) || 1.75,
        'FAI Triangle': parseFloat(process.env.XC_FAI_TRIANGLE_MULTIPLIER) || 2.0,
        'Closed Free Triangle': parseFloat(process.env.XC_FREE_TRIANGLE_MULTIPLIER) || 1.75,
        'Closed FAI Triangle': parseFloat(process.env.XC_FAI_TRIANGLE_MULTIPLIER) || 2.0
      };

      const customXContestRules = scoringRules.XContest.map(rule => {
        const customRule = {
          ...rule,
          multiplier: customMultipliers[rule.name] || rule.multiplier
        };

        if (rule.name === 'Free Triangle') {
          customRule.closingDistanceRelative = parseFloat(process.env.XC_FREE_TRIANGLE_CLOSING || 0.1);
        }

        return customRule;
      });

      function solveBest(flight, rules) {
        const it = solver(flight, rules);
        let result;
        do {
          result = it.next();
        } while (!result.done);
        return result.value;
      }

      const best = solveBest(igcData, customXContestRules);


      if (best && best.scoreInfo) {
        const rulesByCode = {};
        for (const rule of customXContestRules) {
          if (!rulesByCode[rule.code]) {
            rulesByCode[rule.code] = rule;
          }
        }

        const perType = {};
        let actualBest = null;
        let actualBestScore = 0;
        let actualBestResult = null;

        for (const [code, rule] of Object.entries(rulesByCode)) {
          try {
            const r = solveBest(igcData, [rule]);
            if (r && r.scoreInfo) {
              const distanceKm = r.scoreInfo.distance;
              const recalculatedScore = distanceKm * r.opt.scoring.multiplier;

              perType[code] = {
                name: r.opt.scoring.name,
                score: recalculatedScore,
                distance: r.scoreInfo.distance
              };

              if (recalculatedScore > actualBestScore) {
                actualBestScore = recalculatedScore;
                actualBestResult = r;
                actualBest = {
                  score: recalculatedScore,
                  distance: r.scoreInfo.distance,
                  type: r.opt.scoring.name,
                  multiplier: r.opt.scoring.multiplier
                };
              }
            }
          } catch (e) {
            // Ignore scoring errors for specific types
          }
        }

        const turnpoints = actualBestResult.scoreInfo.tp?.map(p => ({
          lat: p.y,
          lng: p.x,
          fixIndex: p.r
        })) || [];

        const closingPoints = actualBestResult.scoreInfo.cp ? {
          in: { lat: actualBestResult.scoreInfo.cp.in.y, lng: actualBestResult.scoreInfo.cp.in.x },
          out: { lat: actualBestResult.scoreInfo.cp.out.y, lng: actualBestResult.scoreInfo.cp.out.x }
        } : null;

        xcScore = {
          score: actualBest.score,
          distance: actualBest.distance,
          type: actualBest.type,
          multiplier: actualBest.multiplier,
          types: perType,
          turnpoints: turnpoints,
          closingPoints: closingPoints
        };
      }
    } catch (error) {
      console.error('Error calculating XC score:', error.message);
      console.error(error.stack);
    }

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
      xcScore,
      fixes: igcData.fixes
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

function calculateFlightSummary(fixes, igcData) {
  if (fixes.length < 2) {
    return {
      pilot: igcData?.pilot || 'N/A',
      gliderType: igcData?.gliderType || 'N/A',
      totalFixes: 0,
      startPosition: null,
      endPosition: null,
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

  const firstFix = fixes[0];
  const lastFix = fixes[fixes.length - 1];

  return {
    pilot: igcData?.pilot || 'N/A',
    gliderType: igcData?.gliderType || 'N/A',
    totalFixes: fixes.length,
    startPosition: {
      latitude: firstFix.latitude,
      longitude: firstFix.longitude,
      time: firstFix.timestamp
    },
    endPosition: {
      latitude: lastFix.latitude,
      longitude: lastFix.longitude,
      time: lastFix.timestamp
    },
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
