import type { Settings } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/types";
import { normalizeModel } from "@/lib/model-presets";
import { pickNonEmptyTrimmed } from "@/lib/persisted-field";

export const SETTINGS_STORAGE_KEY = "bl-agent-settings";

export function loadLlmSettings(): Settings {
  if (typeof window === "undefined") {
    return { ...DEFAULT_SETTINGS, model: normalizeModel(DEFAULT_SETTINGS.model) };
  }
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (raw) {
      const merged = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } as Settings;
      return {
        apiUrl: pickNonEmptyTrimmed(merged.apiUrl, DEFAULT_SETTINGS.apiUrl),
        apiKey: pickNonEmptyTrimmed(merged.apiKey, DEFAULT_SETTINGS.apiKey),
        model: normalizeModel(merged.model ?? DEFAULT_SETTINGS.model),
      };
    }
  } catch {}
  return { ...DEFAULT_SETTINGS, model: normalizeModel(DEFAULT_SETTINGS.model) };
}

export function saveLlmSettingsToLocal(s: Settings): void {
  if (typeof window === "undefined") return;
  const next = { ...s, model: normalizeModel(s.model) };
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
}
