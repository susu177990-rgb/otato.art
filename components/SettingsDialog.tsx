"use client";

import { useEffect, useState } from "react";
import type { Settings } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/types";
import { normalizeModel } from "@/lib/model-presets";
import { pickNonEmptyTrimmed } from "@/lib/persisted-field";

export const SETTINGS_STORAGE_KEY = "bl-agent-settings";

function load(): Settings {
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

function save(s: Settings) {
  const next = { ...s, model: normalizeModel(s.model) };
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
}

interface Props {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  onSave: (s: Settings) => void;
}

export default function SettingsDialog({ open, onClose, settings, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Settings>(settings);

  useEffect(() => {
    if (!open) {
      setEditing(false);
      return;
    }
    setDraft({
      ...settings,
      model: normalizeModel(settings.model),
    });
    setEditing(false);
  }, [open, settings]);

  if (!open) return null;

  function handleEdit() {
    setDraft({
      ...settings,
      model: normalizeModel(settings.model),
    });
    setEditing(true);
  }

  function handleCancelEdit() {
    setDraft({
      ...settings,
      model: normalizeModel(settings.model),
    });
    setEditing(false);
  }

  function handleSave() {
    const next = {
      ...draft,
      model: normalizeModel(draft.model),
    };
    save(next);
    onSave(next);
    setEditing(false);
  }

  const inputReadOnly = !editing;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">LLM API</h2>
            <p className="mt-1 text-xs text-zinc-500">
              {editing
                ? "编辑中：修改后请点击保存。"
                : "默认已填网关；点击「编辑」可改 URL / Key / 模型。此处配置供编剧室及所有文本大模型能力共用。"}
            </p>
          </div>
          {!editing ? (
            <button
              type="button"
              onClick={handleEdit}
              className="shrink-0 rounded-lg border border-zinc-600 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-zinc-800"
            >
              编辑
            </button>
          ) : null}
        </div>

        <label className="mb-1 block text-sm text-zinc-400">API URL</label>
        <input
          readOnly={inputReadOnly}
          className={[
            "mb-4 w-full rounded-lg border border-zinc-700 px-3 py-2 text-sm outline-none",
            inputReadOnly
              ? "cursor-default bg-zinc-800/80 text-zinc-300"
              : "bg-zinc-800 text-zinc-100 focus:border-indigo-500",
          ].join(" ")}
          value={draft.apiUrl}
          onChange={(e) => setDraft({ ...draft, apiUrl: e.target.value })}
        />

        <label className="mb-1 block text-sm text-zinc-400">API Key</label>
        <input
          type="password"
          readOnly={inputReadOnly}
          className={[
            "mb-4 w-full rounded-lg border border-zinc-700 px-3 py-2 font-mono text-sm outline-none",
            inputReadOnly
              ? "cursor-default bg-zinc-800/80 text-zinc-300"
              : "bg-zinc-800 text-zinc-100 focus:border-indigo-500",
          ].join(" ")}
          value={draft.apiKey}
          onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })}
        />

        <label className="mb-1 block text-sm text-zinc-400">模型</label>
        <input
          readOnly={inputReadOnly}
          spellCheck={false}
          autoComplete="off"
          placeholder="网关支持的模型 id"
          className={[
            "mb-6 w-full rounded-lg border border-zinc-700 px-3 py-2 font-mono text-sm outline-none",
            inputReadOnly
              ? "cursor-default bg-zinc-800/80 text-zinc-300"
              : "bg-zinc-800 text-zinc-100 focus:border-indigo-500",
          ].join(" ")}
          value={draft.model}
          onChange={(e) => setDraft({ ...draft, model: e.target.value })}
        />

        <div className="flex flex-wrap justify-end gap-2">
          {editing ? (
            <>
              <button
                type="button"
                onClick={handleCancelEdit}
                className="rounded-lg border border-zinc-600 px-4 py-2 text-sm text-zinc-300 transition hover:bg-zinc-800"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500"
              >
                保存
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500"
            >
              关闭
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export { load as loadSettings };
