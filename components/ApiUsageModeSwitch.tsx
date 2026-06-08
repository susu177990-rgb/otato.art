"use client";

import { useState } from "react";
import type { ApiUsageMode, ApiUsageSource } from "@/lib/db/workspace-settings-store";
import { useApiSettings } from "@/components/ApiSettingsProvider";
import shellStyles from "@/app/shared/shell.module.css";

const LABELS: Record<ApiUsageSource, string> = {
  site: "公共配置",
  user: "个人配置",
};

export function ApiUsageModeSwitch({
  module,
  label,
}: {
  module: keyof ApiUsageMode;
  label?: string;
}) {
  const { apiUsageMode, setApiUsageMode } = useApiSettings();
  const [saving, setSaving] = useState(false);
  const value = apiUsageMode[module];

  async function choose(next: ApiUsageSource) {
    if (next === value || saving) return;
    setSaving(true);
    try {
      await setApiUsageMode({ [module]: next });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        minHeight: 34,
      }}
      aria-label={`${label ?? "API"} 使用方式`}
    >
      {label ? <span style={{ fontSize: 12, color: "var(--settings-muted)" }}>{label}</span> : null}
      {(["site", "user"] as const).map((source) => (
        <button
          key={source}
          type="button"
          className={[shellStyles.navLink, source === value ? shellStyles.navLinkActive : ""].filter(Boolean).join(" ")}
          onClick={() => void choose(source)}
          disabled={saving}
          aria-pressed={source === value}
        >
          {LABELS[source]}
        </button>
      ))}
    </div>
  );
}

export function ApiUsageModeSwitchAll({ label }: { label?: string }) {
  const { apiUsageMode, setApiUsageMode } = useApiSettings();
  const [saving, setSaving] = useState(false);
  const allSite = apiUsageMode.llm === "site" && apiUsageMode.image === "site" && apiUsageMode.video === "site";
  const allUser = apiUsageMode.llm === "user" && apiUsageMode.image === "user" && apiUsageMode.video === "user";

  async function choose(next: ApiUsageSource) {
    if ((next === "site" && allSite) || (next === "user" && allUser) || saving) return;
    setSaving(true);
    try {
      await setApiUsageMode({ llm: next, image: next, video: next });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        minHeight: 34,
      }}
      aria-label={`${label ?? "API"} 使用方式`}
    >
      {label ? <span style={{ fontSize: 12, color: "var(--settings-muted)" }}>{label}</span> : null}
      {(["site", "user"] as const).map((source) => (
        <button
          key={source}
          type="button"
          className={[
            shellStyles.navLink,
            (source === "site" && allSite) || (source === "user" && allUser) ? shellStyles.navLinkActive : "",
          ].filter(Boolean).join(" ")}
          onClick={() => void choose(source)}
          disabled={saving}
          aria-pressed={(source === "site" && allSite) || (source === "user" && allUser)}
        >
          {LABELS[source]}
        </button>
      ))}
    </div>
  );
}
