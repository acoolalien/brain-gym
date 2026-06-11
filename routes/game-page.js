// game-page — 暖纸主题 HTML 模板
export function renderPage({ game, size, token, pluginId }) {
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  const tokenQuery = token ? `?token=${esc(token)}` : "";
  const basePath = `/api/plugins/${esc(pluginId)}/assets`;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  :root {
    --bg:      #F5F0E8;
    --panel:   #EDE7D9;
    --text:    #3C3628;
    --text-dim:#8C8474;
    --text-faint:#B8B0A0;
    --accent:  #C4956A;
    --success: #7A8B6F;
    --error:   #C47A6A;
    --rule:    #DCD5C8;
    --cell-bg: #EDE7D9;
    --flash:   #D4A76A;
  }
  *{margin:0;padding:0;box-sizing:border-box}
  html, body {
    width:100%;height:100%;overflow:hidden;
    background: var(--bg);
    font-family: system-ui, -apple-system, sans-serif;
    color: var(--text);
    font-size: 13px;
    line-height: 1.65;
    letter-spacing: 0.02em;
  }
  body { display:flex; align-items:center; justify-content:center }
  #root {
    width:100%;height:100%;
    display:flex; flex-direction:column;
    align-items:center; justify-content:center;
  }
  button {
    font-family: inherit; font-size: 12px;
    color: var(--text-dim); background: none;
    border: 1px solid var(--rule); border-radius: 3px;
    padding: 3px 10px; cursor: pointer;
    letter-spacing: 0.03em;
  }
  button:hover { color: var(--text); border-color: var(--accent) }
</style>
</head>
<body>
<div id="root"></div>
<script src="${basePath}/games/shared/evaluations.js${tokenQuery}"></script>
<script src="${basePath}/games/shared/results.js${tokenQuery}"></script>
<script src="${basePath}/games/${esc(game)}/game.js${tokenQuery}"></script>
<script>
(function(){
  var params = new URLSearchParams(window.location.search);
  var token = params.get("token") || "";
  var game = "${esc(game)}";
  var size = parseInt("${esc(String(size))}") || 5;
  var pluginId = "${esc(pluginId)}";

  // Expose submit function for results.js to call directly
  window.__submitGameResult = function(game, score) {
    var apiUrl = "/api/plugins/" + pluginId + "/game/result";
    if (token) apiUrl += "?token=" + encodeURIComponent(token);
    try {
      fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game: game, score: score })
      }).catch(function(){});
    } catch(e) {}
  }

  if (game === "schulte" && typeof SchulteGrid === "function") {
    new SchulteGrid({
      container: document.getElementById("root"),
      size: size,
      token: token,
      pluginId: pluginId
    });
  } else if (game === "gonogo" && typeof GoNoGo === "function") {
    var mode = params.get("mode") || "standard";
    new GoNoGo({
      container: document.getElementById("root"),
      size: size,
      mode: mode,
      token: token,
      pluginId: pluginId
    });
  } else if (game === "stroop" && typeof StroopTask === "function") {
    var mode = params.get("mode") || "standard";
    new StroopTask({
      container: document.getElementById("root"),
      size: size,
      mode: mode,
      token: token,
      pluginId: pluginId
    });
  } else {
    document.getElementById("root").innerHTML =
      '<div style="text-align:center;padding:24px;color:var(--text-dim);font-size:13px;letter-spacing:0.03em">' + game + ' 尚未就绪</div>';
  }

  setTimeout(function(){
    try {
      window.parent.postMessage({ kind: "resize", size: { width: 400, height: 400 } }, "*");
      window.parent.postMessage({ kind: "ready" }, "*");
    } catch(e) {}
  }, 200);
})();
</script>
</body>
</html>`;
}
