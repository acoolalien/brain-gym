// results.js — 共享模块：分数存储 + 结果展示 + 趋势图表 + 评价引擎
var BrainGym = BrainGym || {};

(function (ns) {
  "use strict";

  var C = {
    text:      "#3C3628",
    textDim:   "#8C8474",
    textFaint: "#B8B0A0",
    accent:    "#C4956A",
    success:   "#7A8B6F",
    error:     "#C47A6A",
    rule:      "#DCD5C8",
    bg:        "#F5F0E8"
  };

  // ─── Score Storage ───────────────────
  ns.SCORE_KEY = "brain_gym_scores";
  ns.ROUND_KEY  = "brain_gym_rounds";

  ns.loadScores = function () {
    try { var raw = localStorage.getItem(ns.SCORE_KEY); return raw ? JSON.parse(raw) : {}; }
    catch (e) { return {}; }
  };

  ns.saveScore = function (gameType, entry) {
    var scores = ns.loadScores();
    if (!scores[gameType]) scores[gameType] = [];
    scores[gameType].push(entry);
    if (scores[gameType].length > 60) scores[gameType] = scores[gameType].slice(-60);
    try { localStorage.setItem(ns.SCORE_KEY, JSON.stringify(scores)); } catch (e) {}
    // Also submit to server if available
    try { if (window.__submitGameResult) window.__submitGameResult(gameType, entry); } catch (e) {}
  };

  ns.getGameHistory = function (gameType) {
    var scores = ns.loadScores();
    return scores[gameType] || [];
  };

  ns.getRound = function () {
    try { return parseInt(localStorage.getItem(ns.ROUND_KEY) || "0"); } catch (e) { return 0; }
  };
  ns.incRound = function () {
    var r = ns.getRound() + 1;
    try { localStorage.setItem(ns.ROUND_KEY, String(r)); } catch (e) {}
    return r;
  };
  ns.resetRounds = function () {
    try { localStorage.setItem(ns.ROUND_KEY, "0"); } catch (e) {}
  };

  // ─── Evaluation Engine ──────────────
  // Reads game-specific data from ns.EVAL (defined in evaluations.js)

  // higherIsBetter: true when higher score = better grade (e.g. d-prime), false when lower is better (e.g. time)
  ns.evaluate = function (game, variantKey, time, accuracy, higherIsBetter) {
    var composite = (typeof accuracy === "number" && accuracy > 0) ? time / accuracy : time;
    var gameData = ns.EVAL && ns.EVAL[game];
    var t = (gameData && gameData.thresholds && gameData.thresholds[variantKey])
      || [20, 28, 38, 55];
    if (higherIsBetter) {
      if (composite >= t[0]) return "S";
      if (composite >= t[1]) return "A";
      if (composite >= t[2]) return "B";
      if (composite >= t[3]) return "C";
      return "D";
    }
    if (composite <= t[0]) return "S";
    if (composite <= t[1]) return "A";
    if (composite <= t[2]) return "B";
    if (composite <= t[3]) return "C";
    return "D";
  };

  ns.pickComment = function (game, tier) {
    var gameData = ns.EVAL && ns.EVAL[game];
    var pool = (gameData && gameData.comments && gameData.comments[tier]) || ["继续训练，注意力的提升在于坚持"];
    return pool[Math.floor(Math.random() * pool.length)];
  };

  ns.pickLabel = function (game, variant) {
    var gameData = ns.EVAL && ns.EVAL[game];
    return (gameData && gameData.labels && gameData.labels[variant]) || variant;
  };
  ns.showResults = function (container, gameType, score, gameName) {
    var history = ns.getGameHistory(gameType);
    var isFirst = history.length === 1;
    var hasComparison = history.length >= 2;
    var showChart = history.length >= 5;
    var round = score.round || ns.getRound();

    container.innerHTML = "";
    container.style.color = C.text;
    container.style.fontSize = "13px";
    container.style.lineHeight = "1.7";
    container.style.letterSpacing = "0.02em";
    container.style.padding = "18px 24px 14px";
    container.style.width = "100%";

    // Title
    var title = el("div", "font-size:14px;font-weight:500;color:" + C.text + ";margin-bottom:2px;letter-spacing:0.04em", gameName || gameType);
    container.appendChild(title);

    // Mode tag
    if (score.modeKey) {
      var firstUs = score.modeKey.indexOf("_");
      var gameKey = firstUs > 0 ? score.modeKey.slice(0, firstUs) : score.modeKey;
      var variantKey = firstUs > 0 ? score.modeKey.slice(firstUs + 1) : score.modeKey;
      var label = ns.pickLabel(gameKey, variantKey);
      var tag = el("div", "font-size:10px;color:" + C.textFaint + ";margin-bottom:4px", label);
      container.appendChild(tag);
    }

    // Score — large
    var scoreText = [];
    if (typeof score.time === "number") scoreText.push(fmtTime(score.time));
    if (typeof score.accuracy === "number") scoreText.push(fmtAcc(score.accuracy));
    var scoreLine = el("div", "font-size:28px;font-weight:300;color:" + C.accent + ";margin-bottom:6px;font-variant-numeric:tabular-nums", scoreText.join("  "));
    container.appendChild(scoreLine);

    // Tier comment
    if (typeof score.time === "number") {
      var evalKey = score.modeKey || gameType;
      var firstUnderscore = evalKey.indexOf("_");
      var game = firstUnderscore > 0 ? evalKey.slice(0, firstUnderscore) : evalKey;
      var variant = firstUnderscore > 0 ? evalKey.slice(firstUnderscore + 1) : "default";
      var tier = ns.evaluate(game, variant, score.time, score.accuracy);
      var comment = ns.pickComment(game, tier);
      container.appendChild(el("div", "font-size:12px;color:" + C.textDim + ";margin-bottom:12px;font-style:italic", comment));
    }

    // Divider
    container.appendChild(el("div", "height:1px;background:" + C.rule + ";margin-bottom:12px;width:100%"));

    // First time
    if (isFirst) {
      container.appendChild(el("div", "font-size:12px;color:" + C.textDim + ";font-style:italic;text-align:right", "基线已记录，继续练习"));
      return;
    }

    // Comparison
    if (hasComparison) {
      var prev = history[history.length - 2];
      var comp = buildComparison(score, prev);
      if (comp) {
        container.appendChild(el("div", "text-align:right;font-size:12px;color:" + C.textDim + ";margin-bottom:12px;line-height:1.8", comp));
      }
    }

    // Chart
    if (showChart) {
      var cw = el("div", "margin-top:6px;height:90px;position:relative");
      container.appendChild(cw);
      ns.drawTrendChart(cw, history);
    }

    container.appendChild(el("div", "text-align:right;font-size:10px;color:" + C.textFaint + ";margin-top:6px", "共 " + history.length + " 次记录"));
  };

  function buildComparison(current, previous) {
    var lines = [];
    if (typeof current.time === "number" && typeof previous.time === "number") {
      var diff = previous.time - current.time;
      if (Math.abs(diff) > 0.1) {
        lines.push(diff > 0
          ? '<span style="color:' + C.success + '">比上次快 ' + diff.toFixed(1) + 's</span>'
          : '<span style="color:' + C.error + '">比上次慢 ' + Math.abs(diff).toFixed(1) + 's</span>');
      } else {
        lines.push('<span style="color:' + C.textDim + '">与上次持平</span>');
      }
    }
    if (typeof current.accuracy === "number" && typeof previous.accuracy === "number") {
      var aDiff = current.accuracy - previous.accuracy;
      if (Math.abs(aDiff) > 0.01) {
        lines.push(aDiff > 0
          ? '<span style="color:' + C.success + '">准确率 +' + (aDiff * 100).toFixed(0) + '%</span>'
          : '<span style="color:' + C.error + '">准确率 ' + (aDiff * 100).toFixed(0) + '%</span>');
      }
    }
    return lines.join("<br>");
  }

  // ─── Trend Chart ─────────────────────
  // Y-axis: lower score = better (higher on chart). Metric: time / accuracy.
  ns.drawTrendChart = function (container, history, opts) {
    opts = opts || {};
    var invert = opts.invert === true;
    var bestLabel = opts.label || "\u6700\u597d";
    var unit = opts.unit !== undefined ? opts.unit : "s";
    var canvas = document.createElement("canvas");
    var W = container.clientWidth || 360;
    var H = 90;
    canvas.width = W;
    canvas.height = H;
    canvas.style.width = "100%";
    canvas.style.height = H + "px";
    container.appendChild(canvas);

    var ctx = canvas.getContext("2d");
    var pad = { top: 4, right: 8, bottom: 16, left: 6 };

    // Build composite scores
    var scores = [];
    for (var i = 0; i < history.length; i++) {
      var s = history[i];
      if (typeof s.time === "number" && typeof s.accuracy === "number" && s.accuracy > 0) {
        scores.push(s.time / s.accuracy);
      } else if (typeof s.time === "number") {
        scores.push(s.time);
      }
    }
    if (scores.length < 2) return;

    var minS = Math.min.apply(null, scores);
    var maxS = Math.max.apply(null, scores);
    var range = maxS - minS || 1;
    var plotW = W - pad.left - pad.right;
    var plotH = H - pad.top - pad.bottom;

    // yPos: when invert=false, minS (best) → top; when invert=true, maxS (best) → top
    function yPos(v) {
      if (invert) {
        return pad.top + ((maxS - v) / range) * plotH;
      }
      return pad.top + ((v - minS) / range) * plotH;
    }

    // Baseline
    if (scores.length >= 3) {
      var firstY = yPos(scores[0]);
      ctx.strokeStyle = C.rule; ctx.lineWidth = 0.5; ctx.setLineDash([1, 4]);
      ctx.beginPath(); ctx.moveTo(pad.left, firstY); ctx.lineTo(W - pad.right, firstY); ctx.stroke();
      ctx.setLineDash([]);
    }

    // Latest rule
    var latestY = yPos(scores[scores.length - 1]);
    ctx.strokeStyle = C.rule; ctx.lineWidth = 0.5; ctx.setLineDash([3, 5]);
    ctx.beginPath(); ctx.moveTo(pad.left, latestY); ctx.lineTo(W - pad.right, latestY); ctx.stroke();
    ctx.setLineDash([]);

    // Trend line
    ctx.strokeStyle = C.accent; ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (var i = 0; i < scores.length; i++) {
      var px = pad.left + (i / (scores.length - 1)) * plotW;
      var py = yPos(scores[i]);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // End dot — aligned to latestY
    var ex = pad.left + plotW;
    ctx.fillStyle = C.accent; ctx.beginPath(); ctx.arc(ex, latestY, 2.5, 0, Math.PI * 2); ctx.fill();

    // Best score label — find best (min when invert=false, max when invert=true)
    var bestIdx = 0;
    for (var i = 1; i < scores.length; i++) {
      if (invert ? (scores[i] > scores[bestIdx]) : (scores[i] < scores[bestIdx])) {
        bestIdx = i;
      }
    }
    var bestX = pad.left + (bestIdx / (scores.length - 1)) * plotW;
    var bestY = yPos(scores[bestIdx]);
    ctx.font = "9px system-ui";
    ctx.fillStyle = C.textFaint;
    ctx.textBaseline = "top";
    ctx.textAlign = bestX > plotW * 0.6 ? "right" : "left";
    ctx.fillText(bestLabel + " " + scores[bestIdx].toFixed(1) + unit, bestX, bestY + 2);
  };

  // ─── Helpers ─────────────────────────
  function el(tag, style, html) {
    var d = document.createElement(tag);
    d.style.cssText = style;
    if (html) d.innerHTML = html;
    return d;
  }
  function fmtTime(t) { return t < 60 ? t.toFixed(1) + "s" : Math.floor(t / 60) + "m " + (t % 60).toFixed(0) + "s"; }
  function fmtAcc(a) { return (a * 100).toFixed(0) + "%"; }
})(BrainGym);
