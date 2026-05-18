import { DEFAULT_SETTINGS } from "@/lib/types";

/** 常见模型 id 示例（仅供参考；设置里可填写任意网关支持的模型名） */
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

/** 裁剪空白；空字符串时回落到全局默认模型（保留用户自定义模型 id） */
export function normalizeModel(v: unknown): string {
  const s = typeof v === "string" ? v.trim() : "";
  return s || DEFAULT_SETTINGS.model;
}
