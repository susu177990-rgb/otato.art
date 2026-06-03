import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkspaceSnapshot } from "@/lib/db/workspace-settings-store";
import type { VideoAspectRatio, VideoDurationSeconds, VideoModelId } from "@/lib/video-workspace";
import { persistGeneratedVideoToStorage } from "@/lib/db/persist-generated-video";

type SeedanceGenerateResponse = {
  code?: number;
  message?: string;
  data?: { task_id?: string; status?: string; consumed_credits?: number };
};

type SeedanceStatusResponse = {
  code?: number;
  message?: string;
  data?: {
    task_id?: string;
    status?: string;
    response?: string[];
    error_message?: string | null;
  };
};

function mustBeVideoModelId(raw: unknown): VideoModelId {
  const v = String(raw ?? "");
  if (v === "seedance-2.0" || v === "seedance-2.0-fast") return v;
  return "seedance-2.0";
}

function mustBeAspectRatio(raw: unknown): VideoAspectRatio {
  const v = String(raw ?? "");
  if (v === "16:9" || v === "9:16" || v === "4:3" || v === "3:4") return v;
  return "16:9";
}

function mustBeDuration(raw: unknown): VideoDurationSeconds {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (n === 5 || n === 10 || n === 15) return n;
  return 10;
}

async function pollSeedanceVideoUrl(params: {
  baseUrl: string;
  apiKey: string;
  taskId: string;
  timeoutMs?: number;
  intervalMs?: number;
}): Promise<string> {
  const timeoutMs = params.timeoutMs ?? 6 * 60_000;
  const intervalMs = params.intervalMs ?? 1800;
  const started = Date.now();

  for (;;) {
    if (Date.now() - started > timeoutMs) throw new Error("任务超时，请稍后重试");
    const url = new URL(params.baseUrl.replace(/\/+$/, "") + "/status");
    url.searchParams.set("task_id", params.taskId);
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { Authorization: `Bearer ${params.apiKey}` },
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as SeedanceStatusResponse;
    if (!res.ok) {
      const err = (data && typeof data === "object" && "error" in data ? (data as { error?: unknown }).error : undefined);
      throw new Error(typeof err === "string" && err.trim() ? err : "查询任务失败");
    }
    const status = String(data.data?.status ?? "");
    if (status === "SUCCESS") {
      const videoUrl = data.data?.response?.[0]?.trim() ?? "";
      if (!videoUrl) throw new Error("任务完成但未返回视频地址");
      return videoUrl;
    }
    if (status === "FAILED") {
      throw new Error(String(data.data?.error_message ?? "任务失败"));
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "请先登录后再生视频" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    prompt?: unknown;
    modelId?: unknown;
    aspectRatio?: unknown;
    duration?: unknown;
  };

  const prompt = String(body.prompt ?? "").trim();
  if (!prompt) return Response.json({ error: "提示词为空" }, { status: 400 });

  const modelId = mustBeVideoModelId(body.modelId);
  const aspectRatio = mustBeAspectRatio(body.aspectRatio);
  const duration = mustBeDuration(body.duration);

  const snapshot = await getWorkspaceSnapshot(supabase);
  const model = snapshot.videoWorkspace.models[modelId];
  const baseUrl = model.baseUrl.trim();
  const apiKey = model.apiKey.trim();
  const modelName = String(model.modelName ?? "").trim();

  if (!baseUrl || !apiKey || !modelName) {
    return Response.json({ error: "当前生视频模型未配置（Base URL / API Key / 模型名）" }, { status: 400 });
  }

  try {
    const generateUrl = baseUrl.replace(/\/+$/, "") + "/generate";
    const res = await fetch(generateUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        aspect_ratio: aspectRatio,
        duration,
        model: modelName,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as SeedanceGenerateResponse;
    if (!res.ok) {
      const err = (data && typeof data === "object" && "error" in data ? (data as { error?: unknown }).error : undefined);
      const msg = typeof err === "string" && err.trim() ? err : data.message;
      throw new Error(String(msg || "提交任务失败"));
    }
    const taskId = String(data.data?.task_id ?? "").trim();
    if (!taskId) throw new Error("接口未返回 task_id");

    const remoteVideoUrl = await pollSeedanceVideoUrl({ baseUrl, apiKey, taskId });
    const videoUrl = await persistGeneratedVideoToStorage(supabase, user.id, remoteVideoUrl, randomUUID());
    return Response.json({ videoUrl, taskId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "生视频失败";
    return Response.json({ error: message }, { status: 500 });
  }
}

