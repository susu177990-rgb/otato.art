import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { llmToChatApiConfig } from "@/lib/chat-settings";
import { parseAssistantChoice, sendChatCompletionRaw } from "@/lib/chat/completion";
import type { ChatApiConfig, ChatMessage, SkillFormRunResult, SkillPackRecord } from "@/lib/chat/types";
import { generateImage } from "@/lib/image-generate";
import { effectiveAgentImageModelId, resolveImageModelSettings } from "@/lib/chat/image-model-catalog";
import { resolveImageSizeFromUnknownRecord } from "@/lib/chat/image-size-policy";
import { persistGeneratedImageWithThumbnailToStorage } from "@/lib/db/persist-generated-image";
import { prependGalleryRecord } from "@/lib/db/gallery-store";
import { getUserWorkspaceSnapshot } from "@/lib/db/user-api-settings-store";
import { skillPackDisplayLabel } from "@/lib/chat/skill-pack";
import type { ImageAspectRatio, ImageGalleryRecord, ImageModelId } from "@/lib/image-workspace";
import { validateSkillPayload, type SkillFormPayload } from "@/lib/skills/validate-skill-payload";

function mapAspectRatio(raw?: string): ImageAspectRatio {
  const text = raw ?? "";
  if (text.includes("16:9")) return "16:9";
  if (text.includes("9:16")) return "9:16";
  if (text.includes("1:1")) return "1:1";
  if (text.includes("4:3")) return "4:3";
  if (text.includes("2.35:1") || text.includes("21:9")) return "21:9";
  return "16:9";
}

function hasOutputProperty(pack: SkillPackRecord, key: string): boolean {
  if (!pack.outputSchema || typeof pack.outputSchema !== "object" || !("properties" in pack.outputSchema)) {
    return false;
  }
  return Boolean((pack.outputSchema.properties as Record<string, unknown> | undefined)?.[key]);
}

function shouldUsePromptConfirmation(pack: SkillPackRecord): boolean {
  if (hasOutputProperty(pack, "confirmation_action")) return true;
  if (hasOutputProperty(pack, "master_prompt_markdown") && hasOutputProperty(pack, "generated_image_url")) {
    return true;
  }

  const searchable = [
    pack.title,
    pack.displayLabel,
    pack.skills.map((skill) => `${skill.name}\n${skill.markdown.slice(0, 1200)}`).join("\n"),
  ]
    .join("\n")
    .toLowerCase();

  return /storyboard|故事板|分镜|导演板/.test(searchable);
}

async function generateMasterPrompt(
  chatApiConfig: ChatApiConfig,
  systemPrompt: string,
  payload: SkillFormPayload,
): Promise<string> {
  const systemMsg: ChatMessage = {
    id: "sys-form",
    role: "system",
    createdAt: Date.now(),
    parts: [{ type: "text", text: systemPrompt }],
  };
  const userMsg: ChatMessage = {
    id: "user-form",
    role: "user",
    createdAt: Date.now(),
    parts: [
      {
        type: "text",
        text: `以下是用户提交的表单 JSON。请严格按系统指令只输出 Master Prompt 全文，不要寒暄、不要 JSON 包裹、不要 markdown 代码块：\n\n${JSON.stringify(payload, null, 2)}`,
      },
    ],
  };

  const raw = await sendChatCompletionRaw(chatApiConfig, [systemMsg, userMsg]);
  const { contentText } = parseAssistantChoice(raw);
  const master = contentText?.trim() ?? "";
  if (!master) {
    throw new Error("模型未返回 Master Prompt");
  }
  if (/^生成失败/.test(master)) {
    throw new Error(master);
  }
  return master;
}

export async function runSkillForm(params: {
  supabase: SupabaseClient;
  userId: string;
  pack: SkillPackRecord;
  payload: unknown;
  preferredImageModelId?: ImageModelId;
  action?: "prompt" | "generate";
  masterPrompt?: string;
  projectId?: string | null;
}): Promise<SkillFormRunResult> {
  const { supabase, userId, pack, payload, preferredImageModelId, action, masterPrompt, projectId } = params;

  if (!pack.inputSchema) {
    throw new Error("该 Skill 未配置表单 interface");
  }
  if (!pack.optimizedSystemPrompt?.trim()) {
    throw new Error("该 Skill 缺少 optimized_system_prompt，无法执行表单模式");
  }

  const validated = validateSkillPayload(pack.inputSchema, payload);
  if (!validated.ok) {
    throw new Error(validated.error);
  }
  const formPayload = validated.data;

  const snapshot = await getUserWorkspaceSnapshot(supabase, userId, { visibility: "server" });
  const chatApiConfig = llmToChatApiConfig(snapshot.llm);
  const shouldConfirmImage = shouldUsePromptConfirmation(pack);

  const resolvedMasterPrompt =
    action === "generate" && masterPrompt?.trim()
      ? masterPrompt.trim()
      : await generateMasterPrompt(chatApiConfig, pack.optimizedSystemPrompt, formPayload);

  if (shouldConfirmImage && action !== "generate") {
    return {
      master_prompt: resolvedMasterPrompt,
      master_prompt_markdown: resolvedMasterPrompt,
      image_generation_status: "awaiting_confirmation",
      confirmation_action: {
        label: "确认生图",
        generation_mode: "generate_image",
        uses_prompt_field: "master_prompt_markdown",
      },
      generated_image_url: undefined,
    };
  }

  const modelId = effectiveAgentImageModelId(preferredImageModelId, "gpt-image-2");
  const model = resolveImageModelSettings(snapshot.imageWorkspace, modelId);
  if (!model) {
    throw new Error(`生图模型未配置完整: ${modelId}`);
  }
  const aspectRatio = mapAspectRatio(
    typeof formPayload.optional_parameters?.aspect_ratio === "string"
      ? formPayload.optional_parameters.aspect_ratio
      : undefined,
  );
  const imageSize = resolveImageSizeFromUnknownRecord(formPayload.optional_parameters, "2K");
  const refImages = formPayload.provided_assets.map((a) => a.asset_url).filter(Boolean);

  const imageId = randomUUID();

  const imageResult = await generateImage({
    model,
    prompt: resolvedMasterPrompt,
    aspectRatio,
    imageSize,
    refImages,
  });

  const generatedImage = await persistGeneratedImageWithThumbnailToStorage(
    supabase,
    userId,
    imageResult.imageUrl,
    imageId,
  );

  const galleryRecord: ImageGalleryRecord = {
    id: imageId,
    createdAt: new Date().toISOString(),
    modeId: `skill-form:${pack.id}`,
    modeName: `Skill · ${skillPackDisplayLabel(pack)}`,
    modelId: modelId,
    modelName: model.modelName,
    finalPrompt: resolvedMasterPrompt,
    userInput: formPayload.story_request?.story_framework ?? "",
    aspectRatio,
    imageSize,
    imageUrl: generatedImage.imageUrl,
    thumbnailUrl: generatedImage.thumbnailUrl,
    refImageCount: refImages.length,
    status: "success",
  };
  prependGalleryRecord(
    supabase,
    galleryRecord,
    projectId === undefined ? {} : { projectId },
  ).catch((e) =>
    console.warn("[skills/run gallery save]", e),
  );

  return {
    master_prompt: resolvedMasterPrompt,
    master_prompt_markdown: resolvedMasterPrompt,
    image_generation_status: "ready",
    confirmation_action: null,
    generated_image_url: generatedImage.imageUrl,
  };
}
