import type { NextRequest } from "next/server";
import type {
  ImageAspectRatio,
  ImageGalleryReferenceImage,
  ImageModelId,
  ImageSizeTier,
} from "@/lib/image-workspace";
import type {
  LiveActionAssetBundle,
  LiveActionCharacterAsset,
  LiveActionImageAsset,
  LiveActionPropAsset,
  ParsedLiveActionRequest,
} from "@/lib/ai-live-action/types";

const ASPECT_RATIOS = new Set<ImageAspectRatio>(["auto", "1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9", "21:9"]);
const IMAGE_SIZES = new Set<ImageSizeTier>(["1K", "2K", "4K"]);
const MODEL_IDS = new Set<ImageModelId>(["gpt-image-2", "nano-banana-2", "nano-banana-pro"]);

type AssetMeta = { id?: string; name?: string; notes?: string; fileField?: string; boundCharacterName?: string };

async function blobToDataUrl(blob: Blob): Promise<string> {
  const buf = Buffer.from(await blob.arrayBuffer());
  const mime = blob.type || "application/octet-stream";
  return `data:${mime};base64,${buf.toString("base64")}`;
}

function getText(form: FormData, key: string): string {
  const raw = form.get(key);
  return typeof raw === "string" ? raw.trim() : "";
}

function parseMetaList(form: FormData, key: string): AssetMeta[] {
  const raw = getText(form, key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
      .map((item) => ({
        id: typeof item.id === "string" ? item.id : undefined,
        name: typeof item.name === "string" ? item.name.trim() : undefined,
        notes: typeof item.notes === "string" ? item.notes.trim() : undefined,
        fileField: typeof item.fileField === "string" ? item.fileField : undefined,
        boundCharacterName:
          typeof item.boundCharacterName === "string" ? item.boundCharacterName.trim() : undefined,
      }));
  } catch {
    return [];
  }
}

async function imageFromForm(
  form: FormData,
  field: string,
  fallback: { id: string; label: string; kind: LiveActionImageAsset["kind"] },
): Promise<LiveActionImageAsset | null> {
  const part = form.get(field);
  if (!(part instanceof Blob) || part.size <= 0) return null;
  const fileName = part instanceof File ? part.name : `${fallback.id}.png`;
  return {
    ...fallback,
    dataUrl: await blobToDataUrl(part),
    name: fileName,
    type: part.type || "image/png",
  };
}

export async function parseLiveActionMultipart(req: NextRequest): Promise<
  | { ok: true; value: ParsedLiveActionRequest }
  | { ok: false; response: Response }
> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return {
      ok: false,
      response: Response.json({ error: "无法解析上传表单，请减少图片体积后重试。" }, { status: 400 }),
    };
  }

  const userIntent = getText(form, "userIntent");
  const sceneGridImage = await imageFromForm(form, "sceneGridImage", {
    id: "SCENE_GRID",
    label: "目标场景资产宫格图",
    kind: "scene-grid",
  });
  const sourceFirstFrameImage = await imageFromForm(form, "sourceFirstFrameImage", {
    id: "SRC_FIRST_FRAME",
    label: "原实拍视频片段首帧图",
    kind: "source-first-frame",
  });
  const markedSceneGridImage = await imageFromForm(form, "markedSceneGridImage", {
    id: "MARKED_SCENE_GRID",
    label: "带位置角色标识的目标场景资产宫格图",
    kind: "marked-scene-grid",
  });

  if (!sceneGridImage) {
    return { ok: false, response: Response.json({ error: "请上传目标场景资产宫格图" }, { status: 400 }) };
  }
  if (!sourceFirstFrameImage) {
    return { ok: false, response: Response.json({ error: "请上传原实拍视频片段首帧图" }, { status: 400 }) };
  }
  const characters: LiveActionCharacterAsset[] = [];
  for (const meta of parseMetaList(form, "charactersMeta")) {
    if (!meta.name || !meta.fileField) continue;
    const image = await imageFromForm(form, meta.fileField, {
      id: `CHARACTER_${meta.name}`,
      label: `目标角色图：${meta.name}`,
      kind: "character",
    });
    if (!image) continue;
    characters.push({ id: meta.id || image.id, name: meta.name, image, notes: meta.notes });
  }

  const props: LiveActionPropAsset[] = [];
  for (const meta of parseMetaList(form, "propsMeta")) {
    if (!meta.name || !meta.fileField) continue;
    const image = await imageFromForm(form, meta.fileField, {
      id: `PROP_${meta.name}`,
      label: `目标道具图：${meta.name}`,
      kind: "prop",
    });
    if (!image) continue;
    props.push({
      id: meta.id || image.id,
      name: meta.name,
      image,
      boundCharacterName: meta.boundCharacterName,
      notes: meta.notes,
    });
  }

  const rawAspectRatio = getText(form, "aspectRatio");
  const aspectRatio: ImageAspectRatio = ASPECT_RATIOS.has(rawAspectRatio as ImageAspectRatio)
    ? (rawAspectRatio as ImageAspectRatio)
    : "auto";
  const rawImageSize = getText(form, "imageSize");
  const imageSize: ImageSizeTier = IMAGE_SIZES.has(rawImageSize as ImageSizeTier) ? (rawImageSize as ImageSizeTier) : "2K";
  const rawModelId = getText(form, "modelId");
  const modelId: ImageModelId = MODEL_IDS.has(rawModelId as ImageModelId) ? (rawModelId as ImageModelId) : "nano-banana-pro";

  const bundle: LiveActionAssetBundle = {
    sceneGridImage,
    markedSceneGridImage: markedSceneGridImage ?? undefined,
    sourceFirstFrameImage,
    characters,
    props,
    userIntent: userIntent || "用户未填写文字意图/注意事项，请根据原实拍首帧、目标场景资产图、位置标注图、角色图和道具图自行分析最合理的首帧转绘目标。",
    aspectRatio,
  };

  const referenceAssets = [
    sourceFirstFrameImage,
    sceneGridImage,
    ...(markedSceneGridImage ? [markedSceneGridImage] : []),
    ...characters.map((item) => item.image),
    ...props.map((item) => item.image),
  ];
  const referenceImages: ImageGalleryReferenceImage[] = referenceAssets.map((asset, slotIndex) => ({
    slotIndex,
    dataUrl: asset.dataUrl,
    name: asset.name || asset.label,
    type: asset.type || "image/png",
  }));

  return { ok: true, value: { bundle, options: { modelId, imageSize }, referenceImages } };
}
