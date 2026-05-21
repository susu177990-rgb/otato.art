export type GenerateImageToolResult =
  | { success: true; media_url: string; kind?: string; preset_id?: string }
  | { success: false; error: string };

export function parseGenerateImageToolJson(raw: string): GenerateImageToolResult | null {
  const t = raw.trim();
  if (!t) return null;
  try {
    const j = JSON.parse(t) as {
      success?: boolean;
      error?: string;
      media_url?: string;
      kind?: string;
      preset_id?: string;
    };
    if (j.success === true && typeof j.media_url === "string" && j.media_url.trim()) {
      return {
        success: true,
        media_url: j.media_url.trim(),
        kind: j.kind,
        preset_id: j.preset_id,
      };
    }
    if (j.success === false) {
      return { success: false, error: j.error?.trim() || "生图 API 返回失败" };
    }
  } catch {
    /* ignore */
  }
  return null;
}

const HALLUCINATED_IMAGE_CLAIM =
  /(?:已(?:经)?(?:为你)?生成|生成完成|图已(?:经)?(?:生成|出)|出图完成|见附件|下方(?:是|为)?.*图)/;

/** 本轮未真实生图时，禁止模型口头「已生成」 */
export function stripHallucinatedImageClaims(text: string): string {
  const t = text.trim();
  if (!t || !HALLUCINATED_IMAGE_CLAIM.test(t)) return t;
  const cleaned = t
    .split(/\n+/)
    .filter((line) => !HALLUCINATED_IMAGE_CLAIM.test(line))
    .join("\n")
    .trim();
  const prefix = "【说明：本轮未调用生图 API，以下仅为文字回复，没有真实图片。】\n\n";
  return cleaned ? prefix + cleaned : prefix.trim();
}

export function buildAssistantFromGenerateResult(
  result: GenerateImageToolResult,
  llmDraft: string | null,
): string {
  if (!result.success) {
    return `生图失败：${result.error}`;
  }

  const draft = llmDraft?.trim();
  if (!draft) {
    return "图片已真实生成，请查看下方「生图结果」中的预览。";
  }
  if (HALLUCINATED_IMAGE_CLAIM.test(draft)) {
    return `${draft}\n\n（真实图片见下方「生图结果」，请以预览为准。）`;
  }
  return `${draft}\n\n（真实图片见下方「生图结果」。）`;
}
