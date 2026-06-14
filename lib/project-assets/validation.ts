import {
  PROJECT_ASSET_TYPES,
  type ProjectAssetInput,
  type ProjectAssetPatch,
  type ProjectAssetType,
} from "./types";

export const PROJECT_ASSET_REFERENCE_LIMIT = 8;
export const PROJECT_ASSET_TAG_LIMIT = 24;
export const PROJECT_ASSET_IMAGE_MAX_BYTES = 20 * 1024 * 1024;

const PROJECT_ASSET_IMAGE_MIME_RE = /^image\/(?:png|jpe?g|webp|gif|bmp|avif)$/i;

export class ProjectAssetValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectAssetValidationError";
  }
}

function requiredText(value: unknown, label: string, maxLength: number): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) throw new ProjectAssetValidationError(`${label}不能为空`);
  if (normalized.length > maxLength) {
    throw new ProjectAssetValidationError(`${label}不能超过 ${maxLength} 个字符`);
  }
  return normalized;
}

function optionalText(value: unknown, label: string, maxLength: number): string {
  if (value == null) return "";
  const normalized = typeof value === "string" ? value.trim() : "";
  if (normalized.length > maxLength) {
    throw new ProjectAssetValidationError(`${label}不能超过 ${maxLength} 个字符`);
  }
  return normalized;
}

function imageUrl(value: unknown, label: string): string {
  const normalized = requiredText(value, label, PROJECT_ASSET_IMAGE_MAX_BYTES * 2);
  if (/^https?:\/\//i.test(normalized)) return normalized;

  const match = normalized.match(/^data:([^;,]+)(?:;[^,]*)?,(.*)$/i);
  if (!match) {
    throw new ProjectAssetValidationError(`${label}必须是图片 URL`);
  }
  const mime = match[1]?.trim() ?? "";
  if (!PROJECT_ASSET_IMAGE_MIME_RE.test(mime)) {
    throw new ProjectAssetValidationError(`${label}只支持 PNG、JPEG、WebP、GIF、BMP 或 AVIF 图片`);
  }
  const payload = match[2]?.replace(/\s/g, "") ?? "";
  const approxBytes = Math.floor((payload.length * 3) / 4);
  if (approxBytes > PROJECT_ASSET_IMAGE_MAX_BYTES) {
    throw new ProjectAssetValidationError(`${label}不能超过 20MB`);
  }
  return normalized;
}

function assetType(value: unknown): ProjectAssetType {
  if (typeof value === "string" && PROJECT_ASSET_TYPES.includes(value as ProjectAssetType)) {
    return value as ProjectAssetType;
  }
  throw new ProjectAssetValidationError("素材分类必须是 character、prop 或 scene");
}

export function normalizeProjectAssetTags(value: unknown): string[] {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new ProjectAssetValidationError("标签必须是数组");
  const tags = Array.from(
    new Set(
      value
        .map((item) => String(item ?? "").trim())
        .filter(Boolean)
        .map((item) => item.slice(0, 40)),
    ),
  );
  if (tags.length > PROJECT_ASSET_TAG_LIMIT) {
    throw new ProjectAssetValidationError(`标签最多 ${PROJECT_ASSET_TAG_LIMIT} 个`);
  }
  return tags;
}

export function normalizeProjectAssetReferences(value: unknown): string[] {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new ProjectAssetValidationError("参考图必须是数组");
  if (value.length > PROJECT_ASSET_REFERENCE_LIMIT) {
    throw new ProjectAssetValidationError(`参考图最多 ${PROJECT_ASSET_REFERENCE_LIMIT} 张`);
  }
  return Array.from(new Set(value.map((item, index) => imageUrl(item, `参考图 ${index + 1}`))));
}

export function parseProjectAssetInput(value: unknown): ProjectAssetInput {
  if (!value || typeof value !== "object") {
    throw new ProjectAssetValidationError("素材数据无效");
  }
  const input = value as Record<string, unknown>;
  return {
    type: assetType(input.type),
    name: requiredText(input.name, "素材名称", 120),
    description: optionalText(input.description, "素材描述", 4000),
    tags: normalizeProjectAssetTags(input.tags),
    primaryImageUrl: imageUrl(input.primaryImageUrl, "主图"),
    referenceImageUrls: normalizeProjectAssetReferences(input.referenceImageUrls),
  };
}

export function parseProjectAssetPatch(value: unknown): ProjectAssetPatch {
  if (!value || typeof value !== "object") {
    throw new ProjectAssetValidationError("素材数据无效");
  }
  const input = value as Record<string, unknown>;
  const patch: ProjectAssetPatch = {};
  if ("type" in input) patch.type = assetType(input.type);
  if ("name" in input) patch.name = requiredText(input.name, "素材名称", 120);
  if ("description" in input) patch.description = optionalText(input.description, "素材描述", 4000);
  if ("tags" in input) patch.tags = normalizeProjectAssetTags(input.tags);
  if ("primaryImageUrl" in input) patch.primaryImageUrl = imageUrl(input.primaryImageUrl, "主图");
  if ("referenceImageUrls" in input) {
    patch.referenceImageUrls = normalizeProjectAssetReferences(input.referenceImageUrls);
  }
  if (Object.keys(patch).length === 0) {
    throw new ProjectAssetValidationError("没有可更新的素材字段");
  }
  return patch;
}
