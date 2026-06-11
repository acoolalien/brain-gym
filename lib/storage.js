// brain-gym storage helpers — dataDir read/write
import fs from "node:fs";
import path from "node:path";

export function readJSON(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function writeJSON(filePath, data) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// plan progress: { planId, currentDay, startedAt, dailyResults: { [day]: { game, score, time, completedAt } } }
export function loadProgress(dataDir) {
  const filePath = path.join(dataDir, "progress.json");
  return readJSON(filePath) || { planId: null, currentDay: 0, startedAt: null, dailyResults: {} };
}

export function saveProgress(dataDir, progress) {
  const filePath = path.join(dataDir, "progress.json");
  writeJSON(filePath, progress);
}
