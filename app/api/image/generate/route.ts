import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { generateImage, parseGenerateRequest } from "@/lib/image-generate";
import { getUserWorkspaceSnapshot } from "@/lib/db/user-api-settings-store";
import type { GptImageQuality } from "@/lib/image-workspace";
import { persistGeneratedImageToStorage } from "@/lib/db/persist-generated-image";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
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

  const modelId = body.model?.id;
  if (modelId !== "gpt-image-2" && modelId !== "nano-banana-2" && modelId !== "nano-banana-pro") {
    return Response.json({ error: "model.id 无效，请刷新作图页后重试。", code: "MODEL_CONFIG_INCOMPLETE" }, { status: 400 });
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

    const imageUrl = await persistGeneratedImageToStorage(
      supabase,
      user.id,
      result.imageUrl,
      randomUUID(),
    );

    return Response.json({ imageUrl, payloadKind: result.payloadKind });
  } catch (error) {
    const message = error instanceof Error ? error.message : "生图失败";
    return Response.json({ error: message }, { status: 500 });
  }
}
