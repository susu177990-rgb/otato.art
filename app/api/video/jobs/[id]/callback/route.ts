import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { wakeVideoJob } from "@/lib/video-jobs/repository";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const url = new URL(req.url);
  const token = url.searchParams.get("token") || req.headers.get("x-video-job-token") || "";
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const woken = await wakeVideoJob(createSupabaseAdminClient(), id, token);
  if (!woken) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ accepted: true });
}
