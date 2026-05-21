# skill-continuity-pass：连续性检查

## 触发条件

- 每写完 **N 集**（建议 **10**），或主线设定/演员本有重大调整。

## 输入

- 最近 **N 集** 正文或开发版（建议含「本集剧情摘要」字段若存在）。
- `agent/script-agent/knowledge/03_SERIES_BIBLE.md` 中的铁律与里程碑摘要。
- `agent/script-agent/context_assets/character_reference.md` 中的称谓与禁忌摘要。

## 步骤

1. **设定**：逐条核对铁律是否被违反；若有例外，是否本集已解释为「角色误判」而非吃书。
2. **称谓与口癖**：是否与 `character_reference` 一致；刻意改口是否标为戏。
3. **时间线**：日夜、地点跳转是否连续；服装/伤口等视觉连续项（若剧本有写）是否矛盾。
4. **伏笔**：早前埋设的线索是否被遗忘；若未回收，是否仍在本批内有安排。
5. **钩子链**：用 `tools/hook-tail-list.mjs` 或人工表检查集尾类型是否过度重复。

## 引用 knowledge

- `agent/script-agent/knowledge/03_SERIES_BIBLE.md`
- `agent/script-agent/knowledge/04_HOOK_LEXICON.md`
- `agent/script-agent/knowledge/05_CLIFFHANGER_RULES.md`

## 输出格式

- **问题列表**：位置（集/场）| 类型 | 建议修法  
- **通过声明**：仅当零严重问题时给出一句话通过。

## 完成标准

- 严重吃书与时序错误为零；中等问题有明确修改建议或主创豁免说明。