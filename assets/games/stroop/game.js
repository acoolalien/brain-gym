// stroop.js — Stroop 色词干扰抑制训练
// 标准模式：判断字体颜色（忽略词义），按对应颜色键
// 50% 一致 / 50% 不一致。纯 DOM 渲染，无 Canvas。
var StroopTask = (function () {
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
    flash:     "#D4A76A"
  };

  var FIXATION_MS   = 400;
  var STIMULUS_MS   = 1500;
  var FEEDBACK_MS   = 220;
  var FB_ERROR_MS   = 250;
  var BLANK_MS      = 600;

  var COLOR_MAP = [
    { word: "红", display: "#D4504A", key: "1", label: "红" },
    { word: "绿", display: "#3A9D5E", key: "2", label: "绿" },
    { word: "蓝", display: "#3A7EBF", key: "3", label: "蓝" },
    { word: "黄", display: "#D4A020", key: "4", label: "黄" }
  ];

  // ─── d-prime: Abramowitz-Stegun normInv ────
  function normInv(p) {
    p = Math.max(0.0001, Math.min(0.9999, p));
    var t = Math.sqrt(-2 * Math.log(p < 0.5 ? p : 1 - p));
    var c0 = 2.515517, c1 = 0.802853, c2 = 0.010328;
    var d1 = 1.432788, d2 = 0.189269, d3 = 0.001308;
    var z = t - (c0 + c1 * t + c2 * t * t) / (1 + d1 * t + d2 * t * t + d3 * t * t * t);
    return p < 0.5 ? -z : z;
  }

  function dPrime(hitRate, falseAlarmRate) {
    return normInv(hitRate) - normInv(falseAlarmRate);
  }

  // ─── Trial sequence generator ────
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
  }

  function hasRunOf(arr, val, maxRun) {
    var run = 0;
    for (var i = 0; i < arr.length; i++) {
      if (arr[i] === val) { run++; if (run >= maxRun) return true; }
      else { run = 0; }
    }
    return false;
  }

  function hasRunOfColor(arr, maxRun) {
    var run = 0;
    for (var i = 0; i < arr.length; i++) {
      if (i === 0 || arr[i] === arr[i - 1]) { run++; if (run >= maxRun) return true; }
      else { run = 1; }
    }
    return false;
  }

  function generateTrialSequence(size, mode) {
    var congruentRatio = (mode === "enhanced") ? 0.25 : 0.5;
    var congruentCount = Math.floor(size * congruentRatio);
    var incongruentCount = size - congruentCount;

    // Generate condition sequence: true=congruent, false=incongruent
    var conditions = [];
    for (var i = 0; i < congruentCount; i++) conditions.push(true);
    for (var i = 0; i < incongruentCount; i++) conditions.push(false);

    var attempts = 200;
    do {
      shuffle(conditions);
      attempts--;
    } while (attempts > 0 && (hasRunOf(conditions, true, 5) || hasRunOf(conditions, false, 5)));

    // Generate color indices with max 3 consecutive constraint
    var colorIndices = [];
    for (var i = 0; i < size; i++) {
      var ci;
      var attempts2 = 50;
      do {
        ci = Math.floor(Math.random() * 4);
        attempts2--;
      } while (attempts2 > 0 && i >= 2 && colorIndices[i - 1] === ci && colorIndices[i - 2] === ci);
      colorIndices.push(ci);
    }

    // Build trial objects
    var trials = [];
    for (var i = 0; i < size; i++) {
      var ci = colorIndices[i];
      var congruent = conditions[i];
      var wordIdx;
      if (congruent) {
        wordIdx = ci;
      } else {
        do {
          wordIdx = Math.floor(Math.random() * 4);
        } while (wordIdx === ci);
      }
      trials.push({
        word:          COLOR_MAP[wordIdx].word,
        displayColor:  COLOR_MAP[ci].display,
        correctKey:    COLOR_MAP[ci].key,
        colorIndex:    ci,
        wordIndex:     wordIdx,
        congruent:     congruent
      });
    }

    return trials;
  }

  // ─── Constructor ──────────────────
  function StroopTask(opts) {
    this.container = typeof opts.container === "string"
      ? document.getElementById(opts.container) : opts.container;
    this.size     = opts.size || 30;
    this.mode     = opts.mode || "standard";
    this.modeLabel = (this.mode === "enhanced") ? "高干扰" : "标准";
    this.token    = opts.token || "";
    this.pluginId = opts.pluginId || "";

    // Trial state
    this.trials       = [];
    this.currentTrial = 0;
    this.responses    = [];       // { colorIndex, correctKey, pressedKey, rt, congruent, correct }
    this.state        = "ready";

    // Timing
    this.started        = false;
    this.gameStartTime  = 0;
    this.trialStartTime = 0;
    this.responded      = false;
    this.responseRT     = 0;
    this.lastKey        = null;
    this.timerId        = null;
    this._timers        = [];
    this._paused        = false;
    this.round          = 0;

    // Event handler refs for cleanup
    this._onKey    = null;
    this._onClick  = null;
    this._onTouch  = null;

    this.init();
  }

  // ─── Key helpers ──────────────────
  StroopTask.prototype.statKey = function () {
    return "stroop_" + this.mode + "_" + this.size;
  };

  StroopTask.prototype._later = function (fn, ms) {
    var id = setTimeout(fn, ms);
    this._timers.push(id);
    return id;
  };

  StroopTask.prototype._clearTimers = function () {
    for (var i = 0; i < this._timers.length; i++) clearTimeout(this._timers[i]);
    this._timers = [];
  };

  // ─── Init ─────────────────────────
  StroopTask.prototype.init = function () {
    this.round = (typeof BrainGym !== "undefined" && BrainGym.incRound)
      ? BrainGym.incRound() : 1;
    if (this.round === 1 && typeof BrainGym !== "undefined" && BrainGym.resetRounds) {
      BrainGym.resetRounds();
      this.round = BrainGym.incRound();
    }

    this.trials = generateTrialSequence(this.size, this.mode);
    this.createUI();
    this.bindInput();
    this.showStartOverlay();
  };

  // ─── Trial generation ─────────────
  StroopTask.prototype.generateTrials = function () {
    this.trials = generateTrialSequence(this.size, this.mode);
    this.currentTrial = 0;
    this.responses = [];
  };

  // ─── UI ───────────────────────────
  StroopTask.prototype.createUI = function () {
    var self = this;

    // Inject styles once
    if (!document.getElementById("stroop-styles")) {
      var style = document.createElement("style");
      style.id = "stroop-styles";
      style.textContent =
        "@keyframes stroopShake {" +
        "  0%,100% { transform: translateX(0); }" +
        "  25% { transform: translateX(-3px); }" +
        "  75% { transform: translateX(3px); }" +
        "}" +
        ".stroop-shake { animation: stroopShake 0.25s ease; }" +
        ".stroop-start-btn {" +
        "  padding:12px 44px;font-size:15px;color:" + C.accent + ";" +
        "  background:" + C.bg + ";border:1.5px solid " + C.accent + ";" +
        "  border-radius:4px;cursor:pointer;letter-spacing:0.06em;" +
        "  font-family:inherit;transition:all 0.25s" +
        "}" +
        ".stroop-start-btn:hover {" +
        "  background:" + C.accent + ";color:" + C.bg + "" +
        "}" +
        ".stroop-retry-btn {" +
        "  font:inherit;font-size:10px;color:" + C.textDim + ";" +
        "  background:none;border:1px solid " + C.rule + ";" +
        "  border-radius:2px;padding:3px 8px;cursor:pointer;" +
        "  letter-spacing:0.03em;transition:all 0.2s" +
        "}" +
        ".stroop-retry-btn:hover {" +
        "  border-color:" + C.accent + ";color:" + C.accent + "" +
        "}" +
        ".stroop-color-btn {" +
        "  width:50px;height:50px;border:2px solid " + C.rule + ";" +
        "  border-radius:4px;cursor:pointer;display:flex;" +
        "  flex-direction:column;align-items:center;justify-content:center;" +
        "  font-size:12px;font-weight:500;letter-spacing:0.03em;" +
        "  transition:border-color 0.2s,background-color 0.2s;font-family:inherit;" +
        "  background:" + C.bg + ";user-select:none" +
        "}" +
        ".stroop-color-btn:hover {" +
        "  border-color:" + C.accent + "" +
        "}" +
        ".stroop-color-btn .key-num {" +
        "  font-size:17px;font-weight:600;line-height:1" +
        "}" +
        ".stroop-color-btn .key-label {" +
        "  font-size:9px;color:" + C.textDim + ";margin-top:1px" +
        "}";
      document.head.appendChild(style);
    }

    this.container.innerHTML = "";
    this.container.style.cssText =
      "width:100%;height:100%;display:flex;flex-direction:column;padding:0";

    // ── Top bar ──
    this.topBar = document.createElement("div");
    this.topBar.style.cssText =
      "flex-shrink:0;display:flex;justify-content:space-between;align-items:center;" +
      "padding:6px 10px 2px;font-size:11px;color:" + C.textDim;

    this.topBar.innerHTML =
      '<span style="display:flex;gap:8px;align-items:baseline">' +
        '<span style="font-weight:500;color:' + C.text + ';font-size:12px">' + this.modeLabel + '</span>' +
        '<span style="color:' + C.textFaint + ';font-size:11px">' + this.size + ' 试次</span>' +
      '</span>' +
      '<span style="display:flex;gap:8px;align-items:center">' +
        '<span id="stroop-progress" style="font-variant-numeric:tabular-nums;color:' + C.textDim + ';font-size:12px">0 / ' + this.size + '</span>' +
        '<button id="stroop-retry" class="stroop-retry-btn">重试</button>' +
      '</span>';
    this.container.appendChild(this.topBar);

    this.topBar.querySelector("#stroop-retry").addEventListener("click", function () {
      self.retry();
    });

    // ── Status bar ──
    this.statusBar = document.createElement("div");
    this.statusBar.style.cssText =
      "flex-shrink:0;display:flex;gap:14px;align-items:baseline;" +
      "padding:2px 10px;font-size:12px;color:" + C.textDim + ";letter-spacing:0.03em";
    this.statusBar.innerHTML =
      '<span id="stroop-rule" style="font-size:12px">' +
        '<span style="color:' + C.textDim + '">判断</span> ' +
        '<span style="color:' + C.accent + ';font-weight:600">字体颜色</span>' +
        '<span style="color:' + C.textDim + '">，忽略词义</span>' +
      '</span>' +
      '<span id="stroop-timer" style="font-variant-numeric:tabular-nums;color:' + C.textFaint + ';margin-left:auto;font-size:12px">00:00</span>';
    this.container.appendChild(this.statusBar);

    // ── Game area ──
    this.gameArea = document.createElement("div");
    this.gameArea.style.cssText =
      "flex:1;display:flex;align-items:center;" +
      "flex-direction:column;position:relative;min-height:0;margin:4px 10px 10px;transition:background-color 0.05s";
    this.container.appendChild(this.gameArea);

    // ── Stimulus centering wrapper ──
    this.centerWrapper = document.createElement("div");
    this.centerWrapper.style.cssText =
      "flex:1;display:flex;align-items:center;justify-content:center;flex-direction:column;width:100%";
    this.gameArea.appendChild(this.centerWrapper);

    this.stimulusEl = document.createElement("div");
    this.stimulusEl.style.cssText =
      "font-size:44px;font-weight:300;color:" + C.accent + ";" +
      "font-family:system-ui,sans-serif;user-select:none;" +
      "transition:opacity 0.08s;opacity:1;height:52px;display:flex;" +
      "align-items:center;justify-content:center;margin-bottom:20px";
    this.stimulusEl.textContent = "";
    this.centerWrapper.appendChild(this.stimulusEl);

    // ── Color buttons row ──
    this.btnRow = document.createElement("div");
    this.btnRow.style.cssText =
      "display:flex;gap:8px;justify-content:center";
    this.btnLabels = [];

    for (var k = 0; k < COLOR_MAP.length; k++) {
      (function (idx) {
        var cm = COLOR_MAP[idx];
        var btn = document.createElement("button");
        btn.className = "stroop-color-btn";
        btn.style.cssText =
          "width:48px;height:48px;border:none;" +
          "border-radius:6px;cursor:pointer;display:flex;" +
          "flex-direction:column;align-items:center;justify-content:center;" +
          "font-size:12px;font-weight:500;letter-spacing:0.03em;" +
          "font-family:inherit;user-select:none";
        btn.style.background = cm.display;
        btn.innerHTML =
          '<span style="font-size:17px;font-weight:600;line-height:1;color:#fff">' + cm.key + '</span>' +
          '<span style="font-size:9px;color:rgba(255,255,255,0.7);margin-top:1px">' + cm.label + '</span>';
        btn.addEventListener("click", function (e) {
          e.stopPropagation();
          if (!self.started || self.state === "done") return;
          self.onInput(cm.key);
        });
        self.btnRow.appendChild(btn);
        self.btnLabels.push(btn);
      })(k);
    }
    this.gameArea.appendChild(this.btnRow);

    // Hint text
    this.hintEl = document.createElement("div");
    this.hintEl.style.cssText =
      "margin-top:8px;margin-bottom:30px;font-size:10px;color:" + C.textFaint + ";letter-spacing:0.03em";
    this.hintEl.textContent = "键盘 1–4 或点击按钮";
    this.gameArea.appendChild(this.hintEl);

    // ── Start overlay ──
    this.startOverlay = document.createElement("div");
    this.startOverlay.style.cssText =
      "position:absolute;top:0;left:0;right:0;bottom:0;" +
      "display:flex;flex-direction:column;align-items:center;justify-content:center;" +
      "z-index:5;background:" + C.bg + ";border-radius:3px";
    this.startOverlay.innerHTML =
      '<div style="text-align:center;white-space:nowrap">' +
        '<button id="stroop-start" class="stroop-start-btn">开始</button>' +
      '</div>';
    this.gameArea.appendChild(this.startOverlay);

    var startBtn = this.startOverlay.querySelector("#stroop-start");
    startBtn.addEventListener("click", function () { self.startGame(); });

    // ── Results area ──
    this.resultsEl = document.createElement("div");
    this.resultsEl.style.cssText = "display:none;width:100%";
    this.container.appendChild(this.resultsEl);
  };

  StroopTask.prototype.showStartOverlay = function () {
    if (this.startOverlay) this.startOverlay.style.display = "flex";
  };

  // ─── Input binding ────────────────
  StroopTask.prototype.bindInput = function () {
    var self = this;

    this._onKey = function (e) {
      var key = null;
      if (e.code === "Digit1" || e.code === "Numpad1") key = "1";
      else if (e.code === "Digit2" || e.code === "Numpad2") key = "2";
      else if (e.code === "Digit3" || e.code === "Numpad3") key = "3";
      else if (e.code === "Digit4" || e.code === "Numpad4") key = "4";
      else return;

      e.preventDefault();
      if (!self.started || self.state === "done") return;
      self.onInput(key);
    };
    document.addEventListener("keydown", this._onKey);
  };

  StroopTask.prototype.unbindInput = function () {
    if (this._onKey) document.removeEventListener("keydown", this._onKey);
  };

  // ─── Game lifecycle ───────────────
  StroopTask.prototype.startGame = function () {
    if (this.startOverlay) this.startOverlay.style.display = "none";
    this.started   = true;
    this.state     = "playing";
    this.gameStartTime = performance.now();
    this.startTimer();
    this.currentTrial = 0;
    this.responses = [];
    this.startTrial(0);
  };

  StroopTask.prototype.retry = function () {
    this._clearTimers();
    if (this.timerId) { clearInterval(this.timerId); this.timerId = null; }

    this.state   = "ready";
    this.started = false;
    this.responded = false;
    this._paused  = false;
    this.responseRT = 0;
    this.lastKey  = null;

    this.round = (typeof BrainGym !== "undefined" && BrainGym.incRound)
      ? BrainGym.incRound() : this.round + 1;

    this.resultsEl.style.display = "none";
    this.gameArea.style.display = "flex";
    this.statusBar.style.display = "flex";

    var progEl = document.getElementById("stroop-progress");
    if (progEl) progEl.textContent = "0 / " + this.size;

    var timerEl = document.getElementById("stroop-timer");
    if (timerEl) timerEl.textContent = "00:00";

    this.stimulusEl.textContent = "";
    this.stimulusEl.style.color = C.accent;
    this.gameArea.style.backgroundColor = "";
    this.gameArea.classList.remove("stroop-shake");

    this.generateTrials();
    this.showStartOverlay();
  };

  // ─── Timer ────────────────────────
  StroopTask.prototype.startTimer = function () {
    var self = this;
    var timerEl = document.getElementById("stroop-timer");
    clearInterval(this.timerId);
    this.timerId = setInterval(function () {
      if (!self.started || self.state === "done") return;
      var elapsed = Math.floor((performance.now() - self.gameStartTime) / 1000);
      var m = Math.floor(elapsed / 60);
      var s = elapsed % 60;
      if (timerEl) timerEl.textContent = (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
    }, 200);
  };

  // ─── Trial loop ───────────────────
  StroopTask.prototype.startTrial = function (i) {
    if (i >= this.size) { this.finish(); return; }

    var trial = this.trials[i];
    var self  = this;

    this.responded  = false;
    this.responseRT = 0;
    this.lastKey    = null;

    // Update progress
    var progEl = document.getElementById("stroop-progress");
    if (progEl) progEl.textContent = (i + 1) + " / " + this.size;

    // Phase 1: Fixation
    this.stimulusEl.textContent = "+";
    this.stimulusEl.style.color = C.textFaint;
    this.gameArea.style.backgroundColor = "";
    this.gameArea.classList.remove("stroop-shake");

    this._later(function () {
      // Phase 2: Stimulus
      self.stimulusEl.textContent = trial.word;
      self.stimulusEl.style.color = trial.displayColor;
      self.trialStartTime = performance.now();

      // Phase 3: After STIMULUS_MS — clear stimulus and finalize
      self._later(function () {
        self.stimulusEl.textContent = "";
        self.finalizeTrial(i);
      }, STIMULUS_MS);

    }, FIXATION_MS);
  };

  // ─── Input handler ────────────────
  StroopTask.prototype.onInput = function (key) {
    if (this._paused || this.responded) return;
    this.responded  = true;
    this.responseRT = performance.now() - this.trialStartTime;
    this.lastKey    = key;

    // Wait for stimulus phase to end if we're still in it, else finalize now
    var elapsed = performance.now() - this.trialStartTime;
    if (elapsed >= STIMULUS_MS) {
      this.finalizeTrial(this.currentTrial);
    }
  };

  // ─── Finalize trial ───────────────
  StroopTask.prototype.finalizeTrial = function (i) {
    if (this.state === "done") return;
    this._clearTimers();

    var trial = this.trials[i];
    var correct = this.responded && this.lastKey === trial.correctKey;

    // Record
    this.responses.push({
      colorIndex:  trial.colorIndex,
      correctKey:  trial.correctKey,
      pressedKey:  this.responded ? this.lastKey : null,
      rt:          this.responded ? Math.round(this.responseRT) : 0,
      congruent:   trial.congruent,
      correct:     correct
    });

    // Show feedback
    this.showFeedback(correct);

    var self = this;
    var fbDuration = correct ? FEEDBACK_MS : FB_ERROR_MS;
    this._later(function () {
      // Clear feedback
      self.gameArea.style.backgroundColor = "";
      self.gameArea.classList.remove("stroop-shake");
      self.stimulusEl.textContent = "";

      // Blank
      self._later(function () {
        self.currentTrial++;
        self.startTrial(self.currentTrial);
      }, BLANK_MS);
    }, fbDuration);
  };

  // ─── Feedback display ─────────────
  StroopTask.prototype.showFeedback = function (correct) {
    if (!correct) {
      this.gameArea.classList.add("stroop-shake");
    }
  };

  // ─── Finish & score ───────────────
  StroopTask.prototype.finish = function () {
    this.state   = "done";
    this.started = false;
    clearInterval(this.timerId);

    var totalTrials    = this.responses.length;
    var correctCount   = 0;
    var errorCount     = 0;
    var congruentCorrect = 0;
    var congruentTotal = 0;
    var incongruentCorrect = 0;
    var incongruentTotal = 0;
    var congruentRTs   = [];
    var incongruentRTs = [];

    for (var i = 0; i < this.responses.length; i++) {
      var r = this.responses[i];
      if (r.correct) {
        correctCount++;
        if (r.congruent) {
          congruentCorrect++;
          if (r.rt > 0) congruentRTs.push(r.rt);
        } else {
          incongruentCorrect++;
          if (r.rt > 0) incongruentRTs.push(r.rt);
        }
      } else {
        errorCount++;
      }
      if (r.congruent) congruentTotal++;
      else incongruentTotal++;
    }

    // Average RTs
    function avgRT(rtArr) {
      if (rtArr.length === 0) return 0;
      var sum = 0;
      for (var j = 0; j < rtArr.length; j++) sum += rtArr[j];
      return Math.round(sum / rtArr.length);
    }

    var avgCongruentRT    = avgRT(congruentRTs);
    var avgIncongruentRT  = avgRT(incongruentRTs);
    var stroopEffectMs    = avgIncongruentRT - avgCongruentRT;
    var congruentAccuracy = congruentTotal > 0 ? congruentCorrect / congruentTotal : 0;
    var incongruentAccuracy = incongruentTotal > 0 ? incongruentCorrect / incongruentTotal : 0;
    var overallAccuracy   = totalTrials > 0 ? correctCount / totalTrials : 0;

    // d-prime: binomial with log-linear correction
    var adjCorrect = correctCount + 0.5;
    var adjErrors  = errorCount + 0.5;
    var adjTotal   = totalTrials + 1;
    var hitRate        = Math.max(0.0001, Math.min(0.9999, adjCorrect / adjTotal));
    var falseAlarmRate = Math.max(0.0001, Math.min(0.9999, adjErrors / adjTotal));
    var dprime = dPrime(hitRate, falseAlarmRate);

    var stroopEffectSec = parseFloat((stroopEffectMs / 1000).toFixed(3));
    var key = this.statKey();

    // Latency report
    console.log("[stroop] === LATENCY REPORT ===");
    console.log("[stroop] 试次:", totalTrials, "正确:", correctCount, "错误:", errorCount);
    console.log("[stroop] 一致 RT (ms):", congruentRTs.length > 0 ? congruentRTs.join(", ") : "n/a");
    console.log("[stroop] 不一致 RT (ms):", incongruentRTs.length > 0 ? incongruentRTs.join(", ") : "n/a");
    console.log("[stroop] 平均一致 RT:", avgCongruentRT, "ms  |  平均不一致 RT:", avgIncongruentRT, "ms  |  效应量:", stroopEffectMs, "ms");
    console.log("[stroop] d':", dprime.toFixed(3));

    var score = {
      time:              parseFloat(Math.abs(stroopEffectSec).toFixed(3)),
      accuracy:          parseFloat(overallAccuracy.toFixed(3)),
      dprime:            parseFloat(dprime.toFixed(2)),
      stroopEffect:      stroopEffectMs,
      congruentRT:       avgCongruentRT,
      incongruentRT:     avgIncongruentRT,
      congruentAcc:      parseFloat(congruentAccuracy.toFixed(3)),
      incongruentAcc:    parseFloat(incongruentAccuracy.toFixed(3)),
      totalTrials:       totalTrials,
      correct:           correctCount,
      errors:            errorCount,
      modeKey:           key,
      difficulty:        this.mode,
      size:              this.size,
      round:             this.round,
      date:              new Date().toISOString()
    };

    if (typeof BrainGym !== "undefined" && BrainGym.saveScore) {
      BrainGym.saveScore(key, score);
    }

    // Transition to results
    this.statusBar.style.display = "none";
    this.gameArea.style.display = "none";
    this.resultsEl.style.display = "block";
    this.showStroopResults(key, score);
  };

  // ─── Stroop custom results display ────
  StroopTask.prototype.showStroopResults = function (key, score) {
    var el = this.resultsEl;
    el.innerHTML = "";
    el.style.color = C.text;
    el.style.fontSize = "13px";
    el.style.lineHeight = "1.7";
    el.style.letterSpacing = "0.02em";
    el.style.padding = "16px 20px 12px";
    el.style.width = "100%";

    // Title
    var title = document.createElement("div");
    title.style.cssText = "font-size:14px;font-weight:500;color:" + C.text + ";margin-bottom:2px;letter-spacing:0.04em";
    title.textContent = "Stroop " + this.size + " 试次";
    el.appendChild(title);

    // Mode tag
    var tag = document.createElement("div");
    tag.style.cssText = "font-size:10px;color:" + C.textFaint + ";margin-bottom:8px";
    tag.textContent = "色词干扰 · " + this.modeLabel + "模式";
    el.appendChild(tag);

    // Stroop effect — large display
    var effLine = document.createElement("div");
    effLine.style.cssText = "font-size:32px;font-weight:300;color:" + C.accent + ";margin-bottom:2px;font-variant-numeric:tabular-nums";
    var effSign = score.stroopEffect >= 0 ? "+" : "";
    effLine.textContent = effSign + score.stroopEffect + "ms";
    el.appendChild(effLine);

    // Sub metrics: congruent RT / incongruent RT
    var sub = document.createElement("div");
    sub.style.cssText = "display:flex;gap:12px;font-size:11px;color:" + C.textDim + ";margin-bottom:2px;flex-wrap:wrap";
    sub.innerHTML =
      "<span>一致 " + score.congruentRT + "ms</span>" +
      "<span>不一致 " + score.incongruentRT + "ms</span>" +
      "<span>d' " + score.dprime.toFixed(2) + "</span>";
    el.appendChild(sub);

    // Tier evaluation using effect size thresholds
    if (typeof BrainGym !== "undefined" && BrainGym.evaluate) {
      var variantKey = this.mode + "_" + this.size;
      var tier = BrainGym.evaluate("stroop", variantKey, score.time, 1);  // lower is better (default)
      var comment = BrainGym.pickComment("stroop", tier);
      var tierEl = document.createElement("div");
      tierEl.style.cssText = "font-size:12px;color:" + C.textDim + ";margin-bottom:10px;font-style:italic";
      tierEl.textContent = comment;
      el.appendChild(tierEl);
    }

    // Divider
    var div = document.createElement("div");
    div.style.cssText = "height:1px;background:" + C.rule + ";margin-bottom:10px;width:100%";
    el.appendChild(div);

    // History comparison and chart
    if (typeof BrainGym !== "undefined") {
      var history = BrainGym.getGameHistory(key);

      if (history.length >= 2) {
        var prev = history[history.length - 2];
        if (typeof prev.stroopEffect === "number") {
          var curEff = Math.abs(score.stroopEffect);
          var prevEff = Math.abs(prev.stroopEffect);
          var effDiff = prevEff - curEff;  // positive = improvement
          var compEl = document.createElement("div");
          compEl.style.cssText = "text-align:right;font-size:12px;color:" + C.textDim + ";margin-bottom:10px;line-height:1.6";
          if (Math.abs(effDiff) < 15) {
            compEl.innerHTML = "效应量与上次持平";
          } else if (effDiff > 0) {
            compEl.innerHTML = "<span style=\"color:" + C.success + "\">效应量缩减 " + effDiff + "ms</span>";
          } else {
            compEl.innerHTML = "<span style=\"color:" + C.error + "\">效应量增加 " + Math.abs(effDiff) + "ms</span>";
          }
          el.appendChild(compEl);
        }
      }

      // Mini sparkline for effect size trend (3+ records)
      if (history.length >= 3) {
        var chart = document.createElement("div");
        chart.style.cssText = "height:60px;position:relative;margin-top:4px";
        el.appendChild(chart);
        var chartHistory = history.map(function (h) { return { time: Math.abs(h.stroopEffect || 0) }; });
        if (typeof BrainGym.drawTrendChart === "function") {
          BrainGym.drawTrendChart(chart, chartHistory, { label: "最佳", unit: "ms" });
        }
      }

      var count = document.createElement("div");
      count.style.cssText = "text-align:right;font-size:10px;color:" + C.textFaint + ";margin-top:6px";
      count.textContent = "共 " + history.length + " 次记录";
      el.appendChild(count);
    }

  };

  return StroopTask;
})();
