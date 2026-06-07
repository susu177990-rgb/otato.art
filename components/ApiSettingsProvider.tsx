"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { DEFAULT_IMAGE_SETTINGS } from "@/lib/image-workspace";
import type { ImageWorkspaceSettings } from "@/lib/image-workspace";
import { DEFAULT_VIDEO_SETTINGS, type VideoWorkspaceSettings } from "@/lib/video-workspace";
import { fetchWorkspaceSnapshot } from "@/lib/workspace-api";
import type { Settings } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/types";

type ApiSettingsContextValue = {
  settings: Settings;
  imageWorkspace: ImageWorkspaceSettings;
  videoWorkspace: VideoWorkspaceSettings;
  workspaceReady: boolean;
  refreshWorkspace: () => Promise<void>;
  openSettings: () => void;
};

const ApiSettingsContext = createContext<ApiSettingsContextValue | null>(null);

export function useApiSettings(): ApiSettingsContextValue {
  const ctx = useContext(ApiSettingsContext);
  if (!ctx) {
    throw new Error("useApiSettings 必须在 ApiSettingsProvider 内使用");
  }
  return ctx;
}

export function ApiSettingsProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [imageWorkspace, setImageWorkspace] = useState<ImageWorkspaceSettings>(DEFAULT_IMAGE_SETTINGS);
  const [videoWorkspace, setVideoWorkspace] = useState<VideoWorkspaceSettings>(DEFAULT_VIDEO_SETTINGS);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const isPublicAuthPath =
    pathname === "/" ||
    pathname === "/login" ||
    pathname === "/reset-password" ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/api/auth/");

  const refreshWorkspace = useCallback(async () => {
    if (isPublicAuthPath) {
      setSettings(DEFAULT_SETTINGS);
      setImageWorkspace(DEFAULT_IMAGE_SETTINGS);
      setVideoWorkspace(DEFAULT_VIDEO_SETTINGS);
      setWorkspaceReady(false);
      return;
    }

    try {
      const snapshot = await fetchWorkspaceSnapshot();
      setSettings(snapshot.llm ?? DEFAULT_SETTINGS);
      setImageWorkspace(snapshot.imageWorkspace);
      setVideoWorkspace(snapshot.videoWorkspace);
    } catch (e) {
      console.error("[ApiSettingsProvider] refresh failed", e);
    } finally {
      setWorkspaceReady(true);
    }
  }, [isPublicAuthPath]);

  useEffect(() => {
    void refreshWorkspace();
  }, [refreshWorkspace]);

  const openSettings = useCallback(() => {
    router.push("/settings");
  }, [router]);

  const value = useMemo(
    () => ({ settings, imageWorkspace, videoWorkspace, workspaceReady, refreshWorkspace, openSettings }),
    [settings, imageWorkspace, videoWorkspace, workspaceReady, refreshWorkspace, openSettings],
  );

  return <ApiSettingsContext.Provider value={value}>{children}</ApiSettingsContext.Provider>;
}
