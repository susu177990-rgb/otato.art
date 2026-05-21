# 剧本 Agent 创作方向迁移蓝图

本文记录 `agent/script-agent/` 从单一 BL legacy prompt 迁移到 `core + shared + directions` 生产系统的最终边界与维护规则。

## 0. 当前结论

- 新项目默认 `general-screenplay`，不带 BL、短剧、海外女性向、英语对白等强默认。
- 旧项目缺失或非法 `creativeDirectionId` 时继续回退 `bl-short-drama`，保护原业务能力。
- 默认生产 prompt 已切到 modular assembly。
- BL 生产 prompt 已能独立走 `core stable -> shared/short-drama -> shared/locale/english -> directions/bl-short-drama -> direction templates`。
- 原 legacy 资源已归档到 `legacy/`，不参与默认生产扫描。
- legacy BL 基线仍可显式回放，hash 固定为 `a5768b615ed993685c5351fa3f22af0a1aff17d98815a93fe677c290be135dca`，长度 `88902`。
- 如需紧急回退 BL，可设置 `SCRIPT_AGENT_FORCE_LEGACY_BL=1`。

## 1. 分类体系

| 分类 | 含义 | 当前归属 |
| --- | --- | --- |
| `CORE` | 通用编剧底座：阶段推进、产物格式、确认纪律、项目上下文、改编骨架、连续性检查 | `core/` |
| `SHORT_DRAMA_SHARED` | 可被多个短剧方向复用的节奏、钩子、付费点、集尾接戏 | `shared/short-drama/` |
| `ENGLISH_LOCALE` | 英语对白、Locale 简报、Chinglish 排雷 | `shared/locale/english/` |
| `ADAPTATION_SHARED` | 改编分析、删留策略、媒介适配、规划工作流 | `shared/adaptation/` |
| `BL_DIRECTION` | 女频 BL 专属：海外女性向、双男主关系、BL 对白、人设默认 | `directions/bl-short-drama/` |
| `GENERAL_DIRECTION` | 通用编剧方向：不预设类型、市场、语言、体量 | `directions/general-screenplay/` |
| `LEGACY_ARCHIVE` | 历史生产 BL prompt，用于回放、hash 对照和紧急 fallback | `legacy/` |

## 2. 当前目录职责

| 路径 | 职责 | 生产加载 |
| --- | --- | --- |
| `core/` | 通用编剧规则 | 默认 modular 加载 |
| `shared/short-drama/` | 短剧共享方法论 | BL 默认加载；通用短剧 fixture 按需加载 |
| `shared/locale/english/` | 英语本地化共享规则 | BL 默认加载；英语本地化 fixture 按需加载 |
| `shared/adaptation/` | 改编共享流程 | 改编链路和改编 fixture 按需加载 |
| `directions/general-screenplay/` | 通用编剧方向 | 新项目默认加载 |
| `directions/bl-short-drama/` | 女频 BL 短剧方向 | 旧项目兼容和用户选择 BL 时加载 |
| `fixtures/` | 离线 prompt 样本 | smoke only |
| `legacy/` | 已归档 legacy prompt/knowledge/templates/skills/context_assets | 仅 explicit legacy / fallback |

## 3. 加载顺序

### 3.1 默认通用方向

`loadSystemPrompt("general-screenplay")`

1. `core/core-manifest.json` 中声明的 core stable modules
2. `directions/general-screenplay/direction.json.promptFiles`
3. `directions/general-screenplay/direction.json.templateFiles`

### 3.2 默认 BL 方向

`loadSystemPrompt("bl-short-drama")`

1. `core/core-manifest.json` 中声明的 core stable modules
2. `directions/bl-short-drama/direction.json.sharedPromptFiles`
3. `directions/bl-short-drama/direction.json.promptFiles`
4. `directions/bl-short-drama/direction.json.templateFiles`

### 3.3 legacy 回放

`loadSystemPrompt("bl-short-drama", { assemblyMode: "legacy" })`

1. archived legacy ordered prompts
2. BL legacy direction profile
3. archived legacy knowledge
4. archived legacy skills
5. archived legacy templates

此路径只用于回归对照、紧急 fallback 和 migration preview，不允许承载新行为。

## 4. 高风险 legacy 映射

| 历史规则区域 | 新归属 | 当前状态 |
| --- | --- | --- |
| `main_prompt` 总控、阶段纪律、Markdown 输出 | `core/prompts/stage-protocol.md`、`core/prompts/deliverable-markdown.md` | modular 已加载；legacy 保留回放 |
| `main-agent-role.md` BL 身份 | `directions/bl-short-drama/prompts/role.md` | BL modular 已加载 |
| `rule.md` 市场、短剧、资产规则 | `shared/short-drama/`、`directions/bl-short-drama/`、`core/` | 已拆分到对应区域 |
| `flowchart.md` STAGE 1-7 | `core/prompts/stage-protocol.md` | modular 已加载 |
| `lines-agent-role.md` BL 对白医生 | `directions/bl-short-drama/prompts/dialogue.md` | BL modular 已加载 |
| `english-lines-agent-role.md` 英语本地化 | `shared/locale/english/`、`directions/bl-short-drama/prompts/english-locale.md` | BL modular 已加载 |
| legacy templates | direction templates + future stage fixtures | 已归档，不参与默认生产 |
| legacy knowledge / skills references | shared modules + archive reference | 已归档，不参与默认生产 |
| `context_assets/character_reference.md` | `core/prompts/project-context.md` + future neutral schema | 已归档，不参与默认生产 |

## 5. 验证命令

每次触碰 prompt loader、direction config、core/shared/direction prompt 时至少运行：

- `npm run smoke:legacy-baseline`
- `npm run smoke:prompt-modular`
- `npm run smoke:bl-modular-parity`
- `npm run smoke:prompt-fixtures`
- `npm run smoke:legacy-archive`
- `npm run report:script-agent-migration`
- `npm run report:script-agent-rule-diff`

完整工程验收还要运行：

- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`
- `npm run smoke:prompt-parity`
- `npm run smoke:direction-shadow`

## 6. 后续维护规则

1. 不为新行为编辑 `legacy/`。
2. 通用编剧规则进 `core/`。
3. 可复用但非默认的形态、语言、流程规则进 `shared/`。
4. 市场、受众、关系、类型、语言、平台形态承诺进具体 `directions/*`。
5. 新方向必须有 direction config、prompt marker、fixture 或 smoke 覆盖。
6. 任何影响 prompt hash 的变更必须更新 readiness / fixture / diff 报告。
