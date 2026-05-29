import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { prependGalleryRecord } from "@/lib/db/gallery-store";
import { generateImage } from "@/lib/image-generate";
import type {
  ImageAspectRatio,
  ImageGalleryRecord,
  ImageGalleryReferenceImage,
  ImageModelSettings,
  ImageSizeTier,
} from "@/lib/image-workspace";
import type { Settings } from "@/lib/types";
import { loadLiveActionAgentPrompt } from "@/lib/ai-live-action/prompts";
import { buildAssetSummary, runLiveActionLlm } from "@/lib/ai-live-action/llm";
import {
  AI_LIVE_ACTION_MODE_ID,
  AI_LIVE_ACTION_MODE_NAME,
  type LiveActionAssetBundle,
  type LiveActionReconstructResult,
  type LiveActionRunResult,
} from "@/lib/ai-live-action/types";

function extractSection(markdown: string, title: string): string {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`【${escaped}】\\s*([\\s\\S]*?)(?=\\n【[^】]+】|$)`);
  const match = markdown.match(re);
  return match?.[1]?.trim() ?? "";
}

function generationPromptFromRedraw(redrawOutput: string): { finalPrompt: string; negativePrompt: string } {
  const finalPrompt =
    extractSection(redrawOutput, "最终生图 Prompt") ||
    extractSection(redrawOutput, "最终生图 prompt") ||
    extractSection(redrawOutput, "Prompt") ||
    redrawOutput.trim();
  const negativePrompt =
    extractSection(redrawOutput, "Negative Prompt") ||
    extractSection(redrawOutput, "negative prompt") ||
    extractSection(redrawOutput, "反向提示词");
  return { finalPrompt, negativePrompt };
}

function allReferenceDataUrls(bundle: LiveActionAssetBundle): string[] {
  return [
    bundle.sourceFirstFrameImage.dataUrl,
    bundle.sceneGridImage.dataUrl,
    ...(bundle.markedSceneGridImage ? [bundle.markedSceneGridImage.dataUrl] : []),
    ...bundle.characters.map((item) => item.image.dataUrl),
    ...bundle.props.map((item) => item.image.dataUrl),
  ];
}

function buildDeterministicAssetReview(bundle: LiveActionAssetBundle): string {
  const blockers: string[] = [];
  const warnings: string[] = [];
  if (!bundle.sourceFirstFrameImage?.dataUrl) blockers.push("缺少原实拍视频片段首帧图");
  if (!bundle.sceneGridImage?.dataUrl) blockers.push("缺少目标场景资产宫格图");
  if (!bundle.markedSceneGridImage?.dataUrl) warnings.push("未提供带位置/角色标识的目标场景图，镜头重构师需要自行推断人物落位");
  if (bundle.characters.length === 0) warnings.push("未提供目标角色图，角色身份一致性会弱一些");
  if (bundle.props.length === 0) warnings.push("未提供目标道具图，本镜头不会强制绑定道具资产");

  const characters = bundle.characters.length
    ? bundle.characters
        .map((item) => `- ${item.name}：${item.image.id}${item.notes ? `｜${item.notes}` : ""}`)
        .join("\n")
    : "- 无";
  const props = bundle.props.length
    ? bundle.props
        .map((item) => {
          const bound = item.boundCharacterName ? `｜关联角色：${item.boundCharacterName}` : "";
          return `- ${item.name}：${item.image.id}${bound}${item.notes ? `｜${item.notes}` : ""}`;
        })
        .join("\n")
    : "- 无";

  return `【工作流状态】
${blockers.length ? "blocked" : warnings.length ? "needs_review" : "ready"}

【素材检查】
- 原实拍首帧：${bundle.sourceFirstFrameImage?.dataUrl ? "已提供，索引 SRC_FIRST_FRAME" : "缺失"}
- 目标场景资产宫格图：${bundle.sceneGridImage?.dataUrl ? "已提供，索引 SCENE_GRID" : "缺失"}
- 位置标注图：${bundle.markedSceneGridImage?.dataUrl ? "已提供，索引 MARKED_SCENE_GRID" : "未提供"}
- 角色图：${bundle.characters.length} 个
- 道具图：${bundle.props.length} 个
- 用户意图：${bundle.userIntent}

【素材索引】
- SRC_FIRST_FRAME：${bundle.sourceFirstFrameImage.label}
- SCENE_GRID：${bundle.sceneGridImage.label}
- MARKED_SCENE_GRID：${bundle.markedSceneGridImage ? bundle.markedSceneGridImage.label : "未提供"}

【角色绑定】
${characters}

【道具绑定】
${props}

【比例策略】
${bundle.aspectRatio}（按照原实拍首帧图的比例确定；如为 auto，由镜头重构师按原实拍首帧判断）

【警告】
${warnings.length ? warnings.map((item) => `- ${item}`).join("\n") : "- 无"}

【阻塞】
${blockers.length ? blockers.map((item) => `- ${item}`).join("\n") : "- 无"}`;
}

