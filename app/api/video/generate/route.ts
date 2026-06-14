import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUserWorkspaceSnapshot } from "@/lib/db/user-api-settings-store";
import {
  generateUnifiedVideo,
  VideoGenerationError,
} from "@/lib/video-generation-service";
import type {
  UnifiedVideoGenerateRequest,
  UnifiedVideoReference,
  VideoAspectRatio,
  VideoGenerationModeId,
  VideoModelId,
  VideoResolution,
} from "@/lib/video-workspace";

function mustBeVideoModelId(raw: unknown): VideoModelId {
  const v = String(raw ?? "");
  switch (v) {
    case "seedance-2.0":
    case "seedance-2.0-fast":
    case "seedance-1.5":
    case "kling-3.0":
    case "kling-2.6-motion":
    case "veo-3.1":
    case "veo-3.1-fast":
    case "gemini-omni":
      return v;
    default:
      return "seedance-2.0";
  }
}

function mustBeModeId(raw: unknown): VideoGenerationModeId {
  const v = String(raw ?? "");
  switch (v) {
    case "text_to_video":
    case "start_frame":
    case "start_end_frame":
    case "multi_image_reference":
    case "motion_control":
      return v;
    default:
      return "text_to_video";
  }
}

function mustBeAspectRatio(raw: unknown): VideoAspectRatio | undefined {
  const v = String(raw ?? "");
  switch (v) {
    case "1:1":
    case "4:3":
    case "3:4":
    case "16:9":
    case "9:16":
    case "21:9":
    case "9:21":
      return v;
    default:
      return undefined;
  }
}

function mustBeResolution(raw: unknown): VideoResolution | undefined {
  const v = String(raw ?? "");
  switch (v) {
    case "480p":
    case "720p":
    case "1080p":
    case "4k":
      return v;
    default:
      return undefined;
  }
}

function parseReferences(raw: unknown): UnifiedVideoReference[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const row = item as Record<string, unknown>;
      return {
        role:
          row.role === "start_frame" ||
          row.role === "end_frame" ||
          row.role === "image_reference" ||
          row.role === "video_reference" ||
          row.role === "audio_reference" ||
          row.role === "motion_source_video"
            ? row.role
            : "image_reference",
        url: String(row.url ?? "").trim(),
        label: typeof row.label === "string" ? row.label : undefined,
        mimeType: typeof row.mimeType === "string" ? row.mimeType : undefined,
      } satisfies UnifiedVideoReference;
    })
    .filter((item) => item.url);
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
    modeId?: unknown;
    aspectRatio?: unknown;
    duration?: unknown;
    resolution?: unknown;
    references?: unknown;
    providerOptions?: unknown;
    projectId?: unknown;
  };

  const prompt = String(body.prompt ?? "").trim();
  if (!prompt) return Response.json({ error: "提示词为空" }, { status: 400 });
  const projectId = String(body.projectId ?? "").trim();
  if (!projectId) {
    return Response.json({ error: "缺少 projectId，项目工作台生成必须绑定项目。" }, { status: 400 });
  }
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (projectError) throw projectError;
  if (!project) {
    return Response.json({ error: "项目不存在或无权访问" }, { status: 403 });
  }

  const modelId = mustBeVideoModelId(body.modelId);
  const modeId = mustBeModeId(body.modeId);
  const aspectRatio = mustBeAspectRatio(body.aspectRatio);
  const duration = typeof body.duration === "number" ? body.duration : Number(body.duration);
  const resolution = mustBeResolution(body.resolution);
  const references = parseReferences(body.references);

  const snapshot = await getUserWorkspaceSnapshot(supabase, user.id, { visibility: "server" });
  try {
    const requestPayload: UnifiedVideoGenerateRequest = {
      modelId,
      modeId,
      prompt,
      durationSeconds: Number.isFinite(duration) ? duration : snapshot.videoWorkspace.uiDefaults.defaultDurationSeconds,
      aspectRatio,
      resolution,
      references,
      providerOptions:
        body.providerOptions && typeof body.providerOptions === "object"
          ? (body.providerOptions as Record<string, string | number | boolean | null | undefined>)
          : undefined,
    };
    const result = await generateUnifiedVideo({
      supabase,
      userId: user.id,
      workspaceSnapshot: snapshot,
      request: requestPayload,
    });
    return Response.json(result);
  } catch (error) {
    if (error instanceof VideoGenerationError) {
      const status =
        error.code === "model_not_configured" || error.code === "contract_pending"
          ? 400
          : error.code === "invalid_mode" || error.code === "unsupported_capability"
            ? 422
            : 500;
      const message = error.code === "model_not_configured"
        ? snapshot.apiUsageMode?.video === "user"
          ? "请到设置页填写自己的视频 API Key。"
          : "网站内部视频 API 暂未配置，请联系管理员。"
        : error.message;
      return Response.json({ error: message, code: error.code }, { status });
    }
    const message = error instanceof Error ? error.message : "生视频失败";
    return Response.json({ error: message, code: "provider_submit_failed" }, { status: 500 });
  }
}
