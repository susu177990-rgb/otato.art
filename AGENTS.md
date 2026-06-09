<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## 环境变量

本地：仓库根目录 `.env.local`（Next.js 默认加载）。

### Supabase（必填）

| 变量 | 说明 |
|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | 项目 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon / publishable key（可暴露给浏览器） |
| `SUPABASE_SERVICE_ROLE_KEY` | 仅服务端；迁移脚本用，**勿提交 Git** |
| `APP_ORIGIN` | 生产部署域名；用于 Supabase 注册邮件回调 |
