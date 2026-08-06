import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVideoGenerationJob } from "@/lib/video-jobs/repository";
import { toPublicVideoJob } from "@/lib/video-jobs/types";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const job = await getVideoGenerationJob(supabase, id);
  if (!job) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ job: toPublicVideoJob(job) });
}
