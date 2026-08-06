import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isWorkspaceSettingsStorageKey,
  notifyWorkspaceSettingsUpdated,
  WORKSPACE_SETTINGS_UPDATED_EVENT,
  WORKSPACE_SETTINGS_UPDATED_STORAGE_KEY,
} from "@/lib/workspace-settings-sync";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("workspace settings sync", () => {
  it("signals the current tab and other tabs without exposing settings", () => {
    const dispatchEvent = vi.fn();
    const setItem = vi.fn();
    vi.stubGlobal("window", {
      dispatchEvent,
      localStorage: { setItem },
    });

    notifyWorkspaceSettingsUpdated();

    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0]?.[0]).toBeInstanceOf(Event);
    expect(dispatchEvent.mock.calls[0]?.[0].type).toBe(WORKSPACE_SETTINGS_UPDATED_EVENT);
    expect(setItem).toHaveBeenCalledWith(
      WORKSPACE_SETTINGS_UPDATED_STORAGE_KEY,
      expect.any(String),
    );
  });

  it("recognizes only the workspace settings storage signal", () => {
    expect(isWorkspaceSettingsStorageKey(WORKSPACE_SETTINGS_UPDATED_STORAGE_KEY)).toBe(true);
    expect(isWorkspaceSettingsStorageKey("other-key")).toBe(false);
    expect(isWorkspaceSettingsStorageKey(null)).toBe(false);
  });
});
