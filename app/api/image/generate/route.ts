import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import {
  ImageGenerationError,
  generateImage,
  parseGenerateRequest,
  type ImageGenerationErrorDetails,
} from "@/lib/image-generate";
import { getWorkspaceSnapshot } from "@/lib/db/workspace-settings-store";
import {
  GPT_IMAGE_2_PREMIUM_ASPECT_RATIO_ORDER,
  GPT_IMAGE_2_PREMIUM_MAX_REFERENCE_IMAGES,
  IMAGE_MODEL_ORDER,
  imagePromptMaxLengthForContext,
  type GptImageBackground,
  type GptImageQuality,
  type ImageModelId,
  type ImageSizeTier,
} from "@/lib/image-workspace";
import {
  persistGeneratedImageToStorage,
  persistGeneratedImageWithThumbnailToStorage,
} from "@/lib/db/persist-generated-image";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { classifyGenerationError, type GenerationReasonCode } from "@/lib/generation-error-classifier";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { captureCreditReservation, ensureCreditAccount, releaseCreditReservation, reserveCreditsForQuote } from "@/lib/credits/accounts";
import { CreditPricingError, quoteImageCredits } from "@/lib/credits/pricing";
import { CreditRiskError, assertCreditGenerationAllowed } from "@/lib/credits/risk";
import type { CreditReservation } from "@/lib/credits/types";

type ImageGenerateFailureResponse = {
  error: string;
  code: string;
  reasonCode: GenerationReasonCode;
  userMessage: string;
  traceId: string;
  details: ImageGenerationErrorDetails & {
    modelId?: string;
  };
};

function imageFailureCode(error: unknown, fallbackStage?: ImageGenerationErrorDetails["stage"]): string {
  const stage = error instanceof ImageGenerationError ? error.details.stage : fallbackStage;
  return stage ? `IMAGE_${stage.toUpperCase()}` : "IMAGE_UNKNOWN";
}

function generationErrorJson(params: {
  message: string;
  code: string;
  status: number;
  traceId: string;
  details?: Record<string, unknown>;
  fallbackReasonCode?: GenerationReasonCode;
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
    traceId: params.traceId,
    details: params.details,
  };
}

function toFailureResponse(
  traceId: string,
  error: unknown,
  context: {
    modelId?: string;
    fallbackStage?: ImageGenerationErrorDetails["stage"];
  },
): ImageGenerateFailureResponse {
  const message = error instanceof Error && error.message.trim() ? error.message.trim() : "生图失败";
  const baseDetails =
    error instanceof ImageGenerationError
      ? error.details
      : { stage: context.fallbackStage ?? "unknown" };
  const classified = classifyGenerationError({
    message,
    status: baseDetails.status,
    stage: baseDetails.stage,
    upstreamBody: baseDetails.upstreamBody,
  });
  return {
    error: message,
    code: imageFailureCode(error, context.fallbackStage),
    reasonCode: classified.reasonCode,
    userMessage: classified.userMessage,
    traceId,
    details: {
      ...baseDetails,
      modelId: context.modelId,
    },
  };
}

