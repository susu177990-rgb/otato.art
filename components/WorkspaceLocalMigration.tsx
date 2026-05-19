"use client";

import { useEffect } from "react";
import {
  IMAGE_GALLERY_STORAGE_KEY,
  type ImageGalleryRecord,
} from "@/lib/image-workspace";
import { importGalleryRecordsApi } from "@/lib/workspace-api";
import { useApiSettings } from "@/components/ApiSettingsProvider";

const MIGRATION_FLAG = "script_agent_migrated_v1";

function readLegacyGallery(): ImageGalleryRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(IMAGE_GALLERY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function hasLegacyLocalData(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.localStorage.getItem(IMAGE_GALLERY_STORAGE_KEY));
}

/** 登录后一次性：浏览器旧画廊 localStorage → 用户自己的 Supabase 画廊。 */
export function WorkspaceLocalMigration() {
  const { workspaceReady, refreshWorkspace } = useApiSettings();

  useEffect(() => {
    if (!workspaceReady) return;
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(MIGRATION_FLAG) === "1") return;
    if (!hasLegacyLocalData()) {
      window.localStorage.setItem(MIGRATION_FLAG, "1");
      return;
    }

    void (async () => {
      try {
        const legacyGallery = readLegacyGallery();
        if (legacyGallery.length > 0) {
          await importGalleryRecordsApi(legacyGallery);
        }

        window.localStorage.setItem(MIGRATION_FLAG, "1");
        await refreshWorkspace();
      } catch (e) {
        console.warn("[WorkspaceLocalMigration]", e);
      }
    })();
  }, [workspaceReady, refreshWorkspace]);

  return null;
}
