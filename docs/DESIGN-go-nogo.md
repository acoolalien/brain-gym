# Go/No-Go — 游戏设计方案

> 认知范式：反应抑制（Response Inhibition）。通过建立自动化按键习惯后在部分试次要求克制的冲突，测量前额叶抑制控制功能。
> 状态：已实现。复用于 Stroop 的逐试次循环引擎。

---

## 参考文献

### 范式来源
1. **Bezdjian, S., et al. (2009)**. "Assessing inattention and impulsivity in children during the Go/NoGo task." *British Journal of Developmental Psychology*, 27(2), 365–383. — 提供 P/R 字母刺激范式的标准参数（80:20 Go:No-Go 比例、500ms 刺激时长、1500ms ISI）。
2. **Luria, A. R. (1960s)**. 前额叶损伤患者的临床观察——Go/No-Go 范式的原始来源，确立反应抑制作为执行功能核心指标的定位。
3. **Donders, F. C. (1868)**. "On the speed of mental processes." — Go/No-Go 任务的最早实验形式（c-go/no-go 的区分）。

### 评分标准
4. **strooptest.online** (2026). "Free Online Go/No-Go Test." https://strooptest.online/tests/go-nogo — 提供误报率分级基准（<10% 优秀、10-20% 良好、>40% 需改善）、d-prime 信号检测论指标、Go 反应时区间划分（300-450ms 最优）。
5. **Macmillan, N. A., & Creelman, C. D. (2005)**. *Detection Theory: A User's Guide*. — d-prime (d') 信号检测论的标准算法：d' = Z(Hit Rate) - Z(False Alarm Rate)，用于区分辨别力与反应偏向。

### 参考实现
6. **vekteo/GoNoGo_jsPsych** (GitHub). https://github.com/vekteo/GoNoGo_jsPsych — jsPsych 框架下的 Go/No-Go 完整实现（P/R 字母、160 试次、练习阶段、CSV 导出）。提取参数：刺激 500ms、ISI 1500ms、80:20 比例、练习 20 试次。
7. **flowersteam/cognitive-testbattery** (GitHub). https://github.com/flowersteam/cognitive-testbattery — 学术认知测试电池，含 Go/No-Go 任务（p5.js），提供多试次计分和 d-prime 分析的工程参考。

---

## 一、认知模型

### 核心机制

Go 试次占总试次 75%，用户快速建立「看到刺激→按键」的自动化反应。No-Go 试次（25%）要求抑制这个习惯化动作。**反应抑制的难度不来自规则理解，而来自自动化行为与克制指令之间的冲突。**

```
试次序列示例（S=标准模式）:
P → 按 ✓    R → 不按 ✓    P → 按 ✓    P → 按 ✓
R → 按 ✗（误报）  P → 不按 ✗（遗漏）  P → 按 ✓
```

### 与前额叶功能的对应

| 指标 | 认知功能 | 脑区 |
|------|---------|------|
| 误报率（False Alarm） | 抑制控制核心指标 | 右侧额下回（rIFG） |
| 遗漏率（Miss） | 持续性注意力 | 前扣带回（ACC）+ 背外侧前额叶（DLPFC） |
| Go 反应时 | 加工速度 | 运动皮层 + 基底节 |
| d-prime | 信号辨别力（区分辨别力与反应偏向） | 前额叶-顶叶联合网络 |

---

## 二、刺激与交互设计

### 刺激规范

- **标准模式**：单字母刺激——`P` = Go（按键），`R` = No-Go（不按键）。P/R 选用的理由：(1) 学术标准（Bezdjian et al., 2009）；(2) 视觉辨别度高于 O/Q 等易混淆字母；(3) 无文化和语言偏向。
- **反转模式**：前 50% 试次规则同标准模式。过半程后角色互换（P=不按，R=按），屏幕中央大字提示「⚠ 规则反转」。检验认知灵活性。
- 刺激字体：40-48px 无衬线，颜色 `--text (#3C3628)`，居中显示。
- 背景：游戏区透明，字母浮于页面底色之上

### 交互方式

| 平台 | 操作 | Go 试次 | No-Go 试次 |
|------|------|---------|------------|
| 桌面 | 空格键 | 按下 | 不按 |
| 移动端/触屏 | 点击刺激区 | 点击 | 不点 |