function endpointForDiagnostics(url: string | undefined): string | undefined {
  const raw = url?.trim();
  if (!raw) return undefined;
  try {
    const parsed = new URL(raw);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return raw.replace(/[?#].*$/, "");
  }
}

function isCrunImageModel(model: { endpointUrl?: string; modelName?: string }): boolean {
  const endpoint = model.endpointUrl?.trim() ?? "";
  const modelName = model.modelName?.trim() ?? "";
  return /crun\.ai/i.test(endpoint) ||
    /\/api\/v1\/client\/job\/createtask(?:[?#]|$)/i.test(endpoint) ||
    /^(google\/nano-banana-|openai\/gpt-image-2|grok-imagine\/(?:i2i|t2i)|z-image)/i.test(modelName);
}

function isImageSizeTier(value: unknown): value is ImageSizeTier {
  return value === "1K" || value === "2K" || value === "4K";
}

async function resolveCrunReferenceImages(params: {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  userId: string;
  traceId: string;
  refImages: string[];
  model: { endpointUrl?: string; modelName?: string };
}): Promise<string[]> {
  if (!isCrunImageModel(params.model)) return params.refImages;
  const out: string[] = [];
  for (const [index, raw] of params.refImages.entries()) {
    const ref = raw.trim();
    if (!ref) continue;
    if (/^https?:\/\//i.test(ref)) {
      out.push(ref);
      continue;
    }
    if (ref.startsWith("data:")) {
      const stored = await persistGeneratedImageToStorage(
        params.supabase,
        params.userId,
        ref,
        `${params.traceId}-reference-${index + 1}`,
      );
      out.push(stored);
      continue;
    }
    throw new ImageGenerationError(
      "CRUN 参考图必须是可直连的 http(s) URL；本地图片需要先上传到云存储后再提交。",
      {
        stage: "request_parse",
        routeKind: "crun-task",
        endpoint: endpointForDiagnostics(params.model.endpointUrl),
      },
    );
  }
  return out;
}

export async function POST(req: NextRequest) {
  const traceId = randomUUID();
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json(
      generationErrorJson({
        message: "请先登录后再生图",
        code: "AUTH_REQUIRED",
        status: 401,
        traceId,
      }),
      { status: 401 },
    );
  }

  const incoming = await parseGenerateRequest(req);
  if (!incoming.ok) return incoming.response;
  const body = incoming.body;
  const projectId = body.projectId?.trim();
  if (!projectId) {
    return Response.json(
      generationErrorJson({
        message: "缺少 projectId，项目工作台生成必须绑定项目。",
        code: "PROJECT_ID_MISSING",
        status: 400,
        traceId,
      }),
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
    return Response.json(
      generationErrorJson({
        message: "项目不存在或无权访问",
        code: "PROJECT_FORBIDDEN",
        status: 403,
        traceId,
      }),
      { status: 403 },
    );
  }

  const modelId = body.modelId || body.model?.id;
  if (typeof modelId !== "string" || !IMAGE_MODEL_ORDER.includes(modelId as ImageModelId)) {
    return Response.json(
      generationErrorJson({
        message: "model.id 无效，请刷新作图页后重试。",
        code: "MODEL_CONFIG_INCOMPLETE",
        status: 400,
        traceId,
        details: {
          stage: "model_config",
          modelId: typeof modelId === "string" ? modelId : undefined,
        },
        fallbackReasonCode: "INVALID_PROMPT",
      }),
      { status: 400 },
    );
  }
  const imageModelId = modelId as ImageModelId;
  const prompt = String(body.prompt ?? "");
  if (prompt.trim().length < 1) {
    return Response.json(
      generationErrorJson({
        message: "提示词不能为空。",
        code: "INVALID_PROMPT",
        status: 400,
        traceId,
        details: {
          stage: "request_parse",
          modelId: imageModelId,
          promptLength: 0,
        },
        fallbackReasonCode: "INVALID_PROMPT",
        userMessage: "提示词不能为空。",
      }),
      { status: 400 },
    );
  }
  const promptMaxLength = imagePromptMaxLengthForContext(imageModelId, body.refImages?.length ?? 0);
  if (typeof promptMaxLength === "number" && prompt.length > promptMaxLength) {
    return Response.json(
      generationErrorJson({
        message: `提示词超过 ${promptMaxLength} 字符上限，请缩短后再生成。`,
        code: "INVALID_PROMPT",
        status: 400,
        traceId,
        details: {
          stage: "request_parse",
          modelId: imageModelId,
          promptLength: prompt.length,
          promptMaxLength,
        },
        fallbackReasonCode: "INVALID_PROMPT",
        userMessage: `提示词超过 ${promptMaxLength} 字符上限，请缩短后再生成。`,
      }),
      { status: 400 },
    );
  }
  const snapshot = await getWorkspaceSnapshot(supabase);
  const model = snapshot.imageWorkspace.models[imageModelId];
  if (!model?.endpointUrl.trim() || !model.apiKey.trim() || !model.modelName.trim()) {
    return Response.json(
      generationErrorJson({
        message: `网站内部图片 API 暂未配置完整（${model?.label || modelId}），请联系管理员。`,
        code: "MODEL_CONFIG_INCOMPLETE",
        status: 400,
        traceId,
        details: {
          stage: "model_config",
          modelId: imageModelId,
          endpoint: endpointForDiagnostics(model?.endpointUrl),
        },
        fallbackReasonCode: "AUTH_OR_KEY",
      }),
      { status: 400 },
    );
  }

  const rawQ = body.gptImageQuality;
  const gptImageQuality: GptImageQuality =
    rawQ === "low" || rawQ === "medium" || rawQ === "high" ? rawQ : "low";
  const imageSize = body.imageSize ?? "1K";
  if (!isImageSizeTier(imageSize)) {
    return Response.json(
      generationErrorJson({
        message: "GPT Image 2 Premium 只支持 1K、2K、4K 分辨率。",
        code: "INVALID_PROMPT",
        status: 400,
        traceId,
        details: {
          stage: "request_parse",
          modelId: imageModelId,
          imageSize: String(body.imageSize ?? ""),
        },
        fallbackReasonCode: "INVALID_PROMPT",
        userMessage: "GPT Image 2 Premium 只支持 1K、2K、4K 分辨率。",
      }),
      { status: 400 },
    );
  }
  if (imageModelId === "gpt-image-2") {
    const refImageCount = body.refImages?.length ?? 0;
    const aspectRatio = body.aspectRatio ?? "4:3";
    if (refImageCount > GPT_IMAGE_2_PREMIUM_MAX_REFERENCE_IMAGES) {
      return Response.json(
        generationErrorJson({
          message: `GPT Image 2 Premium 最多支持 ${GPT_IMAGE_2_PREMIUM_MAX_REFERENCE_IMAGES} 张参考图。`,
          code: "INVALID_PROMPT",
          status: 400,
          traceId,
          details: {
            stage: "request_parse",
            modelId: imageModelId,
            refImageCount,
            maxReferenceImages: GPT_IMAGE_2_PREMIUM_MAX_REFERENCE_IMAGES,
          },
          fallbackReasonCode: "INVALID_PROMPT",
          userMessage: `GPT Image 2 Premium 最多支持 ${GPT_IMAGE_2_PREMIUM_MAX_REFERENCE_IMAGES} 张参考图。`,
        }),
        { status: 400 },
      );
    }
    if (!GPT_IMAGE_2_PREMIUM_ASPECT_RATIO_ORDER.includes(aspectRatio)) {
      return Response.json(
        generationErrorJson({
          message: `GPT Image 2 Premium 不支持 ${aspectRatio} 比例。`,
          code: "INVALID_PROMPT",
          status: 400,
          traceId,
          details: {
            stage: "request_parse",
            modelId: imageModelId,
            aspectRatio,
            supportedAspectRatios: GPT_IMAGE_2_PREMIUM_ASPECT_RATIO_ORDER,
          },
          fallbackReasonCode: "INVALID_PROMPT",
          userMessage: `GPT Image 2 Premium 不支持 ${aspectRatio} 比例。`,
        }),
        { status: 400 },
      );
    }
  }
  const rawBackground = body.gptImageBackground;
  const gptImageBackground: GptImageBackground | undefined =
    rawBackground === "auto" || rawBackground === "transparent" || rawBackground === "opaque" ? rawBackground : undefined;

  const requestId = body.requestId?.trim() || traceId;
  let reservation: CreditReservation | null = null;
  try {
    await assertCreditGenerationAllowed(user.id);
    const quote = await quoteImageCredits(createSupabaseAdminClient(), {
      feature: "image",
      modelId: imageModelId,
      imageSize,
      gptImageQuality,
    });
    reservation = await reserveCreditsForQuote({
      userId: user.id,
      projectId,
      requestId,
      quote,
      metadata: {
        traceId,
        promptLength: prompt.length,
        refImageCount: body.refImages?.length ?? 0,
      },
    });
    const refImages = await resolveCrunReferenceImages({
      supabase,
      userId: user.id,
      traceId,
      refImages: body.refImages ?? [],
      model,
    });
    const result = await generateImage({
      model,
      prompt,
      aspectRatio: body.aspectRatio,
      imageSize,
      gptImageQuality,
      gptImageBackground,
      refImages,
    });

    let storedImage: { imageUrl: string; thumbnailUrl: string };
    try {
      storedImage = await persistGeneratedImageWithThumbnailToStorage(
        supabase,
        user.id,
        result.imageUrl,
        randomUUID(),
      );
    } catch (error) {
      throw new ImageGenerationError(
        error instanceof Error && error.message.trim() ? error.message.trim() : "图片已生成，但保存到云存储失败。",
        { stage: "storage", routeKind: result.payloadKind },
        error,
      );
    }

    const captured = await captureCreditReservation({
      reservationId: reservation.id,
      resultRef: storedImage.imageUrl,
      metadata: { payloadKind: result.payloadKind, traceId },
    });
    const account = await ensureCreditAccount(user.id);
    return Response.json({
      ...storedImage,
      payloadKind: result.payloadKind,
      traceId,
      reservationId: captured.id,
      creditsCharged: captured.capturedCredits ?? quote.credits,
      balanceAfter: account.availableCredits,
    });
  } catch (error) {
    if (reservation?.id) {
      await releaseCreditReservation({
        reservationId: reservation.id,
        reason: error instanceof Error ? error.message : "image_generation_failed",
        metadata: { traceId },
      }).catch((releaseError) => {
        console.error("[api/image/generate] release reservation failed", {
          traceId,
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
          traceId,
          fallbackReasonCode: "QUOTA_OR_BILLING",
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
          traceId,
          fallbackReasonCode: "QUOTA_OR_BILLING",
        }),
        { status: error.status },
      );
    }
    if (error instanceof Error && /insufficient credits/i.test(error.message)) {
      return Response.json(
        generationErrorJson({
          message: "积分余额不足，请先充值。",
          code: "INSUFFICIENT_CREDITS",
          status: 402,
          traceId,
        }),
        { status: 402 },
      );
    }
    const failure = toFailureResponse(traceId, error, {
      modelId,
    });
    console.error("[api/image/generate]", {
      traceId,
      userId: user.id,
      modelId,
      modelName: model.modelName,
      promptLength: prompt.length,
      refImageCount: body.refImages?.length ?? 0,
      aspectRatio: body.aspectRatio ?? "4:3",
      imageSize,
      gptImageQuality,
      error: failure.error,
      details: failure.details,
    });
    return Response.json(failure, { status: 500 });
  }
}
