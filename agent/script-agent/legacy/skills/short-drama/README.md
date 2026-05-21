# short-drama references（仓库内副本）

本目录下的 `references/*.md` 为通用微短剧创作方法论，供主控在对应 **STAGE** 下**按需**阅读。

- **调度表（唯一真源）**：`agent/script-agent/skills/00_INDEX.md` 中的「Short-drama 按需引用」一节（每 STAGE 至多 2 个文件、STAGE 7 分支、genre/compliance 特批）。
- **不自动注入**：`lib/prompt-loader.ts` 仅拼接 `agent/script-agent/skills/` 根目录的 `*.md`；本子目录内容不会进入默认 system prompt。

与上游同步时，可将外部包中 `references/` 下同名文件覆盖本目录对应文件。
