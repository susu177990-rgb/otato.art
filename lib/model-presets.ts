/** 设置弹窗内快捷可选的模型 id（默认 gpt-5.4-mini） */
export const MODEL_QUICK_OPTIONS = [
  { value: "gpt-5.4", label: "gpt-5.4" },
  { value: "gpt-5.4-mini", label: "gpt-5.4-mini（默认）" },
  { value: "gemini-3.1-flash-lite-preview", label: "gemini-3.1-flash-lite-preview" },
  { value: "gemini-3.1-pro-preview", label: "gemini-3.1-pro-preview" },
] as const;

export type ModelQuickValue = (typeof MODEL_QUICK_OPTIONS)[number]["value"];

const QUICK_SET = new Set<string>(MODEL_QUICK_OPTIONS.map((o) => o.value));

export function isQuickModel(v: string): v is ModelQuickValue {
  return QUICK_SET.has(v);
}

/** 不在快捷列表中的历史值回落为默认 mini */
export function normalizeModel(v: string): ModelQuickValue {
  return isQuickModel(v) ? v : "gpt-5.4-mini";
}
