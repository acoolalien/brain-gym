// analysis — Agent tool: read all scores from JSONL, generate comprehensive report
import path from "node:path";
import fs from "node:fs";

export var name = "training_analysis";
export var description = "读取所有游戏的训练记录，返回综合统计分析报告。支持按游戏过滤和查看单条明细。";

export var parameters = {
  type: "object",
  properties: {
    game: { type: "string", description: "筛选特定游戏 schulte / gonogo / stroop。不传则返回全部" },
    limit: { type: "number", description: "最近 N 条记录，默认全部", default: 0 },
    mode: { type: "string", description: "summary（默认，综合统计） / detail（逐条明细，需指定 game）" },
  },
  required: [],
};

function shortGame(gameKey) {
  return (gameKey || "").split("_")[0] || gameKey;
}

function gameLabel(game) {
  return { schulte: "舒尔特表格", gonogo: "Go/No-Go", stroop: "Stroop 色词" }[shortGame(game)] || game;
}

function fmtPct(v) { return (v * 100).toFixed(1) + "%"; }
function fmtMs(v) { return Math.round(v) + "ms"; }

function fmtDate(iso) {
  if (!iso) return "-";
  var d = new Date(iso);
  var pad = function (n) { return n < 10 ? "0" + n : String(n); };
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate())
    + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
}

function readRecords(filePath) {
  try {
    var raw = fs.readFileSync(filePath, "utf-8");
    var lines = raw.trim().split("\n");
    var records = [];
    for (var i = 0; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      try { records.push(JSON.parse(lines[i])); } catch (e) {}
    }
    return records;
  } catch (e) {
    return null;
  }
}

function buildSummary(records, filterGame, limit) {
  if (filterGame) {
    records = records.filter(function (r) { return shortGame(r.game) === filterGame; });
  }
  if (limit > 0 && limit < records.length) {
    records = records.slice(records.length - limit);
  }

  var groups = {};
  for (var i = 0; i < records.length; i++) {
    var r = records[i];
    var g = shortGame(r.game) || "unknown";
    if (!groups[g]) groups[g] = [];
    groups[g].push(r.score);
  }

  var linesOut = [];
  var gameKeys = Object.keys(groups).sort();

  linesOut.push("## 训练综合分析");
  linesOut.push("");
  linesOut.push("共 **" + records.length + "** 条记录，" + gameKeys.length + " 个游戏。");
  linesOut.push("");

  for (var gi = 0; gi < gameKeys.length; gi++) {
    var gk = gameKeys[gi];
    var scores = groups[gk];
    var label = gameLabel(gk);

    linesOut.push("### " + label);
    linesOut.push("");
    linesOut.push("- 总次数：**" + scores.length + "** 局");

    if (gk === "schulte") {
      var times = scores.map(function (s) { return s.time || 0; });
      var best = Math.min.apply(null, times);
      var worst = Math.max.apply(null, times);
      var avg = times.reduce(function (a, b) { return a + b; }, 0) / times.length;
      linesOut.push("- 最快：**" + best.toFixed(1) + "s**　最慢：**" + worst.toFixed(1) + "s**");
      linesOut.push("- 平均用时：**" + avg.toFixed(1) + "s**");
      if (scores.length >= 3) {
        var recent = times.slice(-3);
        var trend = recent[2] < recent[0] ? "进步" : (recent[2] > recent[0] ? "退步" : "持平");
        linesOut.push("- 近期趋势：**" + trend + "**（近 3 局）");
      }
    } else if (gk === "gonogo") {
      var dprimes = scores.map(function (s) { return s.dprime || 0; });
      var best = Math.max.apply(null, dprimes);
      var avg = dprimes.reduce(function (a, b) { return a + b; }, 0) / dprimes.length;
      var goRTs = scores.map(function (s) { return s.goRT || 0; });
      var avgGoRT = goRTs.reduce(function (a, b) { return a + b; }, 0) / goRTs.length;
      // Mode breakdown
      var modes = {};
      for (var si = 0; si < scores.length; si++) {
        var m = scores[si].difficulty || "standard";
        if (!modes[m]) modes[m] = 0;
        modes[m]++;
      }
      var modeStr = Object.keys(modes).map(function (m) {
        return (m === "reversal" ? "反转" : "标准") + modes[m] + "局";
      }).join(" / ");
      linesOut.push("- 最佳 d'：**" + best.toFixed(2) + "**");
      linesOut.push("- 平均 d'：**" + avg.toFixed(2) + "**　平均 goRT：**" + Math.round(avgGoRT) + "ms**");
      linesOut.push("- 模式分布：" + modeStr);
    } else if (gk === "stroop") {
      var effects = scores.map(function (s) { return Math.abs(s.stroopEffect || 0); });
      var best = Math.min.apply(null, effects);
      var worst = Math.max.apply(null, effects);
      var avg = effects.reduce(function (a, b) { return a + b; }, 0) / effects.length;
      var modes = {};
      for (var si = 0; si < scores.length; si++) {
        var m = scores[si].difficulty || "standard";
        if (!modes[m]) modes[m] = 0;
        modes[m]++;
      }
      var modeStr = Object.keys(modes).map(function (m) {
        return (m === "enhanced" ? "高干扰" : "标准") + modes[m] + "局";
      }).join(" / ");
      linesOut.push("- 最佳效应量：**" + fmtMs(best) + "**　最大效应量：**" + fmtMs(worst) + "**");
      linesOut.push("- 平均效应量：**" + fmtMs(avg) + "**");
      linesOut.push("- 模式分布：" + modeStr);
    }
    linesOut.push("");
  }

  // Cross-game summary
  linesOut.push("---");
  linesOut.push("### 跨游戏概览");
  var mostGame = "", mostCount = 0;
  for (var gi = 0; gi < gameKeys.length; gi++) {
    if (groups[gameKeys[gi]].length > mostCount) {
      mostCount = groups[gameKeys[gi]].length;
      mostGame = gameLabel(gameKeys[gi]);
    }
  }
  if (mostGame) {
    linesOut.push("- 训练最多的游戏：**" + mostGame + "**（" + mostCount + " 局）");
  }
  var dates = records.map(function (r) { return new Date(r.savedAt || r.score?.date || 0); }).filter(Boolean);
  if (dates.length > 0) {
    var first = new Date(Math.min.apply(null, dates.map(Number)));
    var last = new Date(Math.max.apply(null, dates.map(Number)));
    linesOut.push("- 训练跨度：**" + first.toLocaleDateString("zh-CN") + "** 至 **" + last.toLocaleDateString("zh-CN") + "**");
  }
  linesOut.push("");

  return linesOut.join("\n");
}

