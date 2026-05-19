<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## 环境变量（编剧室）

本地开发：在仓库根目录下使用 `.env.local`（Next.js 默认加载）。  
英语 Locale 简报等能力使用你在界面「设置」里填写的大模型 API Key，不依赖单独的搜索类环境变量。

## 项目级设置（随仓库同步）

- **真相来源**：仓库根目录 `workspace-settings.json`（LLM 网关 + 生图工作台）。
- **本地**：运行 `next dev` 时，在 `/settings` 点「保存」会 **写回该 JSON**，随后请 `git commit` / `push`。
- **线上**：构建会带上已提交的 JSON；常见托管环境无写盘权限时无法在界面写文件，需在本机更新 JSON 后提交再部署。
- 可选环境变量：`ALLOW_WORKSPACE_SETTINGS_WRITE=1` 在非 development 时允许服务端写入（仅限可信环境）。
