// gonogo.js — Go/No-Go 反应抑制训练
// 标准模式：P=按键, R=不按键
// 反转模式：过半程 P/R 角色互换
// 规模：30/50/70 试次。纯 DOM 渲染，无 Canvas。
var GoNoGo = (function () {
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
  var STIMULUS_MS   = 500;
  var FEEDBACK_MS   = 220;
  var FB_ERROR_MS   = 250;
  var BLANK_MS      = 600;
  var RESPONSE_MS   = 1000;
  var REVERSAL_PROMPT_MS = 2000;

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

  function generateTrialSequence(size) {
    var goCount = Math.floor(size * 0.75);
    var noGoCount = size - goCount;

    // First 5 always Go
    var pool = [];
    for (var i = 0; i < goCount - 5; i++) pool.push("go");
    for (var i = 0; i < noGoCount; i++) pool.push("nogo");

    var attempts = 200;
    do {
      shuffle(pool);
      attempts--;
    } while (attempts > 0 && hasRunOf(pool, "nogo", 3));

    var seq = [];
    for (var i = 0; i < 5; i++) seq.push("go");
    for (var i = 0; i < pool.length; i++) seq.push(pool[i]);

    return seq;
  }

  // ─── Constructor ──────────────────
  function GoNoGo(opts) {
    this.container = typeof opts.container === "string"
      ? document.getElementById(opts.container) : opts.container;
    this.size   = opts.size || 30;
    this.mode   = opts.mode || "standard";
    this.token  = opts.token || "";
    this.pluginId = opts.pluginId || "";

    // Trial state
    this.trials       = [];       // ["go"|"nogo", ...]
    this.currentTrial = 0;
    this.responses    = [];       // { type, pressed, rt }
    this.state        = "ready";  // ready | playing | done

    // Role mapping — swapped at reversal
    this.goKey   = "P";
    this.nogoKey = "R";

    this.reversalAt = Math.floor(this.size / 2);

    // Timing
    this.started        = false;
    this.gameStartTime  = 0;
    this.trialStartTime = 0;     // stimulus onset (ms)
    this.responded      = false;
    this.responseRT     = 0;
    this.timerId        = null;
    this._timers        = [];    // all active setTimeout ids for cleanup
    this._paused        = false;
    this.round          = 0;

    // Event handler refs for cleanup
    this._onKey    = null;
    this._onClick  = null;
    this._onTouch  = null;

    this.init();
  }

  // ─── Key helpers ──────────────────
  GoNoGo.prototype.statKey = function () {
    return "gonogo_" + this.mode + "_" + this.size;
  };

  GoNoGo.prototype._later = function (fn, ms) {
    var id = setTimeout(fn, ms);
    this._timers.push(id);
    return id;
  };

  GoNoGo.prototype._clearTimers = function () {
    for (var i = 0; i < this._timers.length; i++) clearTimeout(this._timers[i]);
    this._timers = [];
  };

  // ─── Init ─────────────────────────
  GoNoGo.prototype.init = function () {
    this.round = (typeof BrainGym !== "undefined" && BrainGym.incRound)
      ? BrainGym.incRound() : 1;
    if (this.round === 1 && typeof BrainGym !== "undefined" && BrainGym.resetRounds) {
      BrainGym.resetRounds();
      this.round = BrainGym.incRound();
    }

    this.trials = generateTrialSequence(this.size);
    this.createUI();
    this.bindInput();
    this.showStartOverlay();
  };

  // ─── Trial generation ─────────────
  GoNoGo.prototype.generateTrials = function () {
    this.trials = generateTrialSequence(this.size);
    this.currentTrial = 0;
    this.responses = [];
  };

  // ─── UI ───────────────────────────
  GoNoGo.prototype.createUI = function () {
    var self = this;

    // Inject styles once
    if (!document.getElementById("gonogo-styles")) {
      var style = document.createElement("style");
      style.id = "gonogo-styles";
      style.textContent =
        "@keyframes gonogoShake {" +
        "  0%,100% { transform: translateX(0); }" +
        "  25% { transform: translateX(-3px); }" +
        "  75% { transform: translateX(3px); }" +
        "}" +
        ".gonogo-shake { animation: gonogoShake 0.25s ease; }" +
        ".gonogo-start-btn {" +
        "  padding:12px 44px;font-size:15px;color:" + C.accent + ";" +
        "  background:" + C.bg + ";border:1.5px solid " + C.accent + ";" +
        "  border-radius:4px;cursor:pointer;letter-spacing:0.06em;" +
        "  font-family:inherit;transition:all 0.25s" +
        "}" +
        ".gonogo-start-btn:hover {" +
        "  background:" + C.accent + ";color:" + C.bg + "" +
        "}" +
        ".gonogo-retry-btn {" +
        "  font:inherit;font-size:10px;color:" + C.textDim + ";" +
        "  background:none;border:1px solid " + C.rule + ";" +
        "  border-radius:2px;padding:3px 8px;cursor:pointer;" +
        "  letter-spacing:0.03em;transition:all 0.2s" +
        "}" +
        ".gonogo-retry-btn:hover {" +
        "  border-color:" + C.accent + ";color:" + C.accent + "" +
        "}" +
        ".gonogo-rule-go { color:" + C.accent + ";font-weight:600 }" +
        ".gonogo-rule-nogo { color:" + C.textDim + ";font-weight:600 }";
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

    var modeLabel = this.mode === "reversal" ? "反转" : "标准";
    this.topBar.innerHTML =
      '<span style="display:flex;gap:8px;align-items:baseline">' +
        '<span style="font-weight:500;color:' + C.text + ';font-size:12px">' + modeLabel + '</span>' +
        '<span style="color:' + C.textFaint + ';font-size:11px">' + this.size + ' 试次</span>' +
      '</span>' +
      '<span style="display:flex;gap:8px;align-items:center">' +
        '<span id="gonogo-progress" style="font-variant-numeric:tabular-nums;color:' + C.textDim + ';font-size:12px">0 / ' + this.size + '</span>' +
        '<button id="gonogo-retry" class="gonogo-retry-btn">重试</button>' +
      '</span>';
    this.container.appendChild(this.topBar);

    this.topBar.querySelector("#gonogo-retry").addEventListener("click", function () {
      self.retry();
    });

    // ── Status bar ──
    this.statusBar = document.createElement("div");
    this.statusBar.style.cssText =
      "flex-shrink:0;display:flex;gap:14px;align-items:baseline;" +
      "padding:2px 10px;font-size:12px;color:" + C.textDim + ";letter-spacing:0.03em";
    this.statusBar.innerHTML =
      '<span id="gonogo-rule" style="font-size:12px">' +
        '<span class="gonogo-rule-go">' + this.goKey + '</span>' +
        '<span style="color:' + C.textDim + '"> 响应</span>' +
        '<span style="color:' + C.textFaint + ';margin:0 6px">·</span>' +
        '<span class="gonogo-rule-nogo">' + this.nogoKey + '</span>' +
        '<span style="color:' + C.textDim + '"> 抑制</span>' +
      '</span>' +
      '<span id="gonogo-timer" style="font-variant-numeric:tabular-nums;color:' + C.textFaint + ';margin-left:auto;font-size:12px">00:00</span>';
    this.container.appendChild(this.statusBar);

    // ── Game area ──
    this.gameArea = document.createElement("div");
    this.gameArea.style.cssText =
      "flex:1;display:flex;align-items:center;justify-content:center;" +
      "position:relative;min-height:0;margin:4px 10px 10px;transition:background-color 0.05s";
    this.container.appendChild(this.gameArea);

    this.stimulusEl = document.createElement("div");
    this.stimulusEl.style.cssText =
      "font-size:44px;font-weight:300;color:" + C.accent + ";" +
      "font-family:system-ui,sans-serif;user-select:none;" +
      "transition:opacity 0.08s;opacity:1";
    this.stimulusEl.textContent = "";
    this.gameArea.appendChild(this.stimulusEl);

    // Hint text below stimulus (absolute positioned)
    this.hintEl = document.createElement("div");
    this.hintEl.style.cssText =
      "position:absolute;bottom:12px;left:50%;transform:translateX(-50%);" +
      "font-size:11px;color:" + C.textFaint + ";letter-spacing:0.03em;white-space:nowrap";
    this.hintEl.textContent = "空格键响应";
    this.gameArea.appendChild(this.hintEl);

    // ── Start overlay ──
    this.startOverlay = document.createElement("div");
    this.startOverlay.style.cssText =
      "position:absolute;top:0;left:0;right:0;bottom:0;" +
      "display:flex;flex-direction:column;align-items:center;justify-content:center;" +
      "z-index:5;background:" + C.bg + ";border-radius:3px";
    this.startOverlay.innerHTML =
      '<div style="text-align:center;white-space:nowrap">' +
        '<button id="gonogo-start" class="gonogo-start-btn">开始</button>' +
      '</div>';
    this.gameArea.appendChild(this.startOverlay);

    var startBtn = this.startOverlay.querySelector("#gonogo-start");
    startBtn.addEventListener("click", function () { self.startGame(); });

    // ── Results area ──
    this.resultsEl = document.createElement("div");
    this.resultsEl.style.cssText = "display:none;width:100%";
    this.container.appendChild(this.resultsEl);
  };

  GoNoGo.prototype.showStartOverlay = function () {
    if (this.startOverlay) this.startOverlay.style.display = "flex";
  };

  // ─── Input binding ────────────────
  GoNoGo.prototype.bindInput = function () {
    var self = this;

    this._onKey = function (e) {
      if (e.code === "Space" || e.key === " " || e.keyCode === 32) {
        e.preventDefault();
        if (!self.started || self.state === "done") return;
        self.onInput();
      }
    };
    document.addEventListener("keydown", this._onKey);

    this._onClick = function () {
      if (!self.started || self.state === "done") return;
      self.onInput();
    };
    this.gameArea.addEventListener("click", this._onClick);

    this._onTouch = function (e) {
      e.preventDefault();
      if (!self.started || self.state === "done") return;
      self.onInput();
    };
    this.gameArea.addEventListener("touchend", this._onTouch);
  };

  GoNoGo.prototype.unbindInput = function () {
    if (this._onKey)    document.removeEventListener("keydown", this._onKey);
    if (this._onClick)  this.gameArea.removeEventListener("click", this._onClick);
    if (this._onTouch)  this.gameArea.removeEventListener("touchend", this._onTouch);
  };

  // ─── Game lifecycle ───────────────
  GoNoGo.prototype.startGame = function () {
    if (this.startOverlay) this.startOverlay.style.display = "none";
    this.started   = true;
    this.state     = "playing";
    this.gameStartTime = performance.now();
    this.startTimer();
    this.currentTrial = 0;
    this.responses = [];
    this.goKey   = "P";
    this.nogoKey = "R";
    this.startTrial(0);
  };

  GoNoGo.prototype.retry = function () {
    this._clearTimers();
    if (this.timerId) { clearInterval(this.timerId); this.timerId = null; }

    this.state   = "ready";
    this.started = false;
    this.responded = false;
    this._paused  = false;
    this.responseRT = 0;

    this.round = (typeof BrainGym !== "undefined" && BrainGym.incRound)
      ? BrainGym.incRound() : this.round + 1;

    this.resultsEl.style.display = "none";
    this.gameArea.style.display = "flex";
    this.statusBar.style.display = "flex";

    this.goKey   = "P";
    this.nogoKey = "R";

    var ruleEl = document.getElementById("gonogo-rule");
    if (ruleEl) ruleEl.innerHTML =
      '<span class="gonogo-rule-go">' + this.goKey + '</span>' +
      '<span style="color:' + C.textDim + '"> 响应</span>' +
      '<span style="color:' + C.textFaint + ';margin:0 6px">·</span>' +
      '<span class="gonogo-rule-nogo">' + this.nogoKey + '</span>' +
      '<span style="color:' + C.textDim + '"> 抑制</span>';

    var progEl = document.getElementById("gonogo-progress");
    if (progEl) progEl.textContent = "0 / " + this.size;

    var timerEl = document.getElementById("gonogo-timer");
    if (timerEl) timerEl.textContent = "00:00";

    this.stimulusEl.textContent = "";
    this.gameArea.style.backgroundColor = "";
    this.gameArea.classList.remove("gonogo-shake");

    // Remove any leftover reversal overlay
    if (this.reversalOverlay && this.reversalOverlay.parentNode) {
      this.reversalOverlay.parentNode.removeChild(this.reversalOverlay);
      this.reversalOverlay = null;
    }

    this.generateTrials();
    this.showStartOverlay();
  };

  // ─── Timer ────────────────────────
  GoNoGo.prototype.startTimer = function () {
    var self = this;
    var timerEl = document.getElementById("gonogo-timer");
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
  GoNoGo.prototype.startTrial = function (i) {
    if (i >= this.size) { this.finish(); return; }

    var trial = this.trials[i];
    var self  = this;

    this.responded  = false;
    this.responseRT = 0;

    // Update progress
    var progEl = document.getElementById("gonogo-progress");
    if (progEl) progEl.textContent = (i + 1) + " / " + this.size;

    // Phase 1: Fixation
    this.stimulusEl.textContent = "+";
    this.stimulusEl.style.color = C.textFaint;
    this.gameArea.style.backgroundColor = "";
    this.gameArea.classList.remove("gonogo-shake");

    this._later(function () {
      // Phase 2: Stimulus
      var letter = trial === "go" ? self.goKey : self.nogoKey;
      self.stimulusEl.textContent = letter;
      self.stimulusEl.style.color = trial === "go" ? C.accent : "#B07060";
      self.trialStartTime = performance.now();
      console.debug("[gonogo] trial", i+1, "/", self.size, "stimulus:", letter, "ts:", self.trialStartTime.toFixed(1));

      // Phase 3: After STIMULUS_MS — clear letter; if already responded, finalize now
      self._later(function () {
        self.stimulusEl.textContent = "";
        if (self.responded) {
          self._clearTimers();
          self.finalizeTrial(i);
        }
      }, STIMULUS_MS);

      // Phase 4: Response window hard cap at RESPONSE_MS
      self._later(function () {
        if (!self.responded) {
          self.finalizeTrial(i);
        }
      }, RESPONSE_MS);

    }, FIXATION_MS);
  };

  // ─── Input handler ────────────────
  GoNoGo.prototype.onInput = function () {
    if (this._paused || this.responded) return;
    this.responded  = true;
    this.responseRT = performance.now() - this.trialStartTime;
    console.debug("[gonogo] trial", this.currentTrial+1, "response RT:", this.responseRT.toFixed(1), "ms");

    // If response came within STIMULUS_MS, we wait for stimulus phase to end
    // before showing feedback. If after STIMULUS_MS, finalize now.
    var elapsed = performance.now() - this.trialStartTime;
    if (elapsed >= STIMULUS_MS) {
      this.finalizeTrial(this.currentTrial);
    }
  };

  // ─── Finalize trial ───────────────
  GoNoGo.prototype.finalizeTrial = function (i) {
    if (this.state === "done") return;
    this._clearTimers();

    var trial = this.trials[i];

    // Determine feedback
    var fbType, fbDuration;
    if (trial === "go") {
      if (this.responded) { fbType = "hit";    fbDuration = FEEDBACK_MS; }
      else                { fbType = "miss";   fbDuration = FB_ERROR_MS; }
    } else {
      if (this.responded) { fbType = "falseAlarm"; fbDuration = FB_ERROR_MS; }
      else                { fbType = "correctRejection"; fbDuration = FEEDBACK_MS; }
    }

    // Record
    this.responses.push({
      type: trial,
      pressed: this.responded,
      rt: this.responded ? Math.round(this.responseRT) : 0
    });

    // Show feedback
    this.showFeedback(fbType);

    var self = this;
    this._later(function () {
      // Clear feedback
      self.gameArea.style.backgroundColor = "";
      self.gameArea.classList.remove("gonogo-shake");
      self.stimulusEl.textContent = "";

      // Blank
      self._later(function () {
        self.currentTrial++;
        if (self.mode === "reversal" && self.currentTrial === self.reversalAt) {
          self.showReversalPrompt(function () {
            self.startTrial(self.currentTrial);
          });
        } else {
          self.startTrial(self.currentTrial);
        }
      }, BLANK_MS);
    }, fbDuration);
  };

  // ─── Feedback display ─────────────
  GoNoGo.prototype.showFeedback = function (type) {
    switch (type) {
      case "hit":
        this.gameArea.style.backgroundColor = "rgba(212,167,106,0.28)";
        break;
      case "correctRejection":
        this.gameArea.style.backgroundColor = "rgba(60,54,40,0.12)";
        break;
      case "falseAlarm":
        this.gameArea.style.backgroundColor = "rgba(196,122,106,0.32)";
        this.gameArea.classList.add("gonogo-shake");
        break;
      case "miss":
        this.gameArea.style.backgroundColor = "rgba(60,54,40,0.18)";
        break;
    }
  };

  // ─── Reversal prompt ──────────────
  GoNoGo.prototype.showReversalPrompt = function (cb) {
    var self = this;
    this._paused = true;

    // Swap roles
    var tmp = this.goKey;
    this.goKey   = this.nogoKey;
    this.nogoKey = tmp;

    // Update rule display
    var ruleEl = document.getElementById("gonogo-rule");
    if (ruleEl) ruleEl.innerHTML =
      '<span class="gonogo-rule-go">' + this.goKey + '</span>' +
      '<span style="color:' + C.textDim + '"> 响应</span>' +
      '<span style="color:' + C.textFaint + ';margin:0 6px">·</span>' +
      '<span class="gonogo-rule-nogo">' + this.nogoKey + '</span>' +
      '<span style="color:' + C.textDim + '"> 抑制</span>';

    // Full-screen prompt
    this.stimulusEl.textContent = "";
    this.gameArea.style.backgroundColor = "";

    var overlay = document.createElement("div");
    overlay.style.cssText =
      "position:absolute;top:0;left:0;right:0;bottom:0;" +
      "display:flex;flex-direction:column;align-items:center;justify-content:center;" +
      "background:" + C.bg + ";z-index:10;border-radius:3px";
    overlay.innerHTML =
      '<div style="text-align:center;font-size:14px;color:' + C.text + ';line-height:2.2;white-space:nowrap">' +
        '<div style="font-size:28px;margin-bottom:8px">&#9888;</div>' +
        '<div style="font-weight:500;color:' + C.accent + '">规则反转</div>' +
        '<div style="font-size:12px;color:' + C.textDim + '">' + this.goKey + '=按 &middot; ' + this.nogoKey + '=不按</div>' +
      '</div>';
    this.gameArea.appendChild(overlay);
    this.reversalOverlay = overlay;

    this._later(function () {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      self.reversalOverlay = null;
      self._paused = false;
      cb();
    }, REVERSAL_PROMPT_MS);
  };

  // ─── Finish & score ───────────────
  GoNoGo.prototype.finish = function () {
    this.state   = "done";
    this.started = false;
    clearInterval(this.timerId);

    var goTrials      = 0;
    var noGoTrials    = 0;
    var hits          = 0;
    var misses        = 0;
    var falseAlarms   = 0;
    var correctReject = 0;
    var goRTs         = [];

    for (var i = 0; i < this.responses.length; i++) {
      var r = this.responses[i];
      if (r.type === "go") {
        goTrials++;
        if (r.pressed) { hits++; goRTs.push(r.rt); }
        else           { misses++; }
      } else {
        noGoTrials++;
        if (r.pressed) { falseAlarms++; }
        else           { correctReject++; }
      }
    }

    // Log-linear correction (add 0.5 to each cell) to avoid infinite z-scores
    var adjHits = hits + 0.5;
    var adjGo = goTrials + 1;
    var adjFA = falseAlarms + 0.5;
    var adjNoGo = noGoTrials + 1;
    var hitRate        = adjGo > 0 ? adjHits / adjGo : 0;
    var falseAlarmRate = adjNoGo > 0 ? adjFA / adjNoGo : 0;
    var missRate       = goTrials > 0 ? misses / goTrials : 0;
    var accuracy       = this.size > 0 ? (hits + correctReject) / this.size : 0;

    // Average Go RT (ms), use cap for missed trials
    var avgGoRT;
    if (goRTs.length > 0) {
      var sum = 0;
      for (var j = 0; j < goRTs.length; j++) sum += goRTs[j];
      avgGoRT = Math.round(sum / goRTs.length);
    } else {
      avgGoRT = STIMULUS_MS + RESPONSE_MS; // all missed — use window as proxy
    }

    var dprime = dPrime(
      Math.max(0.0001, Math.min(0.9999, hitRate)),
      Math.max(0.0001, Math.min(0.9999, falseAlarmRate))
    );

    // Latency summary
    console.log("[gonogo] === LATENCY REPORT ===");
    console.log("[gonogo] 试次:", this.size, "命中:", hits, "漏报:", misses, "误报:", falseAlarms, "正确抑制:", correctReject);
    console.log("[gonogo] Go RT (ms):", goRTs.length > 0 ? goRTs.join(", ") : "n/a");
    console.log("[gonogo] 平均 Go RT:", avgGoRT, "ms  |  d':", dprime.toFixed(3));
    if (goRTs.length > 1) {
      var sorted = goRTs.slice().sort(function(a,b){return a-b});
      console.log("[gonogo] RT 范围:", sorted[0], "–", sorted[sorted.length-1], "ms");
    }

    var timeSec = parseFloat((avgGoRT / 1000).toFixed(3));
    var key     = this.statKey();

    var score = {
      time:             timeSec,
      accuracy:         parseFloat(accuracy.toFixed(3)),
      hitRate:          parseFloat(hitRate.toFixed(3)),
      falseAlarmRate:   parseFloat(falseAlarmRate.toFixed(3)),
      missRate:         parseFloat(missRate.toFixed(3)),
      dprime:           parseFloat(dprime.toFixed(2)),
      goRT:             avgGoRT,
      commissionErrors: falseAlarms,
      omissionErrors:   misses,
      totalTrials:      this.size,
      goTrials:         goTrials,
      noGoTrials:       noGoTrials,
      modeKey:          key,
      difficulty:       this.mode,
      size:             this.size,
      round:            this.round,
      date:             new Date().toISOString()
    };

    if (typeof BrainGym !== "undefined" && BrainGym.saveScore) {
      BrainGym.saveScore(key, score);
    }

    // Transition to results
    this.statusBar.style.display = "none";
    this.gameArea.style.display = "none";
    this.resultsEl.style.display = "block";
    this.showGoNogoResults(key, score);
  };

  // ─── Go/No-Go custom results display ────
  GoNoGo.prototype.showGoNogoResults = function (key, score) {
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
    title.textContent = "Go/No-Go " + this.size + " 试次";
    el.appendChild(title);

    // Mode tag
    var tag = document.createElement("div");
    tag.style.cssText = "font-size:10px;color:" + C.textFaint + ";margin-bottom:8px";
    tag.textContent = this.mode === "reversal" ? "反转模式" : "标准模式";
    el.appendChild(tag);

    // d-prime — large display
    var dpLine = document.createElement("div");
    dpLine.style.cssText = "font-size:32px;font-weight:300;color:" + C.accent + ";margin-bottom:2px;font-variant-numeric:tabular-nums";
    dpLine.textContent = "d\' " + score.dprime.toFixed(2);
    el.appendChild(dpLine);

    // Sub metrics row
    var sub = document.createElement("div");
    sub.style.cssText = "display:flex;gap:16px;font-size:11px;color:" + C.textDim + ";margin-bottom:8px;flex-wrap:wrap";
    sub.innerHTML =
      "<span>命中率 " + (score.hitRate * 100).toFixed(0) + "%</span>" +
      "<span>误报率 " + (score.falseAlarmRate * 100).toFixed(0) + "%</span>" +
      "<span>Go RT " + score.goRT + "ms</span>";
    el.appendChild(sub);

    // Tier evaluation using d-prime thresholds
    if (typeof BrainGym !== "undefined" && BrainGym.evaluate) {
      var variantKey = this.mode + "_" + this.size;
      var tier = BrainGym.evaluate("gonogo", variantKey, score.dprime, 1, true); // pass dprime as time, accuracy=1 for direct comparison
      var comment = BrainGym.pickComment("gonogo", tier);
      var tierEl = document.createElement("div");
      tierEl.style.cssText = "font-size:12px;color:" + C.textDim + ";margin-bottom:10px;font-style:italic";
      tierEl.textContent = comment;
      el.appendChild(tierEl);
    }

    // Divider
    var div = document.createElement("div");
    div.style.cssText = "height:1px;background:" + C.rule + ";margin-bottom:10px;width:100%";
    el.appendChild(div);

    // History comparison and chart (reuse shared module for trend on d-prime)
    if (typeof BrainGym !== "undefined") {
      var history = BrainGym.getGameHistory(key);

      // Build d-prime history for chart
      if (history.length >= 2) {
        var prev = history[history.length - 2];
        if (typeof prev.dprime === "number") {
          var dpDiff = score.dprime - prev.dprime;
          var compEl = document.createElement("div");
          compEl.style.cssText = "text-align:right;font-size:12px;color:" + C.textDim + ";margin-bottom:10px;line-height:1.6";
          if (Math.abs(dpDiff) < 0.05) {
            compEl.innerHTML = "d\' 与上次持平";
          } else if (dpDiff > 0) {
            compEl.innerHTML = "<span style=\"color:" + C.success + "\">d\' 提升 +" + dpDiff.toFixed(2) + "</span>";
          } else {
            compEl.innerHTML = "<span style=\"color:" + C.error + "\">d\' 下降 " + dpDiff.toFixed(2) + "</span>";
          }
          el.appendChild(compEl);
        }
      }

      // Mini sparkline for d-prime trend (3+ records)
      if (history.length >= 3) {
        var chart = document.createElement("div");
        chart.style.cssText = "height:60px;position:relative;margin-top:4px";
        el.appendChild(chart);
        var chartHistory = history.map(function (h) { return { time: h.dprime || 0 }; });
        if (typeof BrainGym.drawTrendChart === "function") {
          BrainGym.drawTrendChart(chart, chartHistory, { invert: true, label: "\u6700\u4f73 d'", unit: "" });
        }
      }

      var count = document.createElement("div");
      count.style.cssText = "text-align:right;font-size:10px;color:" + C.textFaint + ";margin-top:6px";
      count.textContent = "共 " + history.length + " 次记录";
      el.appendChild(count);
    }
  };

  return GoNoGo;
})();