export async function reconstructLiveActionFirstFrame(params: {
  settings: Settings;
  bundle: LiveActionAssetBundle;
}): Promise<LiveActionReconstructResult> {
  const assetSummary = buildAssetSummary(params.bundle);
  const reconstructionPrompt = loadLiveActionAgentPrompt("shot-reconstruction-director");
  const assetReview = buildDeterministicAssetReview(params.bundle);

  const reconstructionOutput = await runLiveActionLlm({
    settings: params.settings,
    systemPrompt: reconstructionPrompt,
    bundle: params.bundle,
    taskText: `请作为“镜头重构师”基于以下主理人结果，分析转绘后的首帧应该长什么样。必须输出【位置】和【比例】，并给出【最终首帧描述】。

【主理人结果】
${assetReview}`,
    temperature: 0.2,
    includeImages: true,
  });

  return {
    assetReview,
    reconstructionOutput,
    assetSummary,
    aspectRatio: params.bundle.aspectRatio,
  };
}

export async function runLiveActionFirstFrame(params: {
  settings: Settings;
  imageModel: ImageModelSettings;
  imageSize: ImageSizeTier;
  gptImageQuality?: ImageGalleryRecord["gptImageQuality"];
  bundle: LiveActionAssetBundle;
  referenceImages: ImageGalleryReferenceImage[];
  supabase: SupabaseClient;
}): Promise<LiveActionRunResult> {
  const reconstruction = await reconstructLiveActionFirstFrame({
    settings: params.settings,
    bundle: params.bundle,
  });

  const redrawPrompt = loadLiveActionAgentPrompt("first-frame-redraw-artist");
  const redrawOutput = await runLiveActionLlm({
    settings: params.settings,
    systemPrompt: redrawPrompt,
    bundle: params.bundle,
    taskText: `请作为“首帧转绘师”把以下镜头重构结果转成可执行生图规格。必须输出【最终生图 Prompt】、【Negative Prompt】和【生成前检查清单】。

【镜头重构师输出】
${reconstruction.reconstructionOutput}`,
    temperature: 0.15,
    includeImages: false,
  });

  const { finalPrompt, negativePrompt } = generationPromptFromRedraw(redrawOutput);
  const promptForGeneration = negativePrompt ? `${finalPrompt}\n\n避免：${negativePrompt}` : finalPrompt;
  const imageResult = await generateImage({
    model: params.imageModel,
    prompt: promptForGeneration,
    aspectRatio: params.bundle.aspectRatio,
    imageSize: params.imageSize,
    gptImageQuality: params.gptImageQuality,
    refImages: allReferenceDataUrls(params.bundle),
  });

  const galleryRecordId = randomUUID();
  const record: ImageGalleryRecord = {
    id: galleryRecordId,
    createdAt: new Date().toISOString(),
    modeId: AI_LIVE_ACTION_MODE_ID,
    modeName: AI_LIVE_ACTION_MODE_NAME,
    modelId: params.imageModel.id,
    modelName: params.imageModel.modelName,
    finalPrompt: promptForGeneration,
    userInput: params.bundle.userIntent,
    userSlotInputs: [
      params.bundle.userIntent,
      reconstruction.assetReview,
      reconstruction.reconstructionOutput,
      redrawOutput,
    ],
    aspectRatio: params.bundle.aspectRatio as ImageAspectRatio,
    imageSize: params.imageSize,
    gptImageQuality: params.imageModel.provider === "gpt-image" ? params.gptImageQuality : undefined,
    imageUrl: imageResult.imageUrl,
    refImageCount: params.referenceImages.length,
    referenceImages: params.referenceImages,
    status: "success",
  };
  const galleryRecords = await prependGalleryRecord(params.supabase, record);
  const savedRecord = galleryRecords.find((item) => item.id === galleryRecordId);

  return {
    ...reconstruction,
    redrawOutput,
    finalPrompt,
    negativePrompt,
    imageUrl: savedRecord?.imageUrl || imageResult.imageUrl,
    payloadKind: imageResult.payloadKind,
    galleryRecordId,
  };
}
