// schulte.js — 暖纸主题 舒尔特表格
// 模式：标准（已点暗化）/ 记忆（0.2s闪后恢复，需记忆进度）
// 难度：5×5 / 6×6 / 7×7，分6个统计分类
var SchulteGrid = (function () {
  "use strict";

  var C = {
    bg:        "#F5F0E8",
    panel:     "#EDE7D9",
    text:      "#3C3628",
    textDim:   "#8C8474",
    textFaint: "#B8B0A0",
    accent:    "#C4956A",
    success:   "#7A8B6F",
    error:     "#C47A6A",
    rule:      "#DCD5C8",
    cellBg:    "#EDE7D9",
    cellFound: "#E8E2D0",
    flash:     "#D4A76A"
  };

  function SchulteGrid(opts) {
    this.container = typeof opts.container === "string" ? document.getElementById(opts.container) : opts.container;
    this.size = opts.size || 5;
    this.difficulty = "easy"; // easy | hard

    this.totalCells = 0;
    this.grid = [];
    this.target = 1;
    this.startTime = 0;
    this.timerId = null;
    this.errors = 0;
    this.totalClicks = 0;
    this.foundCells = {};
    this.round = 0;
    this.started = false;

    this.canvas = null;
    this.ctx = null;
    this.cellSize = 0;
    this.canvasW = 0;
    this.canvasH = 0;
    this.state = "ready";

    this.init();
  }

  SchulteGrid.prototype.statKey = function () {
    var mode = this.difficulty === "hard" ? "memory" : "standard";
    return "schulte_" + mode + "_" + this.size;
  };

  SchulteGrid.prototype.init = function () {
    this.totalCells = this.size * this.size;
    this.round = (typeof BrainGym !== "undefined" && BrainGym.incRound) ? BrainGym.incRound() : 1;
    if (this.round === 1 && typeof BrainGym !== "undefined" && BrainGym.resetRounds) {
      BrainGym.resetRounds();
      this.round = BrainGym.incRound();
    }
    this.generateGrid();
    this.createUI();
    this.calcLayout();
    this.bindEvents();
    this.draw();
    if (this.round === 1) this.showGuide();
    else this.showStartOverlay();
  };

  SchulteGrid.prototype.generateGrid = function () {
    var nums = [];
    for (var i = 1; i <= this.totalCells; i++) nums.push(i);
    for (var j = nums.length - 1; j > 0; j--) {
      var k = Math.floor(Math.random() * (j + 1));
      var tmp = nums[j]; nums[j] = nums[k]; nums[k] = tmp;
    }
    this.grid = nums;
    this.foundCells = {};
    this.target = 1;
    this.errors = 0;
    this.totalClicks = 0;
  };

  SchulteGrid.prototype.createUI = function () {
    this.container.innerHTML = "";
    this.container.style.cssText = "width:100%;height:100%;display:flex;flex-direction:column;padding:0";

    // Top bar
    this.topBar = document.createElement("div");
    this.topBar.style.cssText =
      "flex-shrink:0;display:flex;justify-content:space-between;align-items:center;" +
      "padding:6px 10px 2px;font-size:11px;color:" + C.textDim;
    this.topBar.innerHTML =
      '<span style="flex:1"></span>' +
      '<span style="display:flex;gap:6px;align-items:center">' +
        '<select id="schulte-mode" style="font:inherit;font-size:11px;color:inherit;background:none;border:1px solid ' + C.rule + ';border-radius:2px;padding:1px 4px;cursor:pointer">' +
          '<option value="easy"' + (this.difficulty === "easy" ? " selected" : "") + '>标准</option>' +
          '<option value="hard"' + (this.difficulty === "hard" ? " selected" : "") + '>记忆</option>' +
        '</select>' +
        '<select id="schulte-size" style="font:inherit;font-size:11px;color:inherit;background:none;border:1px solid ' + C.rule + ';border-radius:2px;padding:1px 4px;cursor:pointer">' +
          '<option value="5"' + (this.size === 5 ? " selected" : "") + '>5x5</option>' +
          '<option value="6"' + (this.size === 6 ? " selected" : "") + '>6x6</option>' +
          '<option value="7"' + (this.size === 7 ? " selected" : "") + '>7x7</option>' +
        '</select>' +
        '<button id="schulte-retry" style="font:inherit;font-size:11px;color:' + C.textDim + ';background:none;border:1px solid ' + C.rule + ';border-radius:2px;padding:1px 6px;cursor:pointer">重试</button>' +
      '</span>';
    this.container.appendChild(this.topBar);

    var self = this;
    this.topBar.querySelector("#schulte-mode").addEventListener("change", function () {
      self.difficulty = this.value;
      if (self.started) self.draw();
    });
    this.topBar.querySelector("#schulte-size").addEventListener("change", function () {
      var newSize = parseInt(this.value);
      if (newSize !== self.size) { self.size = newSize; self.totalCells = self.size * self.size; self.retry(); }
    });
    this.topBar.querySelector("#schulte-retry").addEventListener("click", function () { self.retry(); });

    // Status bar
    this.statusBar = document.createElement("div");
    this.statusBar.style.cssText =
      "flex-shrink:0;display:flex;gap:12px;align-items:baseline;" +
      "padding:2px 10px;font-size:12px;color:" + C.textDim + ";letter-spacing:0.03em";
    this.statusBar.innerHTML =
      '<span style="font-weight:400">1 &rarr; ' + this.totalCells + '</span>' +
      '<span id="schulte-timer" style="font-variant-numeric:tabular-nums;color:' + C.textFaint + '">0.0s</span>';
    this.container.appendChild(this.statusBar);

    // Grid area — fills remaining height, maintains square ratio
    this.gridArea = document.createElement("div");
    this.gridArea.style.cssText =
      "flex:1;display:flex;align-items:center;justify-content:center;" +
      "padding:6px 10px 10px;position:relative;min-height:0";
    this.container.appendChild(this.gridArea);

    this.canvas = document.createElement("canvas");
    this.canvas.style.cssText = "display:block;cursor:pointer;border-radius:2px;flex-shrink:0";
    this.gridArea.appendChild(this.canvas);
    this.ctx = this.canvas.getContext("2d");

    // Start overlay
    this.startOverlay = document.createElement("div");
    this.startOverlay.style.cssText =
      "position:absolute;top:0;left:0;right:0;bottom:0;" +
      "display:flex;align-items:center;justify-content:center;z-index:5";
    this.startOverlay.innerHTML =
      '<button id="schulte-start" style="padding:6px 28px;font-size:14px;color:' + C.accent + ';background:' + C.bg + ';border:1px solid ' + C.accent + ';border-radius:3px;cursor:pointer;letter-spacing:0.05em;font-family:inherit">开始</button>';
    this.gridArea.appendChild(this.startOverlay);
    this.startOverlay.querySelector("#schulte-start").addEventListener("click", function () { self.startGame(); });

    // Guide overlay
    this.guideEl = document.createElement("div");
    this.guideEl.style.cssText = "display:none";
    this.container.appendChild(this.guideEl);

    // Results area
    this.resultsEl = document.createElement("div");
    this.resultsEl.style.cssText = "display:none;width:100%";
    this.container.appendChild(this.resultsEl);
  };

  SchulteGrid.prototype.showStartOverlay = function () {
    if (this.startOverlay) this.startOverlay.style.display = "flex";
  };

  SchulteGrid.prototype.startGame = function () {
    if (this.startOverlay) this.startOverlay.style.display = "none";
    this.started = true;
    this.state = "playing";
    this.startTime = performance.now();
    this.startTimer();
    this.draw();
  };

  SchulteGrid.prototype.showGuide = function () {
    var self = this;
    if (this.startOverlay) this.startOverlay.style.display = "none";
    var modeLabel = this.difficulty === "hard" ? "记忆" : "标准";
    var g = this.guideEl;
    g.style.cssText =
      "position:absolute;top:0;left:0;right:0;bottom:0;" +
      "background:" + C.bg + ";display:flex;flex-direction:column;" +
      "align-items:center;justify-content:center;padding:20px 28px;z-index:10";
    g.innerHTML =
      '<div style="max-width:320px;text-align:left;font-size:13px;line-height:1.8;color:' + C.text + '">' +
        '<p style="font-size:15px;font-weight:500;margin-bottom:10px;color:' + C.accent + '">舒尔特表格 ' + this.size + '&times;' + this.size + '</p>' +
        '<p style="color:' + C.textDim + ';margin-bottom:6px">网格中有 ' + this.totalCells + ' 个数字，随机排列。从 <b style="color:' + C.text + '">1</b> 开始按升序依次点击。</p>' +
        '<p style="color:' + C.textDim + ';margin-bottom:6px">当前模式：<b style="color:' + C.text + '">' + modeLabel + '</b>。右上角可切换模式和网格大小。</p>' +
        '<p style="color:' + C.textDim + ';margin-bottom:6px">标准模式：已点数字保持暗化。记忆模式：点击后仅闪0.2秒即恢复，需自己记住进度。</p>' +
        '<p style="color:' + C.textFaint + ';margin-bottom:14px;font-size:11px">点击「开始」启动计时。点错计入失误但不影响进度。每种模式和网格大小单独统计。</p>' +
        '<button id="schulte-guide-ok" style="display:block;margin:0 auto;padding:5px 24px;font-size:13px;color:' + C.accent + ';background:none;border:1px solid ' + C.accent + ';border-radius:3px;cursor:pointer;letter-spacing:0.04em;font-family:inherit">开始</button>' +
      '</div>';
    this.gridArea.style.opacity = "0.3";
    g.querySelector("#schulte-guide-ok").addEventListener("click", function () {
      g.style.display = "none";
      self.gridArea.style.opacity = "1";
      self.showStartOverlay();
    });
  };

  SchulteGrid.prototype.retry = function () {
    if (this.state === "playing") { clearInterval(this.timerId); }
    this.state = "ready";
    this.started = false;
    this.startTime = 0;

    this.round = (typeof BrainGym !== "undefined" && BrainGym.incRound) ? BrainGym.incRound() : this.round + 1;

    // Restore game UI — finish() hides these
    this.resultsEl.style.display = "none";
    this.gridArea.style.display = "flex";
    this.gridArea.style.opacity = "1";
    this.statusBar.style.display = "flex";
    this.statusBar.querySelector("span").textContent = "1 \u2192 " + this.totalCells;
    if (this.guideEl) this.guideEl.style.display = "none";

    this.generateGrid();
    this.calcLayout();
    this.draw();

    var timerEl = document.getElementById("schulte-timer");
    if (timerEl) timerEl.textContent = "0.0s";

    var sizeSel = this.topBar.querySelector("#schulte-size");
    if (sizeSel) sizeSel.value = String(this.size);

    this.showStartOverlay();
    this.resizeHost();
  };

  SchulteGrid.prototype.calcLayout = function () {
    // Fill available width with square grid
    var availW = this.container.clientWidth - 20;
    var availH = this.gridArea.clientHeight - 12;
    var maxDim = Math.min(availW, availH);
    this.cellSize = Math.floor(maxDim / this.size);
    this.canvasW = this.cellSize * this.size;
    this.canvasH = this.canvasW;
    this.canvas.width = this.canvasW;
    this.canvas.height = this.canvasH;
  };

  SchulteGrid.prototype.resizeHost = function () {};

  SchulteGrid.prototype.bindEvents = function () {
    var self = this;
    var handler = function (clientX, clientY) {
      if (!self.started || self.state === "done") return;
      var rect = self.canvas.getBoundingClientRect();
      var scaleX = self.canvasW / rect.width;
      var scaleY = self.canvasH / rect.height;
      var col = Math.floor((clientX - rect.left) * scaleX / self.cellSize);
      var row = Math.floor((clientY - rect.top) * scaleY / self.cellSize);
      if (col < 0 || col >= self.size || row < 0 || row >= self.size) return;
      self.handleClick(row, col);
    };
    this.canvas.addEventListener("click", function (e) { handler(e.clientX, e.clientY); });
    this.canvas.addEventListener("touchend", function (e) {
      e.preventDefault();
      var t = e.changedTouches[0];
      handler(t.clientX, t.clientY);
    });
  };

  SchulteGrid.prototype.handleClick = function (row, col) {
    var idx = row * this.size + col;
    if (this.foundCells[idx]) return;
    var num = this.grid[idx];
    this.totalClicks++;

    if (num === this.target) {
      this.flashCellPress(row, col);
      this.foundCells[idx] = true;
      this.target++;
      if (this.target <= this.totalCells) {
        this.statusBar.querySelector("span").textContent = this.target + " \u2192 " + this.totalCells;
      }
      var self = this;
      setTimeout(function () { if (self.state !== "done") self.draw(); }, 220);
      if (this.target > this.totalCells) {
        setTimeout(function () { self.finish(); }, 230);
      }
    } else {
      this.errors++;
      this.flashError(row, col);
    }
  };

  // Cell press — warm overlay only, don't redraw number (avoids ghosting)
  SchulteGrid.prototype.flashCellPress = function (row, col) {
    var cs = this.cellSize;
    var x = col * cs, y = row * cs;
    var pad = Math.floor(cs * 0.06);
    this.ctx.fillStyle = "rgba(212,167,106,0.28)";
    this.ctx.fillRect(x + pad, y + pad, cs - pad * 2, cs - pad * 2);
  };

  SchulteGrid.prototype.flashError = function (row, col) {
    var self = this;
    var cs = this.cellSize;
    var x = col * cs, y = row * cs;
    var pad = Math.floor(cs * 0.06);
    this.ctx.fillStyle = "rgba(196,122,106,0.32)";
    this.ctx.fillRect(x + pad, y + pad, cs - pad * 2, cs - pad * 2);
    setTimeout(function () { if (self.state !== "done") self.draw(); }, 250);
  };

  SchulteGrid.prototype.startTimer = function () {
    var self = this;
    var timerEl = document.getElementById("schulte-timer");
    clearInterval(this.timerId);
    this.timerId = setInterval(function () {
      if (!self.started || self.state === "done") return;
      var elapsed = (performance.now() - self.startTime) / 1000;
      if (timerEl) timerEl.textContent = elapsed.toFixed(1) + "s";
    }, 100);
  };

  SchulteGrid.prototype.finish = function () {
    this.state = "done";
    this.started = false;
    var elapsed = (performance.now() - this.startTime) / 1000;
    clearInterval(this.timerId);

    var accuracy = this.totalClicks > 0 ? (this.totalClicks - this.errors) / this.totalClicks : 1;
    var key = this.statKey();

    var score = {
      time: parseFloat(elapsed.toFixed(2)),
      accuracy: parseFloat(accuracy.toFixed(3)),
      errors: this.errors,
      difficulty: this.difficulty,
      size: this.size,
      modeKey: key,
      round: this.round,
      date: new Date().toISOString()
    };

    if (typeof BrainGym !== "undefined" && BrainGym.saveScore) {
      BrainGym.saveScore(key, score);
    }

    this.canvas.style.transition = "box-shadow 0.8s ease-out";
    this.canvas.style.boxShadow = "0 0 20px 0 rgba(196,149,106,0.15)";
    var c = this.canvas;
    setTimeout(function () { c.style.boxShadow = "0 0 0 0 rgba(196,149,106,0)"; }, 50);

    this.statusBar.style.display = "none";
    this.gridArea.style.display = "none";
    this.resultsEl.style.display = "block";

    if (typeof BrainGym !== "undefined" && BrainGym.showResults) {
      BrainGym.showResults(this.resultsEl, key, score, "舒尔特 " + this.size + "\u00d7" + this.size);
    }

    this.resizeHost();
  };

  SchulteGrid.prototype.draw = function () {
    var ctx = this.ctx;
    var cs = this.cellSize;
    var W = this.canvasW;
    var H = this.canvasH;
    var pad = Math.floor(cs * 0.06);

    ctx.fillStyle = C.panel;
    ctx.fillRect(0, 0, W, H);

    // Cell backgrounds — equal padding on all sides
    for (var row = 0; row < this.size; row++) {
      for (var col = 0; col < this.size; col++) {
        var idx = row * this.size + col;
        if (this.foundCells[idx] && this.difficulty !== "hard") {
          ctx.fillStyle = C.cellFound;
        } else {
          ctx.fillStyle = C.cellBg;
        }
        ctx.fillRect(col * cs + pad, row * cs + pad, cs - pad * 2, cs - pad * 2);
      }
    }

    // Numbers — all cells get drawn, centered in their cell
    ctx.font = "300 " + Math.floor(cs * 0.38) + "px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (var r = 0; r < this.size; r++) {
      for (var c = 0; c < this.size; c++) {
        var i = r * this.size + c;
        var cx = c * cs + cs / 2;
        var cy = r * cs + cs / 2;
        if (this.foundCells[i] && this.difficulty !== "hard") {
          ctx.fillStyle = C.textFaint;
        } else {
          ctx.fillStyle = C.text;
        }
        ctx.fillText(String(this.grid[i]), cx, cy);
      }
    }

    // Grid lines — hairline
    ctx.strokeStyle = C.rule;
    ctx.lineWidth = 0.5;
    for (var g = 0; g <= this.size; g++) {
      ctx.beginPath(); ctx.moveTo(g * cs, 0); ctx.lineTo(g * cs, H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, g * cs); ctx.lineTo(W, g * cs); ctx.stroke();
    }
  };

  return SchulteGrid;
})();
