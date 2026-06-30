import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getWorkspaceSnapshot } from "@/lib/db/workspace-settings-store";
import {
  generateUnifiedVideo,
  VideoGenerationError,
} from "@/lib/video-generation-service";
import {
  captureCreditReservation,
  ensureCreditAccount,
  releaseCreditReservation,
  reserveCreditsForQuote,
} from "@/lib/credits/accounts";
import { CreditPricingError, quoteVideoCredits } from "@/lib/credits/pricing";
import { CreditRiskError, assertCreditGenerationAllowed } from "@/lib/credits/risk";
import type { CreditReservation } from "@/lib/credits/types";
import {
  getVideoParameterCapabilities,
  isDisabledVideoModel,
  isVideoDurationSupported,
  normalizeVideoDuration,
} from "@/lib/video-workspace";
import { classifyGenerationError } from "@/lib/generation-error-classifier";
import type {
  UnifiedVideoGenerateRequest,
  UnifiedVideoReference,
  VideoAspectRatio,
  VideoGenerationModeId,
  VideoModelId,
  VideoResolution,
} from "@/lib/video-workspace";

function generationErrorJson(params: {
  message: string;
  code: string;
  status: number;
  fallbackReasonCode?: Parameters<typeof classifyGenerationError>[0]["fallbackReasonCode"];
  userMessage?: string;
}) {
  const classified = classifyGenerationError({
    message: params.message,
    status: params.status,
    fallbackReasonCode: params.fallbackReasonCode,
  });
  return {
    error: params.message,
    code: params.code,
    reasonCode: classified.reasonCode,
    userMessage: params.userMessage ?? classified.userMessage,
  };
}

function mustBeVideoModelId(raw: unknown): VideoModelId {
  const v = String(raw ?? "");
  switch (v) {
    case "seedance-2.0":
    case "seedance-2.0-fast":
    case "seedance-2.0-mini":
    case "seedance-1.5-pro":
    case "doubao-seedance-1.0-pro-fast":
    case "seedance-1.0-pro":
    case "kling-3.0":
    case "kling-3.0-motion":
    case "kling-2.6-motion":
    case "happyhorse-1.1":
    case "happyhorse-1.0":
    case "grok-imagine":
    case "veo-3.1":
    case "veo-3.1-fast":
    case "veo-3.1-lite":
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
    case "video_edit":
    case "motion_control":
      return v;
    default:
      return "text_to_video";
  }
}

function mustBeAspectRatio(raw: unknown): VideoAspectRatio | undefined {
  const v = String(raw ?? "");
  switch (v) {
    case "auto":
    case "1:1":
    case "4:3":
    case "3:4":
    case "16:9":
    case "9:16":
    case "21:9":
    case "9:21":
    case "3:2":
    case "2:3":
    case "4:5":
    case "5:4":
    case "adaptive":
    case "keep_ratio":
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
        durationSeconds: Number.isFinite(Number(row.durationSeconds)) && Number(row.durationSeconds) > 0
          ? Number(row.durationSeconds)
          : undefined,
      } satisfies UnifiedVideoReference;
    })
    .filter((item) => item.url);
}