function buildDetail(records, game, limit) {
  records = records.filter(function (r) { return shortGame(r.game) === game; });
  if (limit > 0 && limit < records.length) {
    records = records.slice(records.length - limit);
  }
  if (records.length === 0) {
    return "「" + gameLabel(game) + "」暂无训练记录。";
  }

  var linesOut = [];
  linesOut.push("## " + gameLabel(game) + " 逐条明细");
  linesOut.push("");

  if (game === "schulte") {
    linesOut.push("| # | 日期 | 用时 | 准确率 | 错误 | 模式 | 规模 |");
    linesOut.push("|---|------|------|--------|------|------|------|");
    for (var i = records.length - 1; i >= 0; i--) {
      var s = records[i].score;
      var num = records.length - i;
      var date = fmtDate(s.date || records[i].savedAt);
      linesOut.push("| " + num + " | " + date + " | **" + (s.time || "-").toFixed(1) + "s** | "
        + fmtPct(s.accuracy || 0) + " | " + (s.errors || 0) + " | "
        + (s.difficulty || "standard") + " | " + (s.size || "-") + " |");
    }
  } else if (game === "gonogo") {
    linesOut.push("| # | 日期 | d' | goRT | 命中率 | 误报率 | 误报次数 | 试次 | 模式 |");
    linesOut.push("|---|------|-----|------|--------|--------|----------|------|------|");
    for (var i = records.length - 1; i >= 0; i--) {
      var s = records[i].score;
      var num = records.length - i;
      var date = fmtDate(s.date || records[i].savedAt);
      linesOut.push("| " + num + " | " + date + " | **" + (s.dprime || 0).toFixed(2) + "** | "
        + Math.round(s.goRT || 0) + "ms | " + fmtPct(s.hitRate || 0) + " | "
        + fmtPct(s.falseAlarmRate || 0) + " | " + (s.commissionErrors || 0) + " | "
        + (s.totalTrials || "-") + " | " + (s.difficulty || "standard") + " |");
    }
  } else if (game === "stroop") {
    linesOut.push("| # | 日期 | 效应量 | 一致 RT | 不一致 RT | 一致正确率 | 不一致正确率 | 试次 | 模式 |");
    linesOut.push("|---|------|--------|---------|-----------|------------|--------------|------|------|");
    for (var i = records.length - 1; i >= 0; i--) {
      var s = records[i].score;
      var num = records.length - i;
      var date = fmtDate(s.date || records[i].savedAt);
      linesOut.push("| " + num + " | " + date + " | **" + (s.stroopEffect || 0) + "ms** | "
        + Math.round(s.congruentRT || 0) + "ms | " + Math.round(s.incongruentRT || 0) + "ms | "
        + fmtPct(s.congruentAcc || 0) + " | " + fmtPct(s.incongruentAcc || 0) + " | "
        + (s.totalTrials || "-") + " | " + (s.difficulty || "standard") + " |");
    }
  }

  linesOut.push("");
  linesOut.push("> 说「查看训练分析」查看综合统计。");
  return linesOut.join("\n");
}

export async function execute(input, toolCtx) {
  var dataDir = toolCtx.dataDir;
  var filePath = path.join(dataDir, "scores.jsonl");
  var filterGame = input?.game || null;
  var limit = input?.limit || 0;
  var mode = input?.mode || "summary";

  var records = readRecords(filePath);
  if (records === null) {
    return { content: [{ type: "text", text: "暂无训练记录。完成一局游戏后数据会自动保存。" }] };
  }
  if (records.length === 0) {
    return { content: [{ type: "text", text: (filterGame ? "「" + gameLabel(filterGame) + "」" : "") + "暂无训练记录。" }] };
  }

  if (mode === "detail" && filterGame) {
    var text = buildDetail(records, filterGame, limit);
    return { content: [{ type: "text", text: text }] };
  }

  var text = buildSummary(records, filterGame, limit);
  return { content: [{ type: "text", text: text }] };
}
