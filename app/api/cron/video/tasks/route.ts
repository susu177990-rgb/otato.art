import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { runVideoJobWorker } from "@/lib/video-jobs/worker";

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return (req.headers.get("x-cron-secret") || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")) === secret;
}

export async function POST(req: Request) {
  if (!authorized(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json(await runVideoJobWorker(createSupabaseAdminClient()));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "视频任务维护失败" }, { status: 500 });
  }
}
