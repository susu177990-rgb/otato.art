export const WORKSPACE_SETTINGS_UPDATED_EVENT = "otato:workspace-settings-updated";
export const WORKSPACE_SETTINGS_UPDATED_STORAGE_KEY = "otato.workspace-settings.version";

export function isWorkspaceSettingsStorageKey(key: string | null): boolean {
  return key === WORKSPACE_SETTINGS_UPDATED_STORAGE_KEY;
}

export function notifyWorkspaceSettingsUpdated(): void {
  if (typeof window === "undefined") return;

  window.dispatchEvent(new Event(WORKSPACE_SETTINGS_UPDATED_EVENT));
  try {
    window.localStorage.setItem(
      WORKSPACE_SETTINGS_UPDATED_STORAGE_KEY,
      `${Date.now()}:${Math.random().toString(36).slice(2)}`,
    );
  } catch {
    // Same-tab delivery still works when storage is unavailable.
  }
}
