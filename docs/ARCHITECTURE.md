# brain-gym — 架构设计

> 为什么这样设计，以及每个决定的取舍。写给维护者和未来接手的开发者。

---

## 一、整体定位

brain-gym 是一个 **游戏平台插件**，而非单个游戏。它的核心任务是：

1. 接收 Agent 的工具调用 → 派发游戏卡片
2. 在 iframe 中运行前端游戏
3. 收集并持久化成绩，支持趋势分析和训练计划

插件本身**不包含任何 LLM 逻辑**——所有 AI 判断由 Agent 层完成，插件只提供工具和路由。

---

## 二、关键设计决策

### 决策 1：PluginCard + iframe（而非内联 HTML）

**理由**：
- 游戏需要 Canvas 绘图和复杂 DOM 操作，内联 Markdown 无法承载
- iframe 提供 sandbox 隔离，游戏崩溃不影响聊天界面
- 通过 `postMessage` + `fetch` 桥接前后端，保持数据流清晰

**代价**：
- 跨域限制导致无法使用剪贴板 API
- 卡片尺寸受 400px 宽度硬上限约束
- 调试需在正式插件环境下测试（dev 工具的 `invoke_tool` 只返 JSON，不渲染卡片）

**替代方案**：WebView 内嵌。被否决，因为 Hana 平台不提供此能力。

---

### 决策 2：双存储 —— localStorage（前端）+ dataDir（后端）

```
前端 iframe  ←postMessage→  routes/game.js  →  dataDir/progress.json
    │
    └── localStorage: brain_gym_scores, brain_gym_rounds
```

**理由**：
- **localStorage** 管游戏分数——轻量、离线可用、session 内不受插件更新影响
- **dataDir** 管训练计划进度——需要跨会话持久化，且 Agent 工具需读取
- 两条存储独立，前端故障不影响后端进度，反之亦然

**代价**：
- 同一个游戏分数存了两份（localStorage + dataDir），但用途不同——localStorage 用于游戏内对比和趋势图，dataDir 用于 Agent 的每日反馈
- 两者通过 `postMessage` 桥接，不是实时同步（仅游戏完成时推送一次）

**为什么不用单一后端存储**：前端 Canvas 绘图和趋势图表需要即时读取历史数据，每次 fetch 后端会增加延迟和故障点。localStorage 是零延迟读取。

---

### 决策 3：前端模块分 shared/ 和 {游戏名}/

```
assets/games/
  shared/              ← 跨游戏共享
    results.js         评价引擎 + 图表 + 分数展示
    evaluations.js     评价数据（阈值、词库、标签）
  schulte/game.js      ← 每个游戏独立子目录
  gonogo/game.js
  stroop/game.js
```

**理由**：
- `shared/` 里的东西每个 iframe 都加载，不管玩什么游戏
- 游戏专属模块只加载自己的 `game.js`，避免不必要的代码传输
- 子目录命名天然提供游戏注册——`assets/games/xxx/game.js` 就是「xxx 游戏存在」

**约束**：
- `results.js` 必须在 `evaluations.js` 之后加载（前者依赖后者的 `ns.EVAL` 数据）
- `game.js` 必须在 `results.js` 之后加载（游戏模块调用 `BrainGym.showResults`）

---

### 决策 4：config.json 作为游戏注册表

```json
{
  "games": {
    "schulte": { "implemented": true, "aspectRatio": "1:1", "label": "舒尔特表格" },
    "gonogo": { "implemented": true, "label": "Go/No-Go", "aspectRatio": "1:1" }
  },
  "plans": { ... }
}
```

**理由**：
- 此前游戏列表散落在 `routes/game.js`（allowedGames）、`start-game.js`（IMPLEMENTED_GAMES）、`config.json`（计划引用）三处，加游戏需同步三个地方
- 统一到 config.json 后，`routes/game.js` 和 `start-game.js` 都从 `config.games` 的 key 动态生成白名单
- `implemented: false` 的游戏会被 Agent 工具拦截并提示「尚未实现」，但路由已预先注册，Agent 可以引用计划模板

**代价**：
- config.json 体积随游戏数量线性增长
- 路由保护依赖 config 读取（每次请求读文件），但 Node.js 会缓存文件系统元数据，实际开销可忽略

---

### 决策 5：评价引擎与评价数据分离

```
evaluations.js  →  数据（阈值、词库、标签）      改数据不改引擎
results.js      →  引擎（evaluate、pickComment） 改引擎不改数据
```

**理由**：
- 新游戏只需在 `evaluations.js` 追加数据条目，不需要理解图表 Canvas 绘制或分数计算逻辑
- 引擎未来可升级（比如改评价算法、调整图表样式），所有游戏自动受益

**当前限制**：
- 标签映射虽然存在 `evaluations.js` 中，但 `results.js` 的 `showResults()` 曾对游戏名做了硬编码引用（`ns.pickLabel("schulte", variant)`）——**已修复**：现改为从 `score.modeKey` 解析游戏名后通用调用

---

### 决策 6：Agent 工具拆分为 start_game 和 training_status

**理由**：
- `start_game`：单一职责——决定今天玩什么、返回卡片。高频调用
- `training_status`：查询入口——报进度、查看趋势、连续打卡。低频调用
- 两个工具各司其职，Agent 路由清晰，不会在同一个工具里塞进「出题」和「查进度」两种完全不同的意图

**替代方案**：合并为一个工具，用 `action` 参数区分。被否决，因为参数多了 Agent 倾向于不传或在错误场景传错 action。

