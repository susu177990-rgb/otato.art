import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { runMediaCleanup } from "@/lib/media-cleanup";

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const header = req.headers.get("x-cron-secret") || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret || header !== secret) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json(await runMediaCleanup(createSupabaseAdminClient()));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "媒体清理失败" }, { status: 500 });
  }
}
