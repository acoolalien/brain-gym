# 脑力训练数据字段参考与分析模板

游戏记录存储在 `<plugin-data>/brain-gym/scores.jsonl`，每行 JSON。
每个记录包含 `{ game, score, savedAt }`，其中 `game` 为复合键名（如 `gonogo_standard_30`），`score` 为游戏得分对象。

---

## 字段参考

### 通用字段（所有游戏）

| 字段 | 类型 | 说明 |
|------|------|------|
| round | number | 全局游戏轮次序号（从 1 起），用于跨游戏排序 |
| date | ISO8601 | 游戏完成时间 |
| size | number | 试次/格子规模（gonogo/stroop：试次数，schulte：网格边长） |
| difficulty | string | 难度标识（gonogo: standard/reversal, stroop: standard/enhanced, schulte: easy/normal/hard 等） |
| modeKey | string | 完整键名，如 `gonogo_standard_30`，用于 localStorage 分组 |

### 舒尔特表格（schulte）

| 字段 | 单位 | 说明 | 方向 |
|------|------|------|------|
| time | 秒 | 从点击第一个数字到完成全部数字的用时 | 越低越好 |
| accuracy | 比率 0-1 | 正确点击数 / 总点击数 | 越高越好，接近 1 为正常 |
| errors | 次数 | 点错数字的次数 | 越低越好 |

**解读要点：**
- 核心指标是 `time`，反映视觉搜索速度和注意力广度
- 5×5 常模：S≤20s，A≤28s，B≤38s，C≤55s
- `errors` 若显著 >0 说明冲动或注意力飘移

### Go/No-Go（gonogo）

| 字段 | 单位 | 说明 | 方向 |
|------|------|------|------|
| dprime | d'值 | 信号检测论敏感度，综合命中率与误报率 | **越高越好** |
| hitRate | 比率 0-1 | Go 试次中正确按键的比例 | 越高越好 |
| falseAlarmRate | 比率 0-1 | No-Go 试次中错误按键的比例 | 越低越好 |
| missRate | 比率 0-1 | Go 试次中漏按的比例 | 越低越好 |
| goRT | 毫秒 | Go 试次的平均反应时 | 越低越好（与 d' 结合看） |
| accuracy | 比率 0-1 | 总正确率 | 越高越好 |
| commissionErrors | 次数 | 误报次数（冲动） | 越低越好 |
| omissionErrors | 次数 | 漏报次数 | 越低越好 |
| totalTrials | 次数 | 总试次数 | 数据规模参考 |
| goTrials | 次数 | Go 试次数（通常占 75%） | 数据规模参考 |
| noGoTrials | 次数 | No-Go 试次数（通常占 25%） | 数据规模参考 |

**解读要点：**
- 核心指标是 `dprime`，综合了命中率和误报率
- `dprime` 低不一定是抑制能力差——可能是太谨慎（命中率低）或太冲动（误报率高）
- 标准模式常模：S≥3.0，A≥2.5，B≥2.0
- 反转模式常模：S≥2.7，A≥2.2，B≥1.7（反转增加认知负荷）
- `goRT` 和 `falseAlarmRate` 应一起看：若 goRT 很快但误报率高，说明是速度优先策略；若 goRT 慢且误报率低，说明是准确优先策略
- 最优状态是 d' 高且 goRT 快——又快又准

### Stroop 色词（stroop）

| 字段 | 单位 | 说明 | 方向 |
|------|------|------|------|
| stroopEffect | 毫秒 | 不一致试次 RT − 一致试次 RT，反映干扰抑制成本 | **越低越好** |
| congruentRT | 毫秒 | 一致试次（词义与颜色匹配）的平均反应时 | 越低越好 |
| incongruentRT | 毫秒 | 不一致试次（词义与颜色冲突）的平均反应时 | 越低越好 |
| congruentAcc | 比率 0-1 | 一致试次的正确率 | 越高越好 |
| incongruentAcc | 比率 0-1 | 不一致试次的正确率 | 越高越好 |
| dprime | d'值 | 信号检测论敏感度 | 越高越好 |
| accuracy | 比率 0-1 | 总正确率 | 越高越好 |
| time | 秒 | stroopEffect 的绝对值取秒 | 越低越好 |
| totalTrials | 次数 | 总试次数 | 数据规模参考 |
| correct | 次数 | 正确次数 | 越高越好 |
| errors | 次数 | 错误次数 | 越低越好 |

**解读要点：**
- 核心指标是 `stroopEffect`（效应量），精确反映干扰抑制效率
- 标准模式常模：S≤50ms，A≤150ms，B≤250ms，C≤400ms
- 高干扰模式（enhanced, 25:75 不一致比例）常模：S≤80ms，A≤200ms，B≤350ms，C≤550ms
- `stroopEffect` = 0 或负值表示不一致条件下没有减慢（高强度训练者或非凡自我调节者）
- 若 `incongruentAcc` 显著低于 `congruentAcc`，说明冲突导致错误（而不仅仅是速度变慢）
- RT 效应量比正确率效应量更敏感——正确率容易天花板效应

---

## 分析模板

各 agent 分析训练数据时统一按此结构输出：

### 1. 数据概况

```
总记录数：N 局
游戏分布：
- 舒尔特表格：X 局
- Go/No-Go：X 局
- Stroop 色词：X 局
训练跨度：YYYY-MM-DD 至 YYYY-MM-DD
```

### 2. 各游戏核心指标

**舒尔特表格**
- 平均用时：X.Xs
- 最快 / 最慢：X.Xs / X.Xs
- 趋势（近 3~5 局）：进步 / 退步 / 持平

**Go/No-Go**
- 平均 d'：X.XX
- 最佳 d'：X.XX
- 平均 goRT：Xms
- 平均误报率：X%
- 模式分布：标准 X 局 / 反转 X 局

**Stroop 色词**
- 平均效应量：Xms
- 最佳效应量：Xms
- 模式分布：标准 X 局 / 高干扰 X 局

### 3. 速度-正确率权衡分析

如果数据量 ≥ 5 局，分析：
- Go/No-Go：d' 与 goRT 的相关性（快慢一致时说明稳定）
- Stroop：效应量是否随训练次数下降（学习效应）

### 4. 跨游戏相关性

如果数据量 ≥ 10 局且三个游戏都有记录，分析：
- 各游戏核心指标之间是否有趋势关联
- 注意：这三个任务测量不同的认知维度，高相关不是必然

### 5. 综合判断与建议

根据当前水平给出：
- 当前处于哪个等级区间
- 哪个方面相对薄弱（抑制 vs 速度 vs 注意力广度）
- 建议优先训练的游戏和模式
