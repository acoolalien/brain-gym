---
name: brain-gym
description: 认知训练插件，提供舒尔特表格（注意力广度）、Go/No-Go（反应抑制）、Stroop 色词（干扰抑制）三种脑力小游戏。通过 iframe 卡片交互，适合日常大脑锻炼。
---

# 脑力热身

**MANDATORY TRIGGERS:** 脑力热身, 来一局, 练练脑子, 舒尔特, 注意力训练, 认知训练, 小游戏, 脑力, 大脑训练, 专注力, 反应抑制, 抑制控制, 干扰抑制, Go/No-Go, gonogo, Stroop, stroop, 色词, 色词测试, 色词干扰, 注意力广度, 数字网格, schulte, cognitive training

提供认知训练小游戏的卡片插件，按用户指定的游戏自由练习。

## Agent 工作流

### 用户说"脑力热身"或指定游戏

1. 用户指定游戏 → 调用 `start_game` tool 传递对应参数
2. 返回了卡片 → 展示卡片，提示用户玩完
3. 用户什么都没说 → 列举可用游戏，让用户选

### 用户指定游戏

- "来个舒尔特" → `start_game({ game: "schulte" })`
- "舒尔特 6×6" → `start_game({ game: "schulte", params: { size: 6 } })`
- "来个 Go/No-Go" → `start_game({ game: "gonogo" })`
- "50 试次 Go/No-Go" → `start_game({ game: "gonogo", params: { size: 50 } })`
- "来个 Stroop" → `start_game({ game: "stroop" })`
- "色词测试 50 试次" → `start_game({ game: "stroop", params: { size: 50 } })`
- "高干扰模式 Stroop" → `start_game({ game: "stroop", params: { mode: "enhanced" } })`

### 用户查询训练分析

- "查看训练分析" / "训练报告" / "我的成绩" → 调用 `training_analysis` tool
- 可指定游戏："舒尔特分析" → `training_analysis({ game: "schulte" })`
- 可指定条数："最近 10 局" → `training_analysis({ limit: 10 })`
- 指定游戏并查看明细："Go/No-Go 各局详情" → `training_analysis({ game: "gonogo", mode: "detail" })`

### Agent 分析训练数据

当用户说"分析"、"看看表现"、"评估"、"训练报告"时：
1. 调用 `training_analysis` 获取数据（也可读取 `<plugin-data>/brain-gym/scores.jsonl` 原始记录）
2. 按 `references/ANALYSIS-TEMPLATE.md` 的结构输出分析
3. 字段含义参考该文档的各游戏字段说明表
4. 等级标准参考各游戏说明中的 S/A/B/C 阈值

## 游戏类型

### 舒尔特表格（schulte）
- **说明**：5×5（默认）/ 6×6 / 7×7 数字网格，按 1-25 升序点击，计时完成。测视觉搜索速度和注意力广度
- **参数**：`params.size` = 5/6/7（默认 5），`params.mode` = standard / memory（默认 standard）
- **调用示例**：
  - `start_game({ game: "schulte" })` — 5×5
  - `start_game({ game: "schulte", params: { size: 6 } })` — 6×6
  - `start_game({ game: "schulte", params: { size: 4, mode: "memory" } })` — 4×4 记忆模式
- **结果解读**：时间越短越好。S 级 ≤20s，A 级 ≤28s，B 级 ≤38s，C 级 ≤55s（5×5 标准）
- **适合**：日常快速暖脑

### Go/No-Go（gonogo）
- **说明**：75% P（按键） / 25% R（不按）刺激序列，按空格键响应 P、克制 R 的冲动。测反应抑制和前额叶刹车能力。30 试次约 1 分钟
- **参数**：
  - `params.size` = 30/50/70（默认 30）
  - `params.mode` = standard / reversal（默认 standard）
    - standard：全程 P=按键 R=不按
    - reversal：半程反转 P↔R 角色
- **调用示例**：
  - `start_game({ game: "gonogo" })` — 标准 30 试次
  - `start_game({ game: "gonogo", params: { size: 50 } })` — 标准 50 试次
  - `start_game({ game: "gonogo", params: { mode: "reversal" } })` — 反转 30 试次
  - `start_game({ game: "gonogo", params: { size: 70, mode: "reversal" } })` — 反转 70 试次
- **结果解读**：d'（敏感度）越高越好。S 级 ≥3.0（标准）/ ≥2.7（反转），A 级 ≥2.5/2.2，B 级 ≥2.0/1.7。误报率反映冲动控制，Go RT 反映处理速度
- **适合**：有注意力基础后的进阶训练、抗冲动

### Stroop 色词（stroop）
- **说明**：判断字体颜色（忽略词义），按对应颜色键（1=红 2=绿 3=蓝 4=黄）。测干扰抑制和前扣带回认知控制能力。30 试次约 1.5 分钟
- **参数**：`params.size` = 30/50/70（默认 30），`params.mode` = standard / enhanced（默认 standard）
  - standard：50% 一致 / 50% 不一致
  - enhanced：25% 一致 / 75% 不一致（更高干扰负荷）
- **调用示例**：
  - `start_game({ game: "stroop" })` — 标准 30 试次
  - `start_game({ game: "stroop", params: { size: 50 } })` — 标准 50 试次
  - `start_game({ game: "stroop", params: { mode: "enhanced" } })` — 高干扰 30 试次
  - `start_game({ game: "stroop", params: { size: 70, mode: "enhanced" } })` — 高干扰 70 试次
- **结果解读**：Stroop 效应量（不一致 RT − 一致 RT）越小越好。标准模式 S≤50ms / A≤150ms / B≤250ms / C≤400ms；高干扰模式 S≤80ms / A≤200ms / B≤350ms / C≤550ms。负值表示不一致条件下反而更快（高强度训练者可能）
- **适合**：有 Go/No-Go 基础的进阶训练、抗干扰

### 待实现
| 名称 | game 参数 | 说明 |
|------|----------|------|
| N-Back | n-back | 工作记忆训练 |
| 数字广度 | digit-span | 序列记忆训练 |
| 任务切换 | task-switch | 认知灵活性训练 |

## 注意事项

- 用户完成游戏后，数据自动保存到服务端和本地。可通过"查看训练分析"查看历史趋势
- 如果用户多日未训练，欢迎回归即可
