// game route — serve brain-gym game iframe, receive results
import { renderPage } from "./game-page.js";
import path from "node:path";
import fs from "node:fs";

export default function (app, ctx) {
  var pluginDir = ctx.pluginDir;
  var dataDir = ctx.dataDir;

  app.get("/game", (c) => {
    var configPath = path.join(pluginDir, "config.json");
    var config = { games: {} };
    try { config = JSON.parse(fs.readFileSync(configPath, "utf-8")); } catch (e) {}

    var game = c.req.query("game") || "schulte";
    var allowedGames = Object.keys(config.games || {});
    if (!allowedGames.includes(game)) {
      return c.text("unknown game", 400);
    }

    var gameCfg = config.games[game] || {};
    var defaultSize = gameCfg.params?.size?.default ?? 5;
    var size = parseInt(c.req.query("size") || String(defaultSize));
    var sizeMin = gameCfg.params?.size?.min ?? 3;
    var sizeMax = gameCfg.params?.size?.max ?? 8;
    if (isNaN(size) || size < sizeMin || size > sizeMax) {
      return c.text("invalid size", 400);
    }

    var token = c.req.query("token") || "";
    var html = renderPage({ game: game, size: size, token: token, pluginId: ctx.pluginId });

    return new Response(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  });

  // POST /game/result — receive game result from iframe, persist to JSONL
  app.post("/game/result", async (c) => {
    var body;
    try { body = await c.req.json(); } catch { return c.json({ ok: false, error: "invalid json" }, 400); }

    var game = body?.game;
    var score = body?.score;
    if (!game || !score) {
      return c.json({ ok: false, error: "missing game or score" }, 400);
    }

    try {
      fs.mkdirSync(dataDir, { recursive: true });
      var filePath = path.join(dataDir, "scores.jsonl");
      var record = JSON.stringify({ game: game, score: score, savedAt: new Date().toISOString() });
      fs.appendFileSync(filePath, record + "\n", "utf-8");
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ ok: false, error: err.message }, 500);
    }
  });
}
