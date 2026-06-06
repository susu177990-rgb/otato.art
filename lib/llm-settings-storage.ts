import type { Settings } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/types";
import { normalizeLlmSettings } from "@/lib/llm-models";

export const SETTINGS_STORAGE_KEY = "bl-agent-settings";

export function loadLlmSettings(): Settings {
  if (typeof window === "undefined") {
    return DEFAULT_SETTINGS;
  }
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (raw) {
      return normalizeLlmSettings(JSON.parse(raw));
    }
  } catch {}
  return DEFAULT_SETTINGS;
}

export function saveLlmSettingsToLocal(s: Settings): void {
  if (typeof window === "undefined") return;
  const next = normalizeLlmSettings(s);
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
}
