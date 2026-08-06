import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listVideoGenerationJobs } from "@/lib/video-jobs/repository";
import { toPublicVideoJob } from "@/lib/video-jobs/types";

export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const jobs = await listVideoGenerationJobs(supabase, {
    projectId: url.searchParams.get("projectId") || undefined,
    active: url.searchParams.get("active") === "true",
    limit: Number(url.searchParams.get("limit") || 50),
  });
  return Response.json({ jobs: jobs.map(toPublicVideoJob) });
}
