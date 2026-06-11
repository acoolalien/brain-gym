// start-game — agent tool: decide game, return PluginCard
import { readJSON } from "../lib/storage.js";
import path from "node:path";

export const name = "start_game";
export const description =
  "开始一局脑力热身游戏。可指定游戏名称，或随机选择一个。返回可交互的卡片游戏。";

export const parameters = {
  type: "object",
  properties: {
    game: { type: "string", description: "游戏名称：当前可用 schulte、gonogo、stroop。（更多游戏开发中：n-back, digit-span, task-switch）" },
    params: { type: "object", description: "游戏参数。gonogo: { size: 30|50|70, mode: standard|reversal }，默认 size=30 mode=standard。schulte: { size: 5|6|7, mode: standard|memory }。stroop: { size: 30|50|70, mode: standard|enhanced }" },
  },
  required: [],
};

function loadConfig(pluginDir) {
  return readJSON(path.join(pluginDir, "config.json"));
}

function isImplemented(config, gameName) {
  return config?.games?.[gameName]?.implemented === true;
}

function gameMeta(config, gameName) {
  return config?.games?.[gameName] || {};
}

function defaultParams(meta) {
  var defaults = {};
  var p = meta?.params;
  if (!p) return defaults;
  Object.keys(p).forEach(function (k) {
    if (p[k] && typeof p[k].default !== "undefined") {
      defaults[k] = p[k].default;
    }
  });
  return defaults;
}

export async function execute(input, toolCtx) {
  const log = toolCtx?.log || { info: () => {}, error: () => {} };

  try {
    const config = loadConfig(toolCtx.pluginDir);
    const game = input?.game;

    // No game specified → prompt with available options
    if (!game) {
      const implemented = Object.entries(config.games || {})
        .filter(([, v]) => v.implemented)
        .map(([k]) => config.games[k].label || k);
      return {
        content: [{ type: "text", text: `可选游戏：${implemented.join("、")}。说「来一局 schulte」开始。` }],
      };
    }

    // Check if game is implemented
    if (!isImplemented(config, game)) {
      const implementedGames = Object.entries(config.games || {})
        .filter(([, v]) => v.implemented)
        .map(([k]) => k);
      const hint = implementedGames.length > 0
        ? `当前可用：${implementedGames.map(g => config.games[g].label || g).join("、")}。说「来一局」开始。`
        : "暂无可用游戏。";
      return {
        content: [{ type: "text", text: `⏳ 「${game}」游戏模块尚未实现。${hint}` }],
      };
    }

    // Build card
    const token = getToken(toolCtx);
    const meta = gameMeta(config, game);
    const defaults = defaultParams(meta);
    const merged = Object.assign({}, defaults, input.params || {});
    const route = buildRoute(game, merged, token);

    log.info(`start_game: game=${game}, type=free`);

    return {
      content: [{ type: "text", text: `🧠 自由练习：${meta.label || game}` }],
      details: {
        card: {
          type: "iframe",
          route,
          description: `${meta.label || game} 认知训练游戏`,
          aspectRatio: meta.aspectRatio || "1:1",
        },
      },
    };
  } catch (err) {
    log.error("start_game failed", err.message);
    return {
      content: [{ type: "text", text: `游戏启动失败: ${err.message}` }],
    };
  }
}

function buildRoute(game, params, token) {
  const qs = new URLSearchParams();
  qs.set("game", game);
  if (params && Object.keys(params).length > 0) {
    Object.entries(params).forEach(([k, v]) => {
      qs.set(k, Array.isArray(v) ? v.join(",") : String(v));
    });
  }
  if (token) qs.set("token", token);
  return `/game?${qs.toString()}`;
}

function getToken(toolCtx) {
  try {
    return toolCtx.token || "";
  } catch {
    return "";
  }
}