- 空格键按下（keydown）即判定，非抬起（keyup）——减少物理延迟
- 每个试次只接受一次按键。超时（stimulusDuration + 1000ms）自动进入下一试次
- 桌面端在页面加载时监听 `keydown`，不依赖输入框焦点

---

## 三、试次流程与时序

```
┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│  注视点   │ → │  刺激呈现 │ → │  反馈闪现 │ → │   间隔   │ → 下一试次
│  +       │   │  P / R   │   │  0.22s   │   │   空白    │
│ 400ms    │   │ 500ms    │   │          │   │ 600ms    │
└──────────┘   └──────────┘   └──────────┘   └──────────┘
                ←── 响应窗口（刺激出现 → 下一试次前共 1000ms）──→
```

| 阶段 | 时长 | 说明 |
|------|------|------|
| 注视点 | 400ms | 小十字 "+" 居中，告知试次即将开始，收敛注意力 |
| 刺激呈现 | 500ms | 字母 P 或 R，居中大号显示。用户在此窗口内做出响应（按键/不按键） |
| 反馈闪现 | 220ms | 正确/错误覆层，不叠加文字（见第四节） |
| 间隔 | 600ms | 空白，给用户喘息空间，防止视觉残留干扰下一试次 |
| **单试次总时长** | **~1720ms** | 40 试次 ≈ 69 秒；50 试次 ≈ 86 秒；70 试次 ≈ 120 秒 |

**设计取舍**：
- 注视点选用 400ms 而非学术标准的 500-1000ms（学术实验需要更长间隔用于 fMRI 血氧响应归零，游戏场景无需）
- ISI 选用 600ms 而非学术标准的 1500ms（学术实验需响应延迟归零 + EEG 基线，游戏场景以流畅节奏优先）
- 刺激呈现保留 500ms 学术标准，因为 <400ms 会导致遗漏率激增（信号未充分进入意识）

---

## 四、交互反馈规范

沿用 DESIGN.md 第三章的反馈原则——仅用半透明覆层，不重绘文字。

| 事件 | 反馈 | 时长 | 实现 |
|------|------|------|------|
| Go 正确（按时按键） | 暖金覆层 | 0.22s | `rgba(212,167,106,0.28)` 覆盖刺激区，文字保持可见 |
| No-Go 正确（未按键） | 温和暗化 | 0.22s | `rgba(60,54,40,0.12)` 覆层，表示"安静通过" |
| 误报（No-Go 时按键） | 暖玫覆层 | 0.25s | `rgba(196,122,106,0.32)` 覆层 + 刺激区微颤（CSS transform translateX ±2px 一次） |
| 遗漏（Go 时未按键） | 灰色暗化 | 0.25s | `rgba(60,54,40,0.18)` 覆层，暗示"这里应该响应" |
| 规则反转提示 | 大字黄色提示 | 2s | 反转模式专有，暂停试次循环，显示「⚠ 规则反转！现在 R=按，P=不按」 |

**冲突与时序**：如果一个试次内先有按键再超时，以按键为准——反馈立刻触发，超时不覆盖。

---

## 五、难度梯度设计

### 模式维度（认知负荷）

| 模式 | modeKey 后缀 | 描述 | 反转时机 |
|------|-------------|------|---------|
| 标准 | `standard` | P=Go, R=No-Go 全程固定 | 无 |
| 反转 | `reversal` | 过半程后 P/R 角色互换 | 试次 N/2 + 1 |

### 规模维度（信息密度）

| 规模 | 试次数 | 总时长（估算） | 定位 |
|------|--------|---------------|------|
| 30 | 30 | ~52 秒 | 快速热身 / 每日短训 |
| 50 | 50 | ~86 秒 | 标准训练剂量 |
| 70 | 70 | ~120 秒 | 耐力挑战 |

### 统计隔离

6 种组合独立统计，key 格式：`gonogo_{standard|reversal}_{30|50|70}`

Go:No-Go 比例固定为 75:25（30 试次中 22 Go + 8 No-Go，50 试次中 37 Go + 13 No-Go，70 试次中 52 Go + 18 No-Go）。比例不随难度变化——保持 75:25 可确保"自动化习惯建立"的核心机制在所有难度下一致生效。

---

## 六、评分系统

### 原始指标

