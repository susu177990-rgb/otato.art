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
import { fetchWorkspaceSnapshot, saveWorkspaceSnapshot } from "@/lib/workspace-api";
import type { Settings } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/types";
import {
  DEFAULT_API_USAGE_MODE,
  type ApiUsageMode,
  type ApiUsageSource,
} from "@/lib/db/workspace-settings-store";

type ApiSettingsContextValue = {
  settings: Settings;
  imageWorkspace: ImageWorkspaceSettings;
  videoWorkspace: VideoWorkspaceSettings;
  apiUsageMode: ApiUsageMode;
  workspaceReady: boolean;
  refreshWorkspace: () => Promise<void>;
  setApiUsageMode: (patch: Partial<ApiUsageMode>) => Promise<void>;
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
  const [apiUsageMode, setApiUsageModeState] = useState<ApiUsageMode>(DEFAULT_API_USAGE_MODE);
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
      setApiUsageModeState(DEFAULT_API_USAGE_MODE);
      setWorkspaceReady(false);
      return;
    }

    try {
      const snapshot = await fetchWorkspaceSnapshot();
      setSettings(snapshot.llm ?? DEFAULT_SETTINGS);
      setImageWorkspace(snapshot.imageWorkspace);
      setVideoWorkspace(snapshot.videoWorkspace);
      setApiUsageModeState(snapshot.apiUsageMode ?? DEFAULT_API_USAGE_MODE);
    } catch (e) {
      console.error("[ApiSettingsProvider] refresh failed", e);
    } finally {
      setWorkspaceReady(true);
    }
  }, [isPublicAuthPath]);

  const setApiUsageMode = useCallback(
    async (patch: Partial<Record<keyof ApiUsageMode, ApiUsageSource>>) => {
      const next = { ...apiUsageMode, ...patch };
      setApiUsageModeState(next);
      try {
        const snapshot = await saveWorkspaceSnapshot({
          apiUsageMode: next,
        });
        setSettings(snapshot.llm ?? DEFAULT_SETTINGS);
        setImageWorkspace(snapshot.imageWorkspace);
        setVideoWorkspace(snapshot.videoWorkspace);
        setApiUsageModeState(snapshot.apiUsageMode ?? next);
      } catch (error) {
        setApiUsageModeState(apiUsageMode);
        throw error;
      }
    },
    [apiUsageMode],
  );

  useEffect(() => {
    void refreshWorkspace();
  }, [refreshWorkspace]);

  const openSettings = useCallback(() => {
    router.push("/settings");
  }, [router]);

  const value = useMemo(
    () => ({
      settings,
      imageWorkspace,
      videoWorkspace,
      apiUsageMode,
      workspaceReady,
      refreshWorkspace,
      setApiUsageMode,
      openSettings,
    }),
    [settings, imageWorkspace, videoWorkspace, apiUsageMode, workspaceReady, refreshWorkspace, setApiUsageMode, openSettings],
  );

  return <ApiSettingsContext.Provider value={value}>{children}</ApiSettingsContext.Provider>;
}
