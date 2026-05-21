# Skills 索引

本目录为**项目内工作流手册**（非 Cursor 插件 skill）。每篇结构统一：**触发条件 → 输入 → 步骤 → 引用 knowledge → 输出格式 → 完成标准**。


| 文件                                                           | 用途                          |
| ------------------------------------------------------------ | --------------------------- |
| [skill-series-architecture.md](skill-series-architecture.md) | 未定总集数时定主线阶段与里程碑，30/45/60 伸缩 |
| [skill-episode-1min-beat.md](skill-episode-1min-beat.md)     | 1～2 分钟单集：秒级节拍 → 场次 → 扩写     |
| [skill-batch-outline.md](skill-batch-outline.md)             | 单次 5～10 集粗纲与钩子链             |
| [skill-rewrite-for-punch.md](skill-rewrite-for-punch.md)     | 压缩废话、强化钩子/集尾，不改主线事实         |
| [skill-continuity-pass.md](skill-continuity-pass.md)         | 每 N 集连续性检查                  |
| [skill-english-dialogue-localization.md](skill-english-dialogue-localization.md) | **STAGE 7**：英语对白本地化；侧栏 Locale 简报 + 禁止 Chinglish；与 `english-lines-agent-role` 配合 |


相关工具：`tools/episode-stats.mjs`（CJK 体量、粗估时长、**`#### 幕` 计数**与 `--strict --min-acts 8`）、`tools/hook-tail-list.mjs`（集尾类型、尾段预览、**每集幕数列**）。

---

## Short-drama 按需引用（`agent/script-agent/skills/short-drama/references/`）

**性质**：通用微短剧方法论片段，**不**替代 STAGE / 模板 / `agent/script-agent/knowledge/`；**不**引入第二套状态机或独立落盘树。

**纪律**：

- 进入某 **STAGE** 主产出时，从 `agent/script-agent/skills/short-drama/references/` **最多读取 2 个**文件，且**仅限**下表对应行；禁止整目录加载。
- **默认不得**读取 `genre-guide.md`、`compliance-checklist.md`（特批见下）。
- `lib/prompt-loader.ts` 的 `readSkills()` **仅拼接** `agent/script-agent/skills/*.md`，**不递归**子目录；故 `short-drama/references/*.md` **不会**自动注入系统提示，须由主控在本轮按需读取。
- 与项目内 skill 分工：**集数/架构**以 `skill-series-architecture.md` 为准；**单集秒级节拍与幕**以 `skill-episode-1min-beat.md` + `agent/script-agent/knowledge/01_EPISODE_SPECS.md` 为准；**5～10 集粗纲**以 `skill-batch-outline.md` 为准；**punch 改写**以 `skill-rewrite-for-punch.md` 为准；**每 N 集连续性**以 `skill-continuity-pass.md` 为准。short-drama 只补商业节奏、钩子类型、反派分层等，**不**替代上述工作流。
- `opening-rules.md` 若与 `agent/script-agent/prompts/main_prompt.md` STAGE 7「不写镜头/景别/机位」冲突，以 **main_prompt + 分集模板** 为准，仅采纳其抓人节奏与信息推进逻辑。

### 特批（不占上表「每 STAGE 2 篇」额度）

| 文件 | 条件 |
|------|------|
| `genre-guide.md` | 仅当主创明确要求「非 BL 泛短剧 / 类型杂糅参考」时，**单次会话最多读此 1 篇**。 |
| `compliance-checklist.md` | 仅当主创明确要求「国内平台 / 大陆审核口径」时单次读取；**不**替代 `agent/script-agent/knowledge/07_PLATFORM_SAFE.md`。 |

### STAGE → 至多 2 个 reference（顺序建议）

路径均相对仓库根：`agent/script-agent/skills/short-drama/references/{文件名}`。

| STAGE | 允许读取的 2 个 reference |
| ----- | ------------------------- |
| **1 剧情梗概** | `satisfaction-matrix.md` → `paywall-design.md` |
| **2 核心人物小传** | `villain-design.md` → `satisfaction-matrix.md` |
| **3 三幕式结构** | `rhythm-curve.md` → `paywall-design.md` |
| **4 核心事件** | `satisfaction-matrix.md` → `hook-design.md` |
| **5 设定集** | **不引用**（∆/@ 资产阶段无对应方法论，避免噪声） |
| **6 分集大纲** | `paywall-design.md` → `hook-design.md` |
| **7 分集剧本** | 见下表「STAGE 7 分支」 |

### STAGE 7 分支（仍最多 2 篇）

| 条件 | 两篇 reference |
|------|----------------|
| **第 1 集** | `opening-rules.md` + `hook-design.md` |
| **第 2 集及以后（默认）** | `hook-design.md` + `rhythm-curve.md`（取「单集微结构」服务前几幕抓力、中段、集尾卡点） |
| **强付费 / 强悬念集**（STAGE 6 已标注，或主创当轮明确） | `hook-design.md` + `paywall-design.md`（用其置换默认的 `rhythm-curve`，仍 2 篇上限） |