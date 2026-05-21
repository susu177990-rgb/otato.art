<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## 环境变量

本地：仓库根目录 `.env.local`（Next.js 默认加载）。部署（Zeabur）：在控制台配置同名变量。

### Supabase（必填）

| 变量 | 说明 |
|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | 项目 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon / publishable key（可暴露给浏览器） |
| `SUPABASE_SERVICE_ROLE_KEY` | 仅服务端；迁移脚本用，**勿提交 Git** |

### 其它

- `WATTPAD_API_URL` — Wattpad 子服务地址（可选，默认本机 8765）

## 数据与认证

- **登录**：Supabase Auth 邮箱 + 密码（`/login` 可注册）。
- **持久化**：PostgreSQL（`site_settings`、`projects`、`image_gallery_records`）；项目和图库按 `auth.users` 隔离，RLS 启用。
- **生图文件**：像素在 Supabase Storage 桶 `generated-images`（公开读）；`image_gallery_records.data.imageUrl` 与对话 `media_url` 存稳定 URL。需执行迁移 `20260521100000_generated_images_storage.sql`（或 `scripts/apply-generated-images-storage-manual.sql`）。
- **设置页**：LLM / 生图 API Key、提示词与 Skill 写入 Supabase 的全站配置，所有登录账号共用并可修改（需登录）。

### Supabase Dashboard

1. Authentication → Providers → Email 开启
2. URL Configuration：Site URL = Zeabur 域名；Redirect URLs 含 `https://<域名>/auth/callback` 与 `http://localhost:4000/auth/callback`

### 数据库迁移

```bash
supabase login
supabase link --project-ref bfvilvoiangeilxuxpdh
supabase db push
```

对话（`/chat`）与全站 Skill 依赖 `chat_conversations`、`site_skill_packs` 等表。若未 push 迁移，会出现「无法加载会话列表」。无 CLI 时可在 Supabase SQL Editor 执行 [`scripts/apply-chat-migrations-manual.sql`](scripts/apply-chat-migrations-manual.sql)。

### 导入本地旧数据

注册账号后：

```bash
npx tsx scripts/migrate-local-data-to-supabase.ts --owner-email=你的邮箱
```

浏览器内旧 `localStorage` 会在首次登录后自动尝试一次性导入（见 `WorkspaceLocalMigration`）。
