![oTATo Art 首页](./docs/readme/home.png)

<p align="center">
  <a href="https://otato.art">
    <img src="./public/oTATo.svg" alt="oTATo Art logo" width="96" height="96">
  </a>
</p>

# oTATo Art

<p align="center">
  开源 AI 内容创作工作台：把对话、图片、视频、剧本、画布、画廊和提示词预设放在同一个创作流程里。
</p>

<p align="center">
  <a href="https://otato.art"><strong>访问网站</strong></a>
  ·
  <a href="https://github.com/susu177990-rgb/otato.art"><strong>GitHub 仓库</strong></a>
  ·
  <a href="./DESIGN.md"><strong>设计规范</strong></a>
</p>

## 这个项目是做什么的

oTATo Art 是给内容创作者用的 AI 工作台。它不是单独的聊天工具、生图工具或素材库，而是把从想法、提示词、剧本、视觉资产到生成记录的流程串在一起。

如果你在做短剧、角色设定、分镜、视觉参考、AI 图片/视频生成，或者想沉淀自己的提示词方法，这个项目就是一个可以自己部署、自己配置、自己继续改的创作系统。

## Features / 核心特点

- **自定义 API**：模型和网关配置可以放在自己的环境里，适合个人或团队内部使用。
- **多工作区创作**：对话、图片、视频、剧本、画布、预设和画廊是同一个产品里的连续入口。
- **提示词预设**：支持提示词预设、搜索、收藏和复用，方便沉淀自己的创作方法。
- **生成结果可回看**：图片、视频、项目记录和画布素材可以继续整理，不是一次性提交后就丢掉。
- **面向长期创作**：适合围绕一个项目持续积累资料、角色、分镜、视觉方向和生成历史。

## 主要功能

| 模块 | 用来做什么 |
| --- | --- |
| 对话 | 用 Agent、Skill 和多会话推进创意、拆解需求、整理方案 |
| 图片 | 通过模式化生图、参考图和历史记录生产视觉素材 |
| 视频 | 生成和管理视频素材，保留动态创作记录 |
| 剧本 | 管理项目、立项信息、人物设定和分集创作 |
| 画布 | 把素材、分镜、灵感和关系放到可视空间里整理 |
| 预设 | 搜索、收藏、复制和维护提示词预设 |
| 画廊 | 集中查看和复用生成结果 |

## 界面预览

![生图工作台](./docs/readme/image-workspace.png)

![无限画布](./docs/readme/canvas.png)

## Installation

```bash
npm install
```

在仓库根目录创建 `.env.local`：

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
APP_ORIGIN=http://localhost:4000
```

## Usage

启动本地开发环境：

```bash
npm run dev
```

打开：

```text
http://localhost:4000
```

常见使用路径：

1. 进入首页，选择对话、图片、视频、剧本、画布或预设。
2. 配置自己的 API、模型和站内设置。
3. 用项目、历史记录、画廊和画布把生成结果继续沉淀下来。

## Development

```bash
npm run lint
npx tsc --noEmit
```

更多项目约定：

- [DESIGN.md](./DESIGN.md)：界面和产品设计规范
- [AGENTS.md](./AGENTS.md)：仓库内 Agent 工作约定

## Contributing

欢迎继续完善创作流程、界面一致性、提示词预设、画布体验和生成记录管理。提交前建议至少运行 lint 和类型检查。

## License

仓库当前未单独声明定制许可证。用于团队内部部署、二次开发或商业场景前，建议先补充明确的许可证与使用策略。
