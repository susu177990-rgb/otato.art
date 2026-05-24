import validator from "@rjsf/validator-ajv8";
import type { SkillJsonSchema } from "@/lib/chat/types";
import { sanitizeJsonSchema } from "@/components/skill-form/schema-to-ui-schema";

export type SkillAssetEntry = {
  asset_id: string;
  role_tag: string;
  asset_url: string;
  description?: string;
  must_keep?: string;
  must_avoid?: string;
};

export type SkillFormPayload = {
  project_info?: {
    input_mode?: string;
    output_purpose?: string;
  };
  provided_assets: SkillAssetEntry[];
  story_request?: {
    story_framework?: string;
    scene_description?: string;
    performance_focus?: string;
  };
  optional_parameters?: Record<string, unknown>;
};

export function validateSkillPayload(
  inputSchema: SkillJsonSchema,
  payload: unknown,
): { ok: true; data: SkillFormPayload } | { ok: false; error: string } {
  const result = validator.validateFormData(payload, sanitizeJsonSchema(inputSchema));
  if (result.errors.length > 0) {
    const msg = result.errors
      .slice(0, 5)
      .map((e) => e.stack || e.message || "无效字段")
      .join("；");
    return { ok: false, error: msg };
  }

  const data = payload as SkillFormPayload;
  const inputMode = data.project_info?.input_mode ?? "素材与文本混合";
  const isTextOnly = inputMode === "纯文本创作";
  const assets = data.provided_assets ?? [];
  const storyRequest = data.story_request ?? {};

  if (!storyRequest.story_framework?.trim()) {
    return { ok: false, error: "请填写核心故事" };
  }

  if (!isTextOnly) {
    const hasCharacter = assets.some((asset) => asset.role_tag === "角色");
    if (!hasCharacter) {
      return { ok: false, error: "请至少上传一张角色参考图" };
    }

    const hasSceneText = Boolean(storyRequest.scene_description?.trim());
    const hasSceneAsset = assets.some((asset) => asset.role_tag === "场景");
    if (!hasSceneText && !hasSceneAsset) {
      return { ok: false, error: "请填写场景描述，或上传场景参考图" };
    }
  }

  return { ok: true, data };
}
