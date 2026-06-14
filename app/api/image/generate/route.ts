import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import {
  ImageGenerationError,
  generateImage,
  parseGenerateRequest,
  type ImageGenerationErrorDetails,
} from "@/lib/image-generate";
import { getUserWorkspaceSnapshot } from "@/lib/db/user-api-settings-store";
import type { GptImageQuality } from "@/lib/image-workspace";
import { persistGeneratedImageWithThumbnailToStorage } from "@/lib/db/persist-generated-image";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ImageGenerateFailureResponse = {
  error: string;
  code: string;
  traceId: string;
  details: ImageGenerationErrorDetails & {
    modelId?: string;
    apiUsageMode?: string;
  };
};

function toFailureResponse(
  traceId: string,
  error: unknown,
  context: {
    modelId?: string;
    apiUsageMode?: string;
    fallbackStage?: ImageGenerationErrorDetails["stage"];
  },
): ImageGenerateFailureResponse {
  const message = error instanceof Error && error.message.trim() ? error.message.trim() : "生图失败";
  const baseDetails =
    error instanceof ImageGenerationError
      ? error.details
      : { stage: context.fallbackStage ?? "unknown" };
  return {
    error: message,
    code: "IMAGE_GENERATION_FAILED",
    traceId,
    details: {
      ...baseDetails,
      modelId: context.modelId,
      apiUsageMode: context.apiUsageMode,
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

export async function POST(req: NextRequest) {
  const traceId = randomUUID();
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "请先登录后再生图" }, { status: 401 });
  }

  const incoming = await parseGenerateRequest(req);
  if (!incoming.ok) return incoming.response;
  const body = incoming.body;
  const projectId = body.projectId?.trim();
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

  const modelId = body.model?.id;
  if (modelId !== "gpt-image-2" && modelId !== "nano-banana-2" && modelId !== "nano-banana-pro") {
    return Response.json(
      {
        error: "model.id 无效，请刷新作图页后重试。",
        code: "MODEL_CONFIG_INCOMPLETE",
        traceId,
        details: {
          stage: "model_config",
          modelId: typeof modelId === "string" ? modelId : undefined,
        },
      },
      { status: 400 },
    );
  }
  const snapshot = await getUserWorkspaceSnapshot(supabase, user.id, { visibility: "server" });
  const model = snapshot.imageWorkspace.models[modelId];
  if (!model?.endpointUrl.trim() || !model.apiKey.trim() || !model.modelName.trim()) {
    const message = snapshot.apiUsageMode?.image === "user"
      ? `「${model?.label || modelId}」（槽位 ${modelId}）缺少 Endpoint / API Key / 模型名。请到设置页填写自己的图片 API。`
      : `网站内部图片 API 暂未配置完整（${model?.label || modelId}），请联系管理员。`;
    return Response.json(
      {
        error: message,
        code: "MODEL_CONFIG_INCOMPLETE",
        traceId,
        details: {
          stage: "model_config",
          modelId,
          apiUsageMode: snapshot.apiUsageMode?.image,
          endpoint: endpointForDiagnostics(model?.endpointUrl),
        },
      },
      { status: 400 },
    );
  }

  const rawQ = body.gptImageQuality;
  const gptImageQuality: GptImageQuality | undefined =
    rawQ === "auto" || rawQ === "low" || rawQ === "medium" || rawQ === "high" ? rawQ : undefined;

  try {
    const result = await generateImage({
      model,
      prompt: body.prompt ?? "",
      aspectRatio: body.aspectRatio,
      imageSize: body.imageSize,
      gptImageQuality,
      refImages: body.refImages,
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

    return Response.json({ ...storedImage, payloadKind: result.payloadKind, traceId });
  } catch (error) {
    const failure = toFailureResponse(traceId, error, {
      modelId,
      apiUsageMode: snapshot.apiUsageMode?.image,
    });
    console.error("[api/image/generate]", {
      traceId,
      userId: user.id,
      modelId,
      error: failure.error,
      details: failure.details,
    });
    return Response.json(failure, { status: 500 });
  }
}
