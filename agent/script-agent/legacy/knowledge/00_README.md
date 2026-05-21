# knowledge 目录说明

本目录存放**短剧规格与连载规则**类常驻知识，供系统提示拼接（`01`～`07`）或人工查阅（本文件）。

## 与仓库其他目录的关系


| 位置                                            | 用途                                                    |
| --------------------------------------------- | ----------------------------------------------------- |
| `agent/script-agent/templates/*.md`                        | 分阶段输出结构（梗概、人物、结构、分集开发版/交付版等）                          |
| `agent/script-agent/context_assets/character_reference.md` | **具体角色**声线、口癖、称谓等执行细则                                 |
| `agent/script-agent/knowledge/06_CAST_VOICE.md`                  | 仅短剧「辨识度、口癖、称谓」**原则**；具体人设以 `context_assets` 为准，避免双源冲突 |
| `agent/script-agent/skills/*.md`                                 | 可重复工作流（何时用、步骤、引用哪些 knowledge）                         |
| `agent/script-agent/skills/short-drama/references/*.md`          | 通用短剧方法论片段；**按需**读取，见 `agent/script-agent/skills/00_INDEX.md`；**不参与** `prompt-loader` 对 `agent/script-agent/skills/*.md` 的非递归拼接 |
| `tools/*.mjs`                                 | 体量统计、集尾/卡点列表等辅助脚本                                     |


## 模型注入说明

- `00_README.md` **默认不注入**系统提示（仅供人类与仓库维护）。
- `01_EPISODE_SPECS.md`～`07_PLATFORM_SAFE.md` 按文件名排序注入；修改后需**重启** Next 开发服务（或重新部署）以刷新 `loadSystemPrompt()` 缓存。
- `agent/script-agent/skills/*.md` 由同一套 [`lib/prompt-loader.ts`](../../../lib/prompt-loader.ts) **在 knowledge 之后、templates 之前**注入；与 `agent/script-agent/prompts/main_prompt.md` §1 **[H]**、`agent/script-agent/prompts/flowchart.md`「仓库根目录资源」一致。

## Token 控制

若系统提示过长，可收缩各文件中的「可扩展段落」，或后续改为仅注入 `01`+`02`+`03`（需在 `lib/prompt-loader.ts` 中调整过滤规则）。
