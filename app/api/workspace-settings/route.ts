import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkspaceSnapshot, type WorkspaceSnapshot } from "@/lib/db/workspace-settings-store";
import { API_KEY_CONFIGURED_PLACEHOLDER } from "@/lib/api-key-redaction";
import type { ImageModelSettings } from "@/lib/image-workspace";
import type { LlmModelConfig } from "@/lib/types";
import type { VideoModelSettings } from "@/lib/video-workspace";

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message.trim();
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message.trim();
  }
  return "";
}

function clientWorkspaceSnapshot(snapshot: WorkspaceSnapshot): WorkspaceSnapshot {
  const llmModels = Object.fromEntries(
    Object.entries(snapshot.llm.models).map(([id, model]) => [
      id,
      { ...model, apiKey: model.apiKey.trim() ? API_KEY_CONFIGURED_PLACEHOLDER : "" },
    ]),
  ) as Record<string, LlmModelConfig>;
  const defaultLlm = llmModels[snapshot.llm.defaultModelId] ?? Object.values(llmModels)[0];
  const imageModels = Object.fromEntries(
    Object.entries(snapshot.imageWorkspace.models).map(([id, model]) => [
      id,
      { ...model, apiKey: model.apiKey.trim() ? API_KEY_CONFIGURED_PLACEHOLDER : "" },
    ]),
  ) as Record<string, ImageModelSettings>;
  const videoModels = Object.fromEntries(
    Object.entries(snapshot.videoWorkspace.models).map(([id, model]) => [
      id,
      { ...model, apiKey: model.apiKey.trim() ? API_KEY_CONFIGURED_PLACEHOLDER : "" },
    ]),
  ) as Record<string, VideoModelSettings>;

  return {
    llm: {
      ...snapshot.llm,
      models: llmModels,
      apiKey: defaultLlm?.apiKey ?? "",
      apiUrl: defaultLlm?.apiUrl ?? snapshot.llm.apiUrl,
      model: defaultLlm?.modelName ?? snapshot.llm.model,
    },
    imageWorkspace: {
      ...snapshot.imageWorkspace,
      models: imageModels,
    },
    videoWorkspace: {
      ...snapshot.videoWorkspace,
      models: videoModels,
    },
  };
}

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }
    return NextResponse.json(clientWorkspaceSnapshot(await getWorkspaceSnapshot(supabase)));
  } catch (e) {
    console.error("[workspace-settings GET]", e);
    const message = describeError(e);
    return NextResponse.json({ error: message || "read_failed" }, { status: 500 });
  }
}
