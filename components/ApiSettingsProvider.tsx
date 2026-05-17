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
import { useRouter } from "next/navigation";
import { loadSettings, SETTINGS_STORAGE_KEY } from "@/components/SettingsDialog";
import type { Settings } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/types";

type ApiSettingsContextValue = {
  settings: Settings;
  /**
   * 现已不再弹出局部 Dialog，全局设置统一在项目首页入口下的 `/settings` 页面。
   * 调用本方法等价于跳转 `/settings`，保留方法签名以便旧调用点平滑迁移。
   */
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
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  const refresh = useCallback(() => {
    setSettings(loadSettings());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === SETTINGS_STORAGE_KEY) refresh();
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [refresh]);

  const openSettings = useCallback(() => {
    router.push("/settings");
  }, [router]);

  const value = useMemo(() => ({ settings, openSettings }), [settings, openSettings]);

  return <ApiSettingsContext.Provider value={value}>{children}</ApiSettingsContext.Provider>;
}
