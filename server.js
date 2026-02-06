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

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`IGC Interpreter running at http://localhost:${PORT}`);
});