| 指标 | 计算 | 最佳方向 |
|------|------|---------|
| 命中率（Hit Rate） | Go 正确按键数 / Go 总试次 | ↑ |
| 误报率（False Alarm Rate） | No-Go 误按键数 / No-Go 总试次 | ↓（核心指标） |
| 遗漏率（Miss Rate） | Go 未按键数 / Go 总试次 | ↓ |
| 总准确率（Accuracy） | (正确 Go + 正确 No-Go) / 总试次 | ↑ |
| Go 平均反应时（Go RT） | Go 试次按键延迟均值（ms） | ↓ |
| d-prime（d'） | Z(Hit Rate) - Z(False Alarm Rate) | ↑ |

### 复合分（适配现有 evaluate 引擎）

现有引擎使用 `composite = time / accuracy`。Go/No-Go **不使用此复合分**，改用 d-prime 直接评估：

```
evaluate("gonogo", variantKey, score.dprime, 1, higherIsBetter=true)
```

- 传入 d-prime 作为 time，accuracy 固定为 1（使 `time/accuracy = d'`）
- `higherIsBetter=true` 使评估方向反转：**d' 越高成绩越好**
- 阈值从升序改为降序排列（见下一节）

### 评价阈值（tentative——需实测校准）

```
gonogo thresholds:
  standard_30: [3.0, 2.5, 2.0, 1.5]   // S≥3.0, A≥2.5, B≥2.0, C≥1.5
  standard_50: [3.0, 2.5, 2.0, 1.5]
  standard_70: [3.0, 2.5, 2.0, 1.5]
  reversal_30: [2.7, 2.2, 1.7, 1.2]   // 反转模式容差 ~0.3
  reversal_50: [2.7, 2.2, 1.7, 1.2]
  reversal_70: [2.7, 2.2, 1.7, 1.2]
```

**校准依据**：基于健康年轻成人常模（d' 2.5–3.5），S 级对应前 10–15%。今后如有 ≥30 局真实玩家数据，可按分布重新校准。

### 点评词库设计方向（具体文案在 evaluations.js 中定义）

按 S/A/B/C/D 五级，每级 5 条。点评主题围绕：
- S 级：「抑制控制顶尖」「大脑刹车系统运转完美」
- A 级：「控制力出色」「偶尔手滑但不影响大局」
- B 级：「稳定发挥」「正在建立抑制通路」
- C 级：「冲动控制还有空间」「规律的训练会收紧刹车」
- D 级：「起步阶段」「前额叶这块肌肉会慢慢强健」

---

## 七、UI 布局

沿用 DESIGN.md 的三段式 flex column 骨架（游戏区不使用 Canvas，纯 DOM 渲染）：

```
┌──────────────────────────────┐
│  顶栏                        │  flex-shrink: 0
│  [模式标签]     [试次进度]    │  左：标准/反转 + 规模
│  [重试按钮]                  │  右："7/40"
├──────────────────────────────┤
│  状态栏                      │  flex-shrink: 0
│  P 响应 · R 抑制         │  规则提示 + 实时计时
│  计时: 00:42                │
├──────────────────────────────┤
│                              │
│          ┌──────┐            │
│          │      │            │  flex: 1
│          │  P   │            │  刺激显示区（居中正方形区域）
│          │      │            │  背景透明，字母 44px
│          └──────┘            │
│    空格键响应                    │  引导文字 11px textFaint
│                              │
├──────────────────────────────┤
│  结果区（默认隐藏）           │  替换游戏区内容
│  分数 + 评价 + 趋势图        │  同 results.js showResults()
└──────────────────────────────┘
```

**与 Schulte 布局的差异**：
- 顶栏的「规模」显示试次数而非网格尺寸
- 游戏区不需要 Canvas——DOM 居中字母 + 点击区足够
- 状态栏增加规则提示（标准模式下行可隐藏，反转模式必显示）

### 开始按钮与引导

- 首次进入：游戏区中央显示大号「开始」按钮（`--accent` 边框，`--text-dim` 文字）+ 规则提示
- 后续重试：顶栏「重试」按钮可用，游戏区恢复开始按钮覆盖层
- 反转模式：在试次过半时弹出 2 秒全屏提示后再继续

---

## 八、数据存储格式

### localStorage（前端）

