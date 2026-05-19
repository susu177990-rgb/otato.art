"use client";

import { createElement, Fragment, useLayoutEffect, useRef, type ReactNode } from "react";
import { loadLlmSettings, SETTINGS_STORAGE_KEY } from "@/lib/llm-settings-storage";
import type { Settings } from "@/lib/types";
import {
  IMAGE_SETTINGS_STORAGE_KEY,
  mergeImageSettings,
  type ImageWorkspaceSettings,
} from "@/lib/image-workspace";

/** 与 ApiSettingsProvider / 作图页等监听：仓库快照写入 localStorage 后派发 */
export const WORKSPACE_SETTINGS_SYNC_EVENT = "script-agent-workspace-sync";

export type WorkspaceSnapshot = {
  llm: Settings;
  imageWorkspace: ImageWorkspaceSettings;
};

export function applyWorkspaceSnapshotToLocalStorage(snapshot: WorkspaceSnapshot): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(snapshot.llm));
  window.localStorage.setItem(IMAGE_SETTINGS_STORAGE_KEY, JSON.stringify(snapshot.imageWorkspace));
}

function readImageWorkspaceFromLocalStorage(): ImageWorkspaceSettings {
  if (typeof window === "undefined") return mergeImageSettings({});
  try {
    const raw = window.localStorage.getItem(IMAGE_SETTINGS_STORAGE_KEY);
    if (!raw) return mergeImageSettings({});
    return mergeImageSettings(JSON.parse(raw));
  } catch {
    return mergeImageSettings({});
  }
}

let flushTimer: ReturnType<typeof setTimeout> | null = null;

/** 将当前 localStorage 中的 LLM + 生图设置同步到仓库根目录 `workspace-settings.json`（仅 dev 或 ALLOW_WORKSPACE_SETTINGS_WRITE=1） */
export function flushWorkspaceSettingsToProject(): void {
  if (typeof window === "undefined") return;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    const llm = loadLlmSettings();
    const imageWorkspace = readImageWorkspaceFromLocalStorage();
    void fetch("/api/workspace-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ llm, imageWorkspace }),
    }).then(async (res) => {
      if (res.ok) return;
      const j = (await res.json().catch(() => ({}))) as { hint?: string; error?: string };
      console.warn(
        "[workspace-settings] 未能写入仓库文件:",
        j?.error ?? res.status,
        j?.hint ? `\n${j.hint}` : "",
      );
    });
  }, 320);
}

/**
 * 首屏渲染阶段把服务端读到的 `workspace-settings.json` 写入 localStorage，
 * 确保子组件在首次 useState/loadSettings 之前已与仓库一致。
 */
export function WorkspaceSettingsBootstrapShell({
  snapshot,
  children,
}: {
  snapshot: WorkspaceSnapshot;
  children: ReactNode;
}) {
  const ran = useRef(false);
  if (typeof window !== "undefined" && !ran.current) {
    ran.current = true;
    applyWorkspaceSnapshotToLocalStorage(snapshot);
  }

  useLayoutEffect(() => {
    window.dispatchEvent(new Event(WORKSPACE_SETTINGS_SYNC_EVENT));
  }, []);

  return createElement(Fragment, null, children);
}
