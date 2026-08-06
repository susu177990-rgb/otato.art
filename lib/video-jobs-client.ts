export type VideoGenerationJobStatus = "queued" | "submitted" | "running" | "monitoring_delayed" | "finalizing" | "succeeded" | "failed" | "needs_review";

export type VideoGenerationJob = {
  id: string;
  requestId: string;
  status: VideoGenerationJobStatus;
  providerTaskId?: string | null;
  result?: { videoUrl?: string | null } | null;
  videoUrl?: string | null;
  error?: { message?: string | null } | string | null;
  createdAt: string;
  modelId: string;
  modeId: string;
  durationSeconds?: number | null;
  previewUrl?: string | null;
};

async function readJson<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || `请求失败 (${response.status})`);
  return data;
}

export async function fetchActiveVideoJobs(projectId?: string, signal?: AbortSignal): Promise<VideoGenerationJob[]> {
  const params = new URLSearchParams({ active: "true" });
  if (projectId) params.set("projectId", projectId);
  const data = await readJson<{ jobs?: VideoGenerationJob[] }>(await fetch(`/api/video/jobs?${params}`, { cache: "no-store", signal }));
  return data.jobs ?? [];
}

export async function fetchVideoJob(jobId: string, signal?: AbortSignal): Promise<VideoGenerationJob> {
  const data = await readJson<{ job?: VideoGenerationJob } | VideoGenerationJob>(await fetch(`/api/video/jobs/${encodeURIComponent(jobId)}`, { cache: "no-store", signal }));
  if ("job" in data && data.job) return data.job;
  return data as VideoGenerationJob;
}

export function videoJobResultUrl(job: VideoGenerationJob): string {
  return job.result?.videoUrl?.trim() || job.videoUrl?.trim() || "";
}

export function videoJobStatusLabel(status: VideoGenerationJobStatus): string {
  if (status === "queued") return "排队中";
  if (status === "submitted" || status === "running") return "生成中";
  if (status === "monitoring_delayed") return "状态同步延迟";
  if (status === "finalizing") return "保存中";
  if (status === "needs_review") return "等待人工核查";
  if (status === "succeeded") return "完成";
  return "CRUN 明确失败";
}
