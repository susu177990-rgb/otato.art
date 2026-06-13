/**
 * 将 supabase/migrations 应用到远程库（无需全局安装 supabase CLI）。
 *
 * 任选一种凭据（写入 .env.local 或命令行 export）：
 *   SUPABASE_ACCESS_TOKEN  — Supabase 账号 Access Token（Dashboard → Account → Access Tokens）
 *   SUPABASE_DB_PASSWORD   — 项目 Database password（Dashboard → Project Settings → Database）
 *   DATABASE_URL           — 完整 Postgres 连接串
 *
 * 用法：
 *   npm run db:push
 *   SUPABASE_DB_PASSWORD='你的密码' npm run db:push
 */
import fs from "fs";
import path from "path";
import { config } from "dotenv";
import pg from "pg";

config({ path: path.join(process.cwd(), ".env.local") });

function projectRef(): string {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (rawUrl) {
    try {
      const host = new URL(rawUrl).hostname;
      const ref = host.endsWith(".supabase.co") ? host.split(".")[0] : "";
      if (ref) return ref;
    } catch {
      /* fall back below */
    }
  }
  return "bfvilvoiangeilxuxpdh";
}

function migrationsDir(): string {
  return path.join(process.cwd(), "supabase", "migrations");
}

function listMigrationFiles(): string[] {
  const only = process.env.SUPABASE_MIGRATION_FILE?.trim();
  if (only) {
    if (!only.endsWith(".sql")) throw new Error("SUPABASE_MIGRATION_FILE 必须是 .sql 文件");
    const filePath = path.join(migrationsDir(), only);
    if (!fs.existsSync(filePath)) throw new Error(`找不到迁移文件：${only}`);
    return [only];
  }
  return fs
    .readdirSync(migrationsDir())
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

async function runViaManagementApi(accessToken: string, sql: string): Promise<void> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef()}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Management API ${res.status}: ${text}`);
  }
}

async function runViaPg(connectionString: string, sql: string): Promise<void> {
  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

function buildPoolerUrl(password: string): string {
  const enc = encodeURIComponent(password);
  const ref = projectRef();
  return `postgresql://postgres.${ref}:${enc}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`;
}

function buildDirectUrl(password: string): string {
  const enc = encodeURIComponent(password);
  return `postgresql://postgres:${enc}@db.${projectRef()}.supabase.co:5432/postgres`;
}

async function execSql(run: (sql: string) => Promise<void>, file: string): Promise<void> {
  const sql = fs.readFileSync(path.join(migrationsDir(), file), "utf8");
  console.log(`→ ${file}`);
  await run(sql);
  console.log(`  ✓ ${file}`);
}

async function main() {
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  const dbPassword = process.env.SUPABASE_DB_PASSWORD?.trim();
  const databaseUrl = process.env.DATABASE_URL?.trim();

  const files = listMigrationFiles();
  if (files.length === 0) {
    console.error("未找到 supabase/migrations/*.sql");
    process.exit(1);
  }

  let run!: (sql: string) => Promise<void>;

  if (accessToken) {
    console.log(`使用 SUPABASE_ACCESS_TOKEN（Management API），项目 ${projectRef()}`);
    run = (sql) => runViaManagementApi(accessToken, sql);
  } else if (databaseUrl) {
    console.log("使用 DATABASE_URL");
    run = (sql) => runViaPg(databaseUrl, sql);
  } else if (dbPassword) {
    const urls = [buildPoolerUrl(dbPassword), buildDirectUrl(dbPassword)];
    let connected = false;
    for (const url of urls) {
      try {
        const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
        await client.connect();
        await client.end();
        console.log(`使用 SUPABASE_DB_PASSWORD 连接数据库，项目 ${projectRef()}`);
        run = (sql) => runViaPg(url, sql);
        connected = true;
        break;
      } catch {
        /* try next host */
      }
    }
    if (!connected) {
      throw new Error("无法用 SUPABASE_DB_PASSWORD 连接数据库，请检查密码或改用 DATABASE_URL");
    }
  } else {
    console.error(`
缺少数据库凭据，无法自动迁移。请任选其一：

1) 在 .env.local 增加（推荐）：
   SUPABASE_ACCESS_TOKEN=从 https://supabase.com/dashboard/account/tokens 创建

2) 或增加数据库密码：
   SUPABASE_DB_PASSWORD=从 Project Settings → Database 复制

3) 然后执行：npm run db:push

也可安装 CLI 后：npx supabase login && npx supabase link --project-ref ${projectRef()} && npx supabase db push
`);
    process.exit(1);
  }

  for (const file of files) {
    await execSql(run, file);
  }

  console.log("\n全部迁移已应用。");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
