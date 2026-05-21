# skill-episode-1min-beat：1～2 分钟单集节拍

## 触发条件

- 写作或修订**单集**正文（开发版或交付版前的构思阶段优先用本流程）。

## 输入

- 集数、本集在主线中的功能（推进/误会/揭露/情绪补偿等）。
- `agent/script-agent/knowledge/03_SERIES_BIBLE.md` 中与该集相关的里程碑或禁忌。
- （可选）上一集集尾最后一句/最后一镜，用于接戏。

## 步骤

1. **秒级节拍表**（仅内部，不必给用户看长表）
  - 0～8s：开场钩子类型（对照 `agent/script-agent/knowledge/04_HOOK_LEXICON.md`）  
  - 主体：拆 2～3 个「节拍点」，每点 20～40s 量级说明  
  - 最后 8～15s：集尾刃口与卡点类型
2. 映射到 `agent/script-agent/templates/Episode Development Script Template.md`：
  - 填「本集定位」（含 **本集幕数规划**：总幕数须 **≥8**，建议 8～12；场次 1～3 时须分配足够 **每场次幕数**）  
  - 拆 **2～4 场**（1～2 分钟常见区间）；每场下按 **`#### 幕`** 写满，单幕 **≤约 15s** 可拍单元，禁止整场只写一幕
3. 扩写各幕「画面/动作/对白要点」与衔接，边写边对照 `agent/script-agent/knowledge/01_EPISODE_SPECS.md` 体量假设。
4. 若主创索要交付版：改套 `**Episode Final Script Template`**，删除分析字段，保留节奏与集尾张力。

## 引用 knowledge

- `agent/script-agent/knowledge/01_EPISODE_SPECS.md`
- `agent/script-agent/knowledge/02_SHORTFORM_PACING.md`
- `agent/script-agent/knowledge/04_HOOK_LEXICON.md`
- `agent/script-agent/knowledge/05_CLIFFHANGER_RULES.md`
- `agent/script-agent/context_assets/character_reference.md`（具体声线）

## 输出格式

- 默认：开发版**一整集**（单轮仅一集，遵守模板硬规则）。
- 节拍表可放在回复开头简短呈现或内化不输出（由主创偏好决定）。

## 完成标准

- 开场 8 秒内可见张力；集尾具备可接戏的刃口；对白总量落在项目约定区间；**`#### 幕` 合计 ≥8**（可用 `tools/episode-stats.mjs` 自检）。
