# 剧本 Script Agent

**BL 短剧 / 系列剧本一体化工作台**：从扒文检索、项目立项、改编策划到编剧室分阶段写作，再到角色与设定向 AI 生图与画廊归档——全部收敛在同一套深色玻璃质感界面里。前端为 **Next.js 16**（App Router）+ **React 19**，对话与工具编排通过 **Route Handlers** 调用你在「设置」里配置的 **OpenAI 兼容 API**。

---

## 这款产品解决什么问题？

| 场景 | 能力 |
|------|------|
| 找素材 | **Wattpad 检索**：搜索条目、预览正文片段、批量导出与大纲翻译等（可选对接自建 `wattpad-api`）。 |
| 开项目 | **项目列表**：创建 / 搜索 / 排序；每张项目卡展示验证进度、集数、圣经是否就绪等状态。 |
| 立项 | **Onboarding**：原创 / 改编模式；基本信息 → 素材 → 策划 → 立项确认（创作思路确认书、系列圣经、英语 Locale 简报等），一条主 CTA 进入编剧室。 |
| 写剧本 | **编剧室（Studio）**：顶栏阶段条（7 阶段 + Gate 计数 + 产物预览）；左侧对话、右侧结构化产物面板；思路书 / 圣经 / 简报抽屉；自动推进流水线开关与 Zip 导出等。 |
| 出图 | **作图工作台**：多模型分段切换、比例与清晰度、参考图槽、提示词 composer、生成与历史条；**画廊**集中浏览成片。 |
| 配置 | **统一设置页**：各模型 Endpoint / Key / 模型名、分模式提示词模版等单一路径维护（不从各页散落入口打断心流）。 |

设计规范与页面 IA 的单一事实来源见仓库根目录 **[DESIGN.md](./DESIGN.md)**（壳层、顶栏、画布双卡布局、阶段条替代侧轨等均已文档化）。

---

## 功能地图（路由）

| 路径 | 说明 |
|------|------|
| `/` | 首页：扒网文 / 创作剧本 / 作图三块入口 + 顶栏「设置」。 |
| `/login` | 简易密码门（自建部署时可启用）。 |
| `/settings` | 全局 API 与提示词配置（唯一常规设置入口）。 |
| `/projects`、`/project/[id]/onboarding` | 项目列表与立项向导。 |
| `/studio/[id]` | 编剧室主工作台。 |
| `/wattpad` | Wattpad 工具页（依赖可选后端）。 |
| `/image`、`/image/gallery` | 生图与画廊。 |

---

## 技术栈

- **运行时**：Node.js **≥ 20**
- **框架**：Next.js **16.2**（`output: "standalone"`，便于容器与 PaaS）
- **UI**：React **19**、CSS Modules（共享外壳 **`app/shared/shell.module.css`**）、Tailwind 仅作 PostCSS 管线的一部分
- **渲染**：以 Client Components 为主的交互页 + **Route Handlers**（`app/api/**`）
- **文案与文档**：Markdown 渲染（`react-markdown` + GFM）
- **文档解析**：PDF / DOCX 解析（立项与素材流程）

---

## 仓库结构

```
├── app/                    # App Router：页面、layout、API Routes
│   ├── api/                # chat、planning-chat、projects、onboarding、image、wattpad…
│   ├── shared/             # 全局 shell / topbar / cards 等 CSS 体系
│   └── …                   # 各业务路由页面
├── components/             # ChatWindow、ArtifactPanel、StageStrip、抽屉与表单部件等
├── lib/                    # 类型、project-store、image-workspace、模型预设与存储封装
├── agent/                  # 剧本 Agent 资源（standalone 构建时会拷贝进 .next/standalone）
├── services/wattpad-api/   # 可选 FastAPI：Wattpad 代理能力
├── scripts/                # 构建辅助、Wattpad 子进程启动脚本
├── data/projects/          # 本地项目 JSON（默认 .gitignore，勿提交隐私）
├── DESIGN.md               # 产品与 UI 设计说明（强烈建议贡献前阅读）
└── README.md               # 本文件
```

---

## 快速开始

