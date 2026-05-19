/**
 * 一次性：将本地 data/projects/*.json 与 workspace-settings.json 导入 Supabase。
 *
 * 用法（需 .env.local 含 SUPABASE_*）：
 *   npx tsx scripts/migrate-local-data-to-supabase.ts --owner-email=you@example.com
 *
 * 目标邮箱须已在 Supabase Auth 注册。
 */
import fs from "fs";
import path from "path";
import { config } from "dotenv";
import { createSupabaseAdminClient } from "../lib/supabase/admin";
import { saveProjectForUser } from "../lib/db/project-store";
import { upsertSiteWorkspaceSnapshot } from "../lib/db/workspace-settings-store";
import { resolveDataProjectsDir } from "../lib/agent-paths";
import { readWorkspaceSettingsFromDisk } from "../lib/workspace-settings-server";
import type { Project } from "../lib/types";

config({ path: path.join(process.cwd(), ".env.local") });

function parseArgs(): { ownerEmail: string } {
  const arg = process.argv.find((a) => a.startsWith("--owner-email="));
  const ownerEmail = arg?.split("=")[1]?.trim();
  if (!ownerEmail) {
    console.error("缺少 --owner-email=your@email.com");
    process.exit(1);
  }
  return { ownerEmail };
}

async function findUserIdByEmail(email: string): Promise<string> {
  const admin = createSupabaseAdminClient();
  let page = 1;
  const perPage = 200;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit.id;
    if (data.users.length < perPage) break;
    page += 1;
  }
  throw new Error(`未找到用户 ${email}，请先在 /login 注册`);
}

async function main() {
  const { ownerEmail } = parseArgs();
  const userId = await findUserIdByEmail(ownerEmail);
  const admin = createSupabaseAdminClient();

  const projectsDir = resolveDataProjectsDir();
  const files = fs.existsSync(projectsDir)
    ? fs.readdirSync(projectsDir).filter((f) => f.endsWith(".json"))
    : [];

  console.log(`导入项目 → ${ownerEmail} (${userId})，共 ${files.length} 个文件`);

  for (const f of files) {
    const raw = fs.readFileSync(path.join(projectsDir, f), "utf8");
    const project = JSON.parse(raw) as Project;
    await saveProjectForUser(admin, userId, project);
    console.log("  ✓", project.id, project.name);
  }

  const ws = readWorkspaceSettingsFromDisk();
  if (ws?.llm || ws?.imageWorkspace) {
    await upsertSiteWorkspaceSnapshot(admin, {
      llm: ws.llm as Record<string, unknown>,
      imageWorkspace: ws.imageWorkspace,
    });
    console.log("  ✓ workspace-settings.json → site_settings(global)");
  }

  console.log("完成。");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