```js
brain_gym_scores: {
  "gonogo_standard_30": [{
    time: 0.412,          // Go RT 均值（秒）
    accuracy: 0.925,      // 总准确率 (0-1)
    hitRate: 0.955,       // 命中率
    falseAlarmRate: 0.125,// 误报率
    missRate: 0.045,      // 遗漏率
    dprime: 2.8,          // d-prime
    goRT: 412,            // Go RT 均值（ms，冗余但便于调试）
    commissionErrors: 1,  // 误报数
    omissionErrors: 1,    // 遗漏数
    totalTrials: 30,
    goTrials: 22,
    noGoTrials: 8,
    modeKey: "gonogo_standard_30",
    difficulty: "standard",
    size: 30,
    round: 42,            // session 累计局数
    date: "2026-06-11T09:22:00.000Z"
  }]
}
```

**设计说明**：
- `time` / `accuracy` 字段是 `results.js` 的 evaluate/showResults 所需的最小接口
- `hitRate` / `falseAlarmRate` / `dprime` 为扩展字段——当前 results.js 的对比逻辑只用到 time 和 accuracy，未来可扩展对比维度
- `goRT` 冗余存储 ms 值，便于调试和手动查看时无需换算

### dataDir（后端 plan-engine）

```json
{
  "dailyResults": {
    "3": {
      "game": "gonogo",
      "score": { "time": 0.412, "accuracy": 0.925 },
      "completedAt": "2026-06-11T09:22:00.000Z"
    }
  }
}
```

后端只存储 `time` 和 `accuracy`——plan-engine 的 `formatScore()` 和 `compareScores()` 只消费这两个字段（见 `tools/training-status.js`），扩展字段留在前端 localStorage。

---

## 九、与现有模块的集成点

### shared/results.js（评价引擎）
- `showResults()` 中的 `pickLabel()` 曾硬编码了 `"schulte"`——**已修复**：现改为从 `score.modeKey` 解析 `gameKey` 后通用调用
- `drawTrendChart()` 的 Y 轴复合分逻辑无需改动（time/accuracy 公式通用）
- 趋势曲线只显示 time/accuracy 复合分，不单独绘制 hitRate/falseAlarmRate/dprime 曲线（保持图表简洁）

### shared/evaluations.js（评价数据）
- 在 `ns.EVAL` 下新增 `gonogo` 条目，含 `thresholds`（6 个 variantKey）、`labels`（显示标签）、`comments`（S/A/B/C/D 各 5 条）

### game-page.js（HTML 模板 + 游戏分发）
- 新增 `if (game === "gonogo" ...)` 分支，实例化 `GoNoGo` 构造器
- 参数注入：`{ container, size, token, pluginId }`——`size` 映射为试次数（30/50/70），模式通过 URL query `?mode=reversal` 传入

### config.json（游戏注册表）
- `games.gonogo.implemented` 从 `false` 改为 `true`
- `params` 定义：`{ size: { type: "number", default: 30, min: 30, max: 70 }, mode: { type: "string", default: "standard" } }`

---

## 十、已知的开放问题

1. **反转模式的评价阈值**：暂估为同规模标准模式 +20%，需实测校准。反转模式的认知负荷不仅来自规则转换，还来自前 50% 试次建立的习惯与后 50% 规则的冲突——proactive interference 效应可能导致实际难度高于 +20% 估算。

2. **误报 vs 遗漏的权重**：当前 composite 用总体准确率（平等对待误报和遗漏），但反应抑制范式的核心指标是误报率。如果后续实战发现用户普遍"宁可漏也不误报"（策略性保守），可能需要引入误报率加权因子。

3. **移动端触屏延迟**：触屏 click 事件有 ~300ms 内置延迟（等待 double-tap 判定）。如果使用 `pointerdown` 替代 `click`，可以消除延迟但可能意外触发。需实测决定。

4. **试次序列的随机化算法**：前 5 个试次强制为 Go（建立响应习惯），之后 Go:No-Go=75:25 随机排列，但连续 No-Go 不超过 2 个（防止用户产生"不会有连续 No-Go"的预期）。学术文献中这种约束称为"constrained randomization"，需在生成算法中实现。

5. **反转模式的角色提示持久化**：反转后用户可能短暂忘记新规则。除了半程时的弹出提示，是否需要在每个试次的刺激旁加上小字提示（如 `P → ⏸` `R → ▶`）？加入会增加认知卸载，不加更贴近真实抑制控制测试。初始版本不加——反转模式的难度正来自「需要记忆新规则」这一认知负荷。
