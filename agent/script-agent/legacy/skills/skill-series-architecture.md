# skill-series-architecture：系列架构与集数伸缩

## 触发条件

- 新项目开局，或总集数尚未锁定在 30～60 某一档。
- 需要把「主线事件」映射到集区间，避免写到中段才发现结构崩盘。

## 输入

- 一句话梗概 / 详细梗概 / 关键事件草案（任一或可组合）。
- 目标受众与类型约束（沿用 `agent/script-agent/prompts/main-agent-role.md` / `skill.md`）。
- （可选）已填的 `agent/script-agent/knowledge/03_SERIES_BIBLE.md` 草稿。

## 步骤

1. 提炼 **主线矛盾 + 终局方向**（不必剧透给观众的说法，但要清晰于编剧室）。
2. 列出 **6～12 个里程碑事件**（硬事件：改变关系、改变信息、改变外部压力）。
3. 为每条里程碑标注 **依赖**（B 必须在 A 之后）。
4. 选定基准总长 **30、45 或 60** 之一，将里程碑落入 `03_SERIES_BIBLE.md` 中的阶段区间表。
5. 若客户要求变更集数：用「合并同功能戏 / 前置或延后揭露 / 升级障碍变体」伸缩，**禁止**仅靠台词注水拉长。

## 引用 knowledge

- `agent/script-agent/knowledge/01_EPISODE_SPECS.md`（单集体量与轮次规则）
- `agent/script-agent/knowledge/03_SERIES_BIBLE.md`（铁律、里程碑表、阶段区间）
- `agent/script-agent/knowledge/02_SHORTFORM_PACING.md`（中弧与小高潮间隔）

## 输出格式

- 更新后的里程碑表（Markdown 表格或列表）。
- 一段 **30 / 45 / 60** 三档对比说明（各档哪些戏合并、哪些揭露提前/延后），仅输出当前项目选定档的「定稿区间」亦可。

## 完成标准

- 每条里程碑有集区间或最迟集数，且无逻辑环依赖。
- 任意连续 10 集内至少有一个 **推进点** 指向某里程碑或阶段目标。