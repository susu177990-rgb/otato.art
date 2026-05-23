/**
 * 仅应用模式封面 Storage 策略迁移（单文件，可重复执行）。
 *
 * 凭据（.env.local 任选其一）：
 *   SUPABASE_ACCESS_TOKEN
 *   SUPABASE_DB_PASSWORD
 *   DATABASE_URL
 *
 * 用法：npx tsx scripts/push-mode-cover-migration.ts
 */
import fs from "fs";
import path from "path";
import { config } from "dotenv";
import pg from "pg";

config({ path: path.join(process.cwd(), ".env.local") });

const PROJECT_REF = "bfvilvoiangeilxuxpdh";
const MIGRATION_FILE = "20260523110000_mode_cover_storage_policies.sql";

async function runViaManagementApi(accessToken: string, sql: string): Promise<void> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
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
  return `postgresql://postgres.${PROJECT_REF}:${enc}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`;
}

function buildDirectUrl(password: string): string {
  const enc = encodeURIComponent(password);
  return `postgresql://postgres:${enc}@db.${PROJECT_REF}.supabase.co:5432/postgres`;
}

async function main() {
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  const dbPassword = process.env.SUPABASE_DB_PASSWORD?.trim();
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const sqlPath = path.join(process.cwd(), "supabase", "migrations", MIGRATION_FILE);

  if (!fs.existsSync(sqlPath)) {
    throw new Error(`未找到迁移文件 ${MIGRATION_FILE}`);
  }
  const sql = fs.readFileSync(sqlPath, "utf8");

  if (accessToken) {
    console.log("使用 SUPABASE_ACCESS_TOKEN");
    await runViaManagementApi(accessToken, sql);
  } else if (databaseUrl) {
    console.log("使用 DATABASE_URL");
    await runViaPg(databaseUrl, sql);
  } else if (dbPassword) {
    const urls = [buildPoolerUrl(dbPassword), buildDirectUrl(dbPassword)];
    let lastErr: unknown;
    for (const url of urls) {
      try {
        console.log("使用 SUPABASE_DB_PASSWORD");
        await runViaPg(url, sql);
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
      }
    }
    if (lastErr) throw lastErr;
  } else {
    throw new Error(
      "缺少凭据。请在 .env.local 配置 SUPABASE_ACCESS_TOKEN 或 SUPABASE_DB_PASSWORD，然后重试。",
    );
  }

  console.log(`✓ 已应用 ${MIGRATION_FILE}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
