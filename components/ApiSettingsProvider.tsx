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
import SettingsDialog, { loadSettings, SETTINGS_STORAGE_KEY } from "@/components/SettingsDialog";
import type { Settings } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/types";

type ApiSettingsContextValue = {
  settings: Settings;
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
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const refresh = useCallback(() => {
    setSettings(loadSettings());
  }, []);

  useEffect(() => {
    refresh();
    setHydrated(true);
  }, [refresh]);

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === SETTINGS_STORAGE_KEY) refresh();
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [refresh]);

  useEffect(() => {
    if (hydrated && !settings.apiKey) setDialogOpen(true);
  }, [hydrated, settings.apiKey]);

  const openSettings = useCallback(() => setDialogOpen(true), []);

  const value = useMemo(() => ({ settings, openSettings }), [settings, openSettings]);

  function handleSave(next: Settings) {
    setSettings(next);
  }

  return (
    <ApiSettingsContext.Provider value={value}>
      {children}
      <SettingsDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        settings={settings}
        onSave={handleSave}
      />
    </ApiSettingsContext.Provider>
  );
}