```bash
npm install

# 默认：Next（4000）+ Wattpad API 子进程（若脚本可用）
npm run dev

# 仅前端
npm run dev:web
```

浏览器访问 **http://localhost:4000**（端口定义在 `package.json` 的 `dev:web` 脚本中）。

构建与本地生产形态：

```bash
npm run build
npm run start
```

生产环境下 **`npm run start`** 监听 **`PORT`**（未设置时一般为 Next 默认 **3000**），并已绑定 **`0.0.0.0`**。

---

## 配置与环境变量

| 变量 | 用途 |
|------|------|
| （界面「设置」） | 大模型 **Base URL / API Key / 模型 ID** 与各模式提示词；英语简报等能力走此处配置，而非单独搜索 Key。 |
| `SCRIPT_AGENT_DATA_DIR` | 项目 JSON 等持久化目录；**生产环境务必指向挂载卷**，避免实例重建丢数据。 |
| `SCRIPT_AGENT_ROOT` | 解析 `agent/` 等资源时的仓库根路径；单机部署建议显式设置。 |
| `WATTPAD_API_URL` | Wattpad 工具页对接的自建 FastAPI 地址（可选）。 |
| `PORT` | 容器 / 平台注入的监听端口。 |

本地可加 `.env.local`（已被 `.gitignore`），详见 Next.js 环境变量约定。

---

## API Routes 一览

主要服务端入口（均在 `app/api/`）：

- **会话与创作**：`chat`、`planning-chat`、`adaptation-discuss`
- **项目**：`projects`、`projects/[id]`
- **立项 / 改编**：`onboarding/*`、`locale-research`、`parse-pdf`、`parse-docx`
- **编剧辅助**：`episode-stats`
- **生图**：`image/generate`
- **Wattpad**：`wattpad/search`、`export-markdown-one`、`export-batch`、`translate-synopsis`
- **鉴权**：`auth/login`

具体请求体与字段以各 `route.ts` 实现为准。

---

## Wattpad 子服务（可选）

仓库内 **`services/wattpad-api`** 提供可选 FastAPI。根目录脚本 **`npm run dev`** 会通过 `concurrently` 尝试与 Next 一并拉起；仅需前端时使用 **`npm run dev:web`**。

独立运行时示例：

```bash
cd services/wattpad-api
# 创建 venv、安装依赖后
uvicorn main:app --host 0.0.0.0 --port 8765
```

将 **`WATTPAD_API_URL`** 指向该地址即可。

---

## 部署提要

1. **`npm ci`** → **`npm run build`**：`postbuild` 会将 `agent/` 等资源复制到 **`.next/standalone`**，与 `output: "standalone"` 对齐。
2. 进程工作目录建议为仓库根；持久化数据目录由 **`SCRIPT_AGENT_DATA_DIR`** 指定。
3. **Zeabur** 等 PaaS：选用 Node 模版识别 Next.js，构建 `npm run build`、启动 `npm run start`，注入 **`PORT`** 与持久化卷环境变量即可。更细的 Zeabur 说明可参考本 README 历史版本或官方 [Next.js 部署指南](https://zeabur.com/docs/en-US/guides/nodejs/nextjs)。

---

## 开发约定

- Next.js 版本与训练数据中的「经典 Next」存在差异，新增服务端代码前建议浏览当前安装的 **`node_modules/next/dist/docs/`** 并留意废弃 API（见 **`AGENTS.md`**）。
- UI 变更请对照 **`DESIGN.md`**，优先复用 **`shell.module.css`** 中的 primitives，避免另起一套视觉语言。

---

## 许可证与上游

二次开发或企业内部部署请自行补充许可证策略；第三方依赖以各自 **`package.json`** 许可证为准。

**上游仓库**：[github.com/gleam-studios/script--agent](https://github.com/gleam-studios/script--agent)

---

## English summary

**Script Agent** is a dark, glassmorphism-style web workspace for BL short-drama and series script workflows: Wattpad discovery (optional API), project onboarding, a seven-stage writer’s room with chat and structured artifacts, AI image generation with gallery, and unified LLM settings behind an OpenAI-compatible API. Built with **Next.js 16** and **React 19**, shipped as a **standalone** Node bundle for simple Docker / PaaS hosting.
