# 剧本 Script Agent

面向短剧 / 系列剧本创作的 Web 工作台：立项、改编讨论、分阶段产出（含与 OpenAI 兼容 API 的对话与工具链）。  
应用基于 **Next.js**，适合本地开发与服务器部署。

## 仓库结构

| 目录 | 说明 |
|------|------|
| `app/`、`components/`、`lib/` | Next.js 前端、API Routes 与应用逻辑（开发与部署入口在仓库根目录） |
| `agent/` | 提示词、模板等 Agent 资源 |
| `knowledge/`、`skills/` | 知识库与技能说明（供服务端拼装上下文） |
| `data/projects/` | 项目 JSON（默认不提交，见 `.gitignore`） |
| `services/wattpad-api/` | 可选 Wattpad 相关 FastAPI 服务（与根目录的 `npm run dev` 一同拉起） |

## 本地开发（需 Node.js）

建议使用 **Node 20+**。

```bash
npm install
npm run dev
```

浏览器访问 **http://localhost:4000**（端口在根目录 `package.json` 的 `dev` 脚本中配置）。  
若仅需前端、不启 Wattpad 子进程，可使用 `npm run dev:web`。

## 服务器部署（概要）

1. 在服务器上克隆仓库，进入仓库根目录，`npm ci`，`npm run build`（构建结束会自动把 `agent/`、`knowledge/`、`skills/` 拷入 `.next/standalone/`，供 `output: "standalone"` 运行时读取）。
2. 生产环境运行：`npm run start`（**监听 `PORT` 环境变量**，未设置时为 Next 默认端口 **3000**；已绑定 **`0.0.0.0`** 便于容器/平台转发）。
3. 资源路径：开发时服务端以仓库根解析 `agent/` 等；单机直连仓库时也设置 **`SCRIPT_AGENT_ROOT`** 指向仓库根更稳妥。项目 JSON 目录取决于进程工作目录，生产建议设置 **`SCRIPT_AGENT_DATA_DIR`** 指向持久化目录或数据卷。
4. Wattpad 能力：在 **`services/wattpad-api`** 下用 `uvicorn` 自行托管，并将 **`WATTPAD_API_URL`** 指向该服务。

### Zeabur

1. **服务类型**：从 Git 部署 **Node.js** 服务即可（zbpack 会识别 Next.js）。
2. **Root Directory** 使用仓库根目录（本仓库应用入口已经在根目录）。
3. **构建 / 启动**：一般无需改命令；使用仓库默认的 `npm run build`、`npm run start` 即可。平台注入的 **`PORT`** 会被 `next start` 使用。
4. **Watch Paths**（可选）：Root 已是仓库根时一般无需额外配置；如果平台设置了自定义 watch 规则，确保覆盖 **`app`**、**`components`**、**`lib`**、**`agent`**、**`knowledge`**、**`skills`**。
5. **环境变量**：按需配置 **`SCRIPT_AGENT_DATA_DIR`**（绑定 Zeabur 持久化存储，避免项目数据随实例重建丢失）、**`WATTPAD_API_URL`**（若你在同项目另起 Python 服务跑 `services/wattpad-api`）。大模型相关密钥仍在应用内「设置」填写即可，除非你在后续改造为服务端环境变量。
6. **Wattpad API**：需要时在 Zeabur 再创建一个 **Python** 服务，Root 指向 **`services/wattpad-api`**，启动命令形如 `uvicorn main:app --host 0.0.0.0 --port 8765`，然后把内部服务地址写进 **`WATTPAD_API_URL`**。

官方说明：[Deploy Next.js（Zeabur）](https://zeabur.com/docs/en-US/guides/nodejs/nextjs)、[自定义 Root Directory](https://zeabur.com/docs/en-US/deploy/config/root-directory)。

## 许可证与仓库

若需二次开发或企业内部部署，请根据你们策略自行补充许可证条款；上游依赖以各 `package.json` 为准。

仓库：**https://github.com/gleam-studios/script--agent**
