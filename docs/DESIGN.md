# 脑力热身 — 游戏设计模板规范

> 从舒尔特表格开发过程中抽取，用于指导后续游戏的设计实现。

---

## 一、配色系统

统一使用暖纸色调，避免冷黑或荧光色系。当前各模块独立定义同一套色值（`game-page.js` CSS、`results.js` JS object、`schulte/game.js` JS object），后续可抽取为共享模块。

```css
--bg:        #F5F0E8   /* 米白底，不纯白，不纯黑 */
--panel:     #EDE7D9   /* 微深的纸色面板 */
--text:      #3C3628   /* 深棕墨色正文 */
--text-dim:  #8C8474   /* 次级文字 */
--text-faint:#B8B0A0   /* 弱化文字（标签、注释） */
--accent:    #C4956A   /* 暖纸/旧黄铜强调色 */
--success:   #7A8B6F   /* 灰绿——安静的成功，不刺眼 */
--error:     #C47A6A   /* 暗玫瑰木——提示失误，不恐吓 */
--rule:      #DCD5C8   /* 浅纸纹分隔线 */
--cell-bg:   #EDE7D9   /* 单元格底色 */
--flash:     #D4A76A   /* 0.2s 按压反馈闪烁色 */
```

**原则**：
- 强调色只用一处（分数大字、激活按钮边框），其他地方用文字灰度区分层级
- 成功/错误不用纯绿纯红，降低饱和度适配长时间阅读
- 网格线和分隔线极细极淡（0.5px），只提供视觉引导不抢注意力

---

## 二、布局结构

卡片内采用 flex column 三段式，后续游戏复用同一 DOM 骨架：

```
┌────────────────────────────┐
│  顶栏（模式 + 难度 + 重试）  │  flex-shrink: 0
├────────────────────────────┤
│  状态栏（目标 + 计时）       │  flex-shrink: 0
├────────────────────────────┤
│                            │
│  游戏区（flex: 1）          │  正方形居中
│   - Canvas / DOM 游戏画布   │
│   - 开始按钮覆盖层          │
│   - 新手引导覆盖层          │
│                            │
├────────────────────────────┤
│  结果区（默认隐藏）          │  替换游戏区
│   - 分数大字                │
│   - 旁注对比                │
│   - 趋势曲线                │
└────────────────────────────┘
```

**原则**：
- 游戏区用 `flex: 1` + `min-height: 0` 占满剩余空间，不写死像素
- Canvas 取 `min(容器宽 - 边距, 游戏区高 - 边距)` 保证正方形
- 数字/元素用 `textAlign: center` + `textBaseline: middle` 居中
- 四周 padding 一致，不留偏边

---

## 三、交互反馈规范

| 动作 | 反馈 | 时长 | 实现 |
|------|------|------|------|
| 正确点击 | 暖金半透明覆层 | 0.2s 后重绘 | `rgba(212,167,106,0.28)` fillRect，不重绘文字 |
| 错误点击 | 暖玫半透明覆层 | 0.25s 后重绘 | `rgba(196,122,106,0.32)` fillRect，不重绘文字 |
| 完成瞬间 | 暖铜色边缘暗光 | 0.8s 淡出 | canvas box-shadow transition |
| 模式切换 | 即时重绘 | — | `if (started) draw()` |

**原则**：
- 反馈只用半透明覆层覆盖画布，不重绘文字——避免原文字和反馈文字叠加产生重影
- 正确/错误反馈时长控制在 0.2-0.25s，短到不打断节奏，长到能感知
- 完成动画用 CSS transition，不用 JS 动画循环

---

## 四、难度梯度设计

每个游戏支持两个维度的难度调节：

### 维度一：模式（认知负荷）
- **标准模式**：基础玩法，已完成的步骤保持视觉标记
- **记忆模式**：完成步骤仅 0.2s 反馈后恢复原状，需自行记忆进度

### 维度二：规模（信息密度）
- 5×5 / 6×6 / 7×7 三级，逐级增加同时需要处理的信息量

