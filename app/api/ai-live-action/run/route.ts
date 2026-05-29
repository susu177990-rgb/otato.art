import { NextRequest, NextResponse } from "next/server";
import { parseLiveActionMultipart } from "@/lib/ai-live-action/request";
import { runLiveActionFirstFrame } from "@/lib/ai-live-action/workflow";
import { getWorkspaceSnapshot } from "@/lib/db/workspace-settings-store";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "请先登录后再使用 AI+实拍工作台" }, { status: 401 });

    const parsed = await parseLiveActionMultipart(req);
    if (!parsed.ok) return parsed.response;

    const snapshot = await getWorkspaceSnapshot(supabase);
    const imageModel = snapshot.imageWorkspace.models[parsed.value.options.modelId];
    if (!imageModel?.endpointUrl?.trim() || !imageModel.apiKey?.trim() || !imageModel.modelName?.trim()) {
      return NextResponse.json(
        { error: `生图模型「${parsed.value.options.modelId}」缺少 Endpoint / API Key / 模型名，请先到设置页配置。` },
        { status: 400 },
      );
    }

    const result = await runLiveActionFirstFrame({
      settings: snapshot.llm,
      imageModel,
      imageSize: parsed.value.options.imageSize,
      gptImageQuality: imageModel.provider === "gpt-image" ? snapshot.imageWorkspace.gptImageQuality : undefined,
      bundle: parsed.value.bundle,
      referenceImages: parsed.value.referenceImages,
      supabase,
    });

    return NextResponse.json(result);
  } catch (e) {
    console.error("[ai-live-action/run]", e);
    const message = e instanceof Error ? e.message : "AI+实拍首帧生成失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