function billableSecondsForVideo(params: {
  modeId: VideoGenerationModeId;
  durationSeconds: number;
  references: UnifiedVideoReference[];
}): number {
  if (params.modeId === "video_edit") {
    return params.references.find((ref) => ref.role === "video_reference" && Number.isFinite(ref.durationSeconds) && ref.durationSeconds! > 0)?.durationSeconds ?? 0;
  }
  if (params.modeId === "motion_control") {
    return params.references.find((ref) => ref.role === "motion_source_video" && Number.isFinite(ref.durationSeconds) && ref.durationSeconds! > 0)?.durationSeconds ?? 0;
  }
  return params.durationSeconds;
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json(generationErrorJson({ message: "请先登录后再生视频", code: "auth_required", status: 401 }), { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    prompt?: unknown;
    modelId?: unknown;
    modeId?: unknown;
    aspectRatio?: unknown;
    duration?: unknown;
    resolution?: unknown;
    soundEnabled?: unknown;
    grokImagineMode?: unknown;
    references?: unknown;
    providerOptions?: unknown;
    projectId?: unknown;
    requestId?: unknown;
  };

  const prompt = String(body.prompt ?? "").trim();
  if (!prompt) {
    return Response.json(generationErrorJson({ message: "提示词为空", code: "prompt_empty", status: 400 }), { status: 400 });
  }
  const projectId = String(body.projectId ?? "").trim();
  if (!projectId) {
    return Response.json(
      generationErrorJson({ message: "缺少 projectId，项目工作台生成必须绑定项目。", code: "project_id_missing", status: 400 }),
      { status: 400 },
    );
  }
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (projectError) throw projectError;
  if (!project) {
    return Response.json(generationErrorJson({ message: "项目不存在或无权访问", code: "project_forbidden", status: 403 }), { status: 403 });
  }

  const modelId = mustBeVideoModelId(body.modelId);
  if (isDisabledVideoModel(modelId)) {
    return Response.json(
      generationErrorJson({ message: "当前视频模型已停用。", code: "model_disabled", status: 422 }),
      { status: 422 },
    );
  }
  const modeId = mustBeModeId(body.modeId);
  const aspectRatio = mustBeAspectRatio(body.aspectRatio);
  const duration = typeof body.duration === "number" ? body.duration : Number(body.duration);
  const durationProvided = body.duration !== undefined && body.duration !== null && String(body.duration).trim() !== "";
  const resolution = mustBeResolution(body.resolution);
  const grokImagineMode = body.grokImagineMode === "fun" || body.grokImagineMode === "spicy" || body.grokImagineMode === "normal"
    ? body.grokImagineMode
    : undefined;
  const references = parseReferences(body.references);

  const snapshot = await getWorkspaceSnapshot(supabase);
  const parameterCapabilities = getVideoParameterCapabilities(modelId, modeId, references);
  const durationCapability = parameterCapabilities.durationCapability;
  if (durationProvided && parameterCapabilities.supportsDuration && durationCapability && !isVideoDurationSupported(duration, durationCapability)) {
    return Response.json(
      generationErrorJson({ message: `当前模型不支持 ${duration}s 时长`, code: "unsupported_duration", status: 422 }),
      { status: 422 },
    );
  }
  const durationSeconds = parameterCapabilities.supportsDuration && durationCapability
    ? durationProvided
      ? duration
      : normalizeVideoDuration(snapshot.videoWorkspace.uiDefaults.defaultDurationSeconds, durationCapability)
    : 0;
  const billableDurationSeconds = billableSecondsForVideo({ modeId, durationSeconds, references });
  const billingResolution = resolution ?? parameterCapabilities.resolutions[0];
  if (!billingResolution) {
    return Response.json(
      generationErrorJson({ message: "当前视频模型没有可用分辨率配置。", code: "resolution_missing", status: 422, fallbackReasonCode: "INVALID_PROMPT" }),
      { status: 422 },
    );
  }
  const requestId = typeof body.requestId === "string" && body.requestId.trim() ? body.requestId.trim() : randomUUID();
  let reservation: CreditReservation | null = null;
  try {
    await assertCreditGenerationAllowed(user.id);
    const quote = await quoteVideoCredits(createSupabaseAdminClient(), {
      feature: "video",
      modelId,
      modeId,
      resolution: billingResolution,
      durationSeconds: billableDurationSeconds,
    });
    reservation = await reserveCreditsForQuote({
      userId: user.id,
      projectId,
      requestId,
      quote,
      metadata: {
        promptLength: prompt.length,
        referenceCount: references.length,
        requestedDurationSeconds: durationSeconds,
        billableDurationSeconds,
        aspectRatio,
        soundEnabled: typeof body.soundEnabled === "boolean" ? body.soundEnabled : undefined,
      },
    });
    const requestPayload: UnifiedVideoGenerateRequest = {
      modelId,
      modeId,
      prompt,
      durationSeconds,
      aspectRatio,
      resolution: quote.resolution,
      soundEnabled: typeof body.soundEnabled === "boolean" ? body.soundEnabled : undefined,
      grokImagineMode,
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
    const captured = await captureCreditReservation({
      reservationId: reservation.id,
      resultRef: result.videoUrl,
      metadata: { providerTaskId: result.providerTaskId },
    });
    const account = await ensureCreditAccount(user.id);
    return Response.json({
      ...result,
      reservationId: captured.id,
      creditsCharged: captured.capturedCredits ?? quote.credits,
      balanceAfter: account.availableCredits,
    });
  } catch (error) {
    if (reservation?.id) {
      await releaseCreditReservation({
        reservationId: reservation.id,
        reason: error instanceof Error ? error.message : "video_generation_failed",
        metadata: { modelId, modeId },
      }).catch((releaseError) => {
        console.error("[api/video/generate] release reservation failed", {
          reservationId: reservation?.id,
          releaseError,
        });
      });
    }
    if (error instanceof CreditPricingError) {
      return Response.json(
        generationErrorJson({
          message: error.message,
          code: error.code,
          status: error.status,
          fallbackReasonCode: "ACCOUNT_LIMIT",
          userMessage: error.message,
        }),
        { status: error.status },
      );
    }
    if (error instanceof CreditRiskError) {
      return Response.json(
        generationErrorJson({
          message: error.message,
          code: error.code,
          status: error.status,
          fallbackReasonCode: "QUOTA_OR_BILLING",
        }),
        { status: error.status },
      );
    }
    if (error instanceof Error && /insufficient credits/i.test(error.message)) {
      return Response.json(
        generationErrorJson({
          message: "积分余额不足，请先充值。",
          code: "insufficient_credits",
          status: 402,
          fallbackReasonCode: "QUOTA_OR_BILLING",
        }),
        { status: 402 },
      );
    }
    if (error instanceof VideoGenerationError) {
      const status =
        error.code === "model_not_configured" || error.code === "contract_pending"
          ? 400
          : error.code === "invalid_mode" || error.code === "unsupported_capability"
            ? 422
            : 500;
      const message = error.code === "model_not_configured"
        ? "网站内部视频 API 暂未配置，请联系管理员。"
        : error.message;
      const classified = classifyGenerationError({
        message,
        status: error.upstreamStatus ?? status,
        upstreamBody: error.upstreamBody,
        stage: error.code,
        fallbackReasonCode:
          error.code === "provider_timeout"
            ? "TIMEOUT"
            : error.code === "storage_persist_failed"
              ? "STORAGE_FAILED"
              : error.code === "invalid_mode" || error.code === "unsupported_capability"
                ? "INVALID_PROMPT"
                : undefined,
      });
      return Response.json({ error: message, code: error.code, ...classified }, { status });
    }
    const message = error instanceof Error ? error.message : "生视频失败";
    const classified = classifyGenerationError({ message, status: 500 });
    return Response.json({ error: message, code: "provider_submit_failed", ...classified }, { status: 500 });
  }
}