### 统计隔离
每种模式×规模的组合独立统计，key 格式：`{game}_{standard|memory}_{size}`

**原则**：
- 难度切换不应打断游戏需要额外确认——直接生效
- 切换规模时自动重置棋盘（retry），模式切换不重置
- 统计数据严格按组合分类，不做跨难度对比

---

## 五、数据与存储

### 前端（localStorage）
```js
brain_gym_scores: {
  "schulte_standard_5": [{ time, accuracy, errors, difficulty, size, modeKey, round, date }, ...],
  "schulte_memory_6": [...],
  ...
}
brain_gym_rounds: 69  // session 内累计局数，仅计数不展示
```

### 后端（dataDir，plan-engine）
```js
progress.json: {
  planId, currentDay, startedAt,
  dailyResults: { "1": { game, score, completedAt }, ... }
}
```

**原则**：
- 前端只管游戏分数和 session 计数，后端管训练计划进度
- 结果回传链路：游戏完成 → postMessage → game-page 监听 → fetch POST /game/result → recordResult
- 对比和趋势图基于完整历史，不受重试覆盖

---

## 六、结果展示规范

### 信息层级

1. **标题**：游戏名 + 规模（如「舒尔特 5×5」）
2. **模式标签**：小字浅色，如「标准 5×5」
3. **分数大字**：28px light weight，强调色
4. **分隔线**：1px rule 色
5. **对比旁注**：右对齐，12px，与上次的差值
6. **趋势曲线**：Schulte≥5 次、Go/No-Go≥3 次后出现，细线描边。纵轴因游戏而异——Schulte 用 `time/accuracy` 复合分（越低越好），Go/No-Go 用 d-prime（越高越好），由 `drawTrendChart` 的 `invert` 参数控制方向
7. **计数**：最底部右对齐小字「共 N 次记录」

### 图表规范

- 纵轴：因游戏而异。Schulte 用 `time/accuracy` 复合分（越低越好，曲线上部=进步）；Go/No-Go 用 d-prime（越高越好，由 `invert: true` 反转纵轴）
- 标注：仅标注最好成绩（最低复合分），显示在对应数据点下方。不标坐标轴
- 线条：1.5px 强调色实线，端点 2.5px 圆点
- 辅助线：虚线参考线（首次基线 + 本次线）
- 无填充色，无网格背景

**原则**：
- 首次训练只显示基线建立提示，不做对比
- 图表 Y 轴标注随数据点而动，不固定在图边缘
- 不显示 session 局号（#69），纯数据存在后台

---

## 七、容错与边界

| 场景 | 处理 |
|------|------|
| 卡片重载（session 滚动） | 开始按钮覆盖层，不自动计时 |
| 重试 | 保存当前结果后再生成新棋盘，计数 +1 |
| 旧数据无 accuracy 字段 | 图表降级为裸 time |
| 旧数据无 modeKey 字段 | showResults 跳过模式标签 |
| 切换规模 | 自动 retry，棋盘全新 |
| iframe 鉴权 | token 从 URL query 传入 HTML → 注入外部 JS src |

---

## 八、加新游戏清单

1. 在 `config.json` 的 `games` 项注册游戏，`implemented: true`，添加 label、aspectRatio、params
2. 在 `assets/games/` 下新建子目录 `xxx/`，创建 `game.js`，IIFE 模式导出构造函数
3. 构造函数接收 `{ container, size, token, pluginId }`
4. 实现数据生成、`createUI()`（三段式布局）、交互处理、`finish()`（存分 + 展示结果）
5. 调用 `BrainGym.saveScore(modeKey, score)` 和 `BrainGym.showResults(container, modeKey, score, title)`
6. 在 `shared/evaluations.js` 的 `ns.EVAL` 下添加该游戏的阈值、点评词库和标签
7. 在 `game-page.js` 的 `if (game === "xxx")` 分支注册
8. 在 `tools/start-game.js` 和 `skills/brain-gym/SKILL.md` 更新游戏描述
