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

type SqlRunner = {
  query: (sql: string) => Promise<unknown[]>;
  close?: () => Promise<void>;
};

type MigrationFile = {
  file: string;
  version: string;
  name: string;
};

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

function parseMigrationFile(file: string): MigrationFile {
  const match = file.match(/^(\d{14})_(.+)\.sql$/);
  if (!match) throw new Error(`迁移文件名不符合 Supabase 格式：${file}`);
  return { file, version: match[1], name: match[2] };
}

function listMigrationFiles(): MigrationFile[] {
  const only = process.env.SUPABASE_MIGRATION_FILE?.trim();
  if (only) {
    if (!only.endsWith(".sql")) throw new Error("SUPABASE_MIGRATION_FILE 必须是 .sql 文件");
    const filePath = path.join(migrationsDir(), only);
    if (!fs.existsSync(filePath)) throw new Error(`找不到迁移文件：${only}`);
    return [parseMigrationFile(only)];
  }
  return fs
    .readdirSync(migrationsDir())
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map(parseMigrationFile);
}

async function queryViaManagementApi(accessToken: string, sql: string): Promise<unknown[]> {
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
  return (await res.json()) as unknown[];
}

function pgRunner(connectionString: string): SqlRunner {
  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  let connected = false;
  return {
    async query(sql: string) {
      if (!connected) {
        await client.connect();
        connected = true;
      }
      const result = await client.query(sql);
      return result.rows;
    },
    async close() {
      if (connected) await client.end();
    },
  };
}

function buildPoolerUrl(password: string): string {
  const enc = encodeURIComponent(password);
  const ref = projectRef();
  const tempPoolerUrl = path.join(process.cwd(), "supabase", ".temp", "pooler-url");
  if (fs.existsSync(tempPoolerUrl)) {
    const raw = fs.readFileSync(tempPoolerUrl, "utf8").trim();
    if (raw) {
      const url = new URL(raw);
      url.username = `postgres.${ref}`;
      url.password = enc;
      return url.toString();
    }
  }
  return `postgresql://postgres.${ref}:${enc}@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres`;
}

function buildDirectUrl(password: string): string {
  const enc = encodeURIComponent(password);
  return `postgresql://postgres:${enc}@db.${projectRef()}.supabase.co:5432/postgres`;
}

function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

async function listAppliedVersions(runner: SqlRunner): Promise<Set<string>> {
  await runner.query("create schema if not exists supabase_migrations");
  await runner.query(`
    create table if not exists supabase_migrations.schema_migrations (
      version text primary key,
      statements text[],
      name text
    )
  `);
  const rows = await runner.query("select version from supabase_migrations.schema_migrations");
  return new Set(rows.map((row) => String((row as { version?: unknown }).version ?? "")));
}

async function execMigration(runner: SqlRunner, migration: MigrationFile): Promise<void> {
  const sql = fs.readFileSync(path.join(migrationsDir(), migration.file), "utf8");
  const recordSql = `
    insert into supabase_migrations.schema_migrations (version, name, statements)
    values (${sqlLiteral(migration.version)}, ${sqlLiteral(migration.name)}, array[${sqlLiteral(migration.name)}])
    on conflict (version) do update
      set name = excluded.name,
          statements = excluded.statements
  `;
  console.log(`→ ${migration.file}`);
  await runner.query(sql);
  await runner.query(recordSql);
  console.log(`  ✓ ${migration.file}`);
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

  let runner!: SqlRunner;

  if (accessToken) {
    console.log(`使用 SUPABASE_ACCESS_TOKEN（Management API），项目 ${projectRef()}`);
    runner = { query: (sql) => queryViaManagementApi(accessToken, sql) };
  } else if (databaseUrl) {
    console.log("使用 DATABASE_URL");
    runner = pgRunner(databaseUrl);
  } else if (dbPassword) {
    const urls = [buildPoolerUrl(dbPassword), buildDirectUrl(dbPassword)];
    let connected = false;
    for (const url of urls) {
      try {
        const candidate = pgRunner(url);
        await candidate.query("select 1");
        console.log(`使用 SUPABASE_DB_PASSWORD 连接数据库，项目 ${projectRef()}`);
        runner = candidate;
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

  try {
    const applied = await listAppliedVersions(runner);
    const pending = files.filter((file) => !applied.has(file.version));
    if (pending.length === 0) {
      console.log("远程库没有待应用迁移。");
      return;
    }

    console.log(`待应用迁移：${pending.map((migration) => migration.file).join(", ")}`);
    for (const migration of pending) {
      await execMigration(runner, migration);
    }
  } finally {
    await runner.close?.();
  }

  console.log("\n待应用迁移已全部应用。");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