---

### 决策 7：配色系统独立副本（而非共享 CSS）

当前色值在 `game-page.js`（CSS 自定义属性）、`results.js`（JS object）、`schulte/game.js`（JS object）各定义一份。

**为什么还没抽取**：
- 三个运行环境不同——game-page.js 是服务端模板字符串注入 CSS，results.js 和 schulte/game.js 是 iframe 内的 JS，共享 CSS 文件需要平台支持静态文件引用
- 色值当前 11 个，手动同步成本低（改动极少），抽取的收益暂不抵成本

**未来方向**：当游戏数量超过 3 个时，应抽取 `shared/palette.js` 常量文件，在 game-page.js 中通过 JS 注入 CSS 变量，消除多副本。

---

## 三、数据流

### 正常游戏流程

```
用户: "来个舒尔特"
  → Agent 调用 start_game tool
    → start-game.js 读取 config，验证游戏已实现
    → 构建卡片 → 返回 { type: "iframe", route: "/game?game=schulte&size=5&token=..." }
  → 前端渲染 iframe，加载 200ms 后 postMessage 请求 resize 到 400×400
  → iframe 内加载 evaluations.js → results.js → 对应 game.js（schulte/gonogo/stroop）
  → 用户点击「开始」→ 游戏开始计时
  → 用户完成游戏
    → game.js finish() → BrainGym.saveScore(key, score) → localStorage
    → BrainGym.showResults(container, key, score) → 渲染分数 + 评价 + 图表
    → postMessage({ kind: "result", score }) → game-page.js 监听器
    → fetch POST /api/plugins/xxx/routes/game/result?token=xxx
```

### 计划进度查询（已归档 — 未来版本恢复）

```
用户: "训练进度"
  → Agent 调用 training_status tool
    → plan-engine.js getStatus(pluginDir, dataDir, "daily")
    → 读取 config.json 计划模板 + dataDir/progress.json 执行状态
    → 返回今日目标 + 昨日对比文字
```

---

## 四、模块职责矩阵

| 模块 | 层 | 职责 | 输入 | 输出 |
|------|----|------|------|------|
| `index.js` | 入口 | 插件生命周期 | — | — |
| `config.json` | 配置 | 游戏注册表 + 计划模板 | — | JSON |
| `tools/start-game.js` | Agent工具 | 出卡 | 用户输入 | PluginCard |
| `tools/training-status.js` | Agent工具（已归档） | 查询进度 | — | — |
| `routes/game.js` | 路由 | iframe 渲染 + 结果接收 | HTTP GET/POST | HTML / JSON |
| `routes/game-page.js` | 模板 | HTML 模板生成 | game/size/token | HTML 字符串 |
| `lib/plan-engine.js` | 业务逻辑（已归档） | 计划解析 + 进度管理 | — | — |
| `lib/storage.js` | 基础设施 | 文件读写 | filePath + data | JSON object |
| `assets/games/shared/results.js` | 前端 | 分数存储+展示+图表+评价引擎 | 历史数据 | DOM 渲染 |
| `assets/games/shared/evaluations.js` | 前端 | 评价数据 | — | ns.EVAL 对象 |
| `assets/games/xxx/game.js` | 前端 | 游戏逻辑（Canvas/DOM） | container+size | 交互状态 |
| `skills/brain-gym/SKILL.md` | Agent技能 | Agent 行为路由 | — | 技能指令 |

---

## 五、外部依赖与约束

| 依赖 | 用途 | 约束 |
|------|------|------|
| Hana Plugin SDK | 插件生命周期、工具注册、路由 | 工具需导 `execute(input, toolCtx)`，路由需导 `(app, ctx)` |
| localStorage | 前端游戏分数持久化 | 同一域名下所有插件共享，key 名需防冲突 |
| dataDir | 服务端计划进度持久化 | 路径由 platform 注入 `toolCtx.dataDir` |
| PluginCard iframe | 前端游戏容器 | 最大 400×600px，sandbox 无剪贴板，token 必须走 query 注入 |
| Canvas API | 舒尔特网格绘制、趋势图表 | 2D context 兼容即可 |
| Node.js fs | 服务端文件读写 | 仅 lib/storage.js 使用 |

---

## 六、已知技术债务

1. ~~`results.js` 对游戏名的硬编码引用~~（**已修复**：从 `score.modeKey` 解析游戏名通用调用）
2. **`game-page.js` 游戏分发用 if-else**：当前三个游戏通过 if-else 分发，超过 5 个时应改注册表模式（如 `BrainGym.register("stroop", StroopGame)`）
3. **配色多副本**：色值在三处独立定义，游戏超过 3 个时应抽取 `shared/palette.js`
4. **`recordResult` 不验证分数真实性**：客户端可以 post 任意数据到 `/game/result`，未来可加 HMAC 签名
5. **训练计划不支持暂停/跳过**：目前只支持顺序执行，`currentDay` 只能递增
6. **图表 Y 轴只标注最好成绩**：最初设计是双极标注，因裁剪问题简化为单点，未来可恢复

---

## 七、加新游戏步骤（摘要）

1. 在 `config.json` 的 `games` 下注册（`implemented: false` → later `true`）
2. 在 `assets/games/xxx/` 创建 `game.js`，实现构造器 `{ container, size, token, pluginId }` → `createUI` + `handleClick` + `finish`
3. 在 `shared/evaluations.js` 追加阈值、词库、标签
4. 在 `game-page.js` 添加分发分支（`if (game === "xxx")`），或实现注册表模式后跳过此步
