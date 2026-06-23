"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { ApiUsageMode, ApiUsageSource } from "@/lib/db/workspace-settings-store";
import { useApiSettings } from "@/components/ApiSettingsProvider";
import shellStyles from "@/app/shared/shell.module.css";

const LABELS: Record<ApiUsageSource, string> = {
  site: "系统 API",
  user: "个人 API",
};

type MenuAnchor = { left: number; top: number; width: number; height: number };

function anchorFromElement(element: HTMLElement): MenuAnchor {
  const rect = element.getBoundingClientRect();
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

function ApiUsageDropdown({
  valueLabel,
  activeSource,
  saving,
  className,
  hideChevron = true,
  menuClassName,
  backdropClassName,
  optionClassName,
  optionActiveClassName,
  ariaLabel,
  onChoose,
}: {
  valueLabel: string;
  activeSource: ApiUsageSource | null;
  saving: boolean;
  className?: string;
  hideChevron?: boolean;
  menuClassName?: string;
  backdropClassName?: string;
  optionClassName?: string;
  optionActiveClassName?: string;
  ariaLabel: string;
  onChoose: (source: ApiUsageSource) => void;
}) {
  const [anchor, setAnchor] = useState<MenuAnchor | null>(null);
  const open = Boolean(anchor);

  useEffect(() => {
    if (!open) return;

    function close() {
      setAnchor(null);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }

    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const menu =
    open && anchor
      ? createPortal(
          <>
            <button
              type="button"
              aria-label="关闭 API 来源菜单"
              onClick={() => setAnchor(null)}
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 4990,
                border: 0,
                background: "transparent",
              }}
              className={backdropClassName}
            />
            <div
              role="menu"
              className={menuClassName}
              style={{
                position: "fixed",
                left: anchor.left + anchor.width / 2,
                top: anchor.top,
                zIndex: 5000,
                transform: "translate(-50%, calc(-100% - 8px))",
                ...(menuClassName ? {} : {
                  minWidth: Math.max(anchor.width, 112),
                  padding: 10,
                  border: "3px solid #050505",
                  borderRadius: 22,
                  background: "#ffffff",
                  boxShadow: "var(--otato-control-shadow, 3px 3px 0 #050505)",
                  gap: 8,
                  display: "grid",
                }),
              } as CSSProperties}
            >
              {(["site", "user"] as const).map((source) => (
                <button
                  key={source}
                  type="button"
                  role="menuitemradio"
                  aria-checked={activeSource === source}
                  onClick={() => {
                    onChoose(source);
                    setAnchor(null);
                  }}
                  disabled={saving}
                  className={[
                    optionClassName ?? "",
                    activeSource === source && optionActiveClassName ? optionActiveClassName : "",
                  ].join(" ")}
                  style={{
                    ...(optionClassName
                      ? {}
                      : {
                          display: "block",
                          width: "100%",
                          minHeight: 40,
                          border: "3px solid #050505",
                          borderRadius: "var(--otato-control-radius, 15px)",
                          background: activeSource === source ? "var(--otato-action, #ff4d3d)" : "#ffffff",
                          color: activeSource === source ? "#ffffff" : "#050505",
                          padding: "0 18px",
                          font: "inherit",
                          fontSize: 14,
                          fontWeight: 950,
                          lineHeight: 1,
                          whiteSpace: "nowrap",
                          cursor: saving ? "not-allowed" : "pointer",
                          boxShadow: "var(--otato-control-shadow, 3px 3px 0 #050505)",
                        }),
                  }}
                >
                  {LABELS[source]}
                </button>
              ))}
            </div>
          </>,
          document.body,
        )
      : null;

  const buttonStyle: CSSProperties = className
    ? hideChevron
      ? { backgroundImage: "none" }
      : {}
    : {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        height: 34,
        minWidth: 76,
        padding: "0 12px",
        border: "3px solid #050505",
        borderRadius: "15px",
        background: "#ffffff",
        backgroundClip: "padding-box",
        color: "#050505",
        boxShadow: "var(--otato-control-shadow, 3px 3px 0 #050505)",
        font: "inherit",
        fontSize: 12,
        fontWeight: 900,
        lineHeight: 1,
        letterSpacing: 0,
        whiteSpace: "nowrap",
        cursor: saving ? "not-allowed" : "pointer",
        transition:
          "var(--otato-control-transition, transform 160ms ease, box-shadow 160ms ease, border-color 140ms ease, background-color 140ms ease, color 140ms ease)",
        ...(hideChevron ? { backgroundImage: "none" } : {}),
      };

  return (
      <>
      <button
        type="button"
        className={className ?? ""}
        style={buttonStyle}
        onClick={(event) => {
          const nextAnchor = anchorFromElement(event.currentTarget);
          setAnchor((current) => (current ? null : nextAnchor));
        }}
        disabled={saving}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        title={ariaLabel}
      >
        {valueLabel}
      </button>
      {menu}
    </>
  );
}

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

export function ApiUsageModeToggle({
  module,
  className,
  hideChevron,
  menuClassName,
  backdropClassName,
  optionClassName,
  optionActiveClassName,
}: {
  module: keyof ApiUsageMode;
  className?: string;
  hideChevron?: boolean;
  menuClassName?: string;
  backdropClassName?: string;
  optionClassName?: string;
  optionActiveClassName?: string;
}) {
  const { apiUsageMode, setApiUsageMode } = useApiSettings();
  const [saving, setSaving] = useState(false);
  const value = apiUsageMode[module];

  async function choose(next: ApiUsageSource) {
    if (saving || next === value) return;
    setSaving(true);
    try {
      await setApiUsageMode({ [module]: next });
    } finally {
      setSaving(false);
    }
  }

  return (
    <ApiUsageDropdown
      valueLabel={LABELS[value]}
      activeSource={value}
      saving={saving}
      className={className}
      hideChevron={hideChevron}
      menuClassName={menuClassName}
      backdropClassName={backdropClassName}
      optionClassName={optionClassName}
      optionActiveClassName={optionActiveClassName}
      ariaLabel="选择 API 来源"
      onChoose={(source) => void choose(source)}
    />
  );
}

export function ApiUsageModeToggleAll({
  className,
  hideChevron,
  menuClassName,
  backdropClassName,
  optionClassName,
  optionActiveClassName,
}: {
  className?: string;
  hideChevron?: boolean;
  menuClassName?: string;
  backdropClassName?: string;
  optionClassName?: string;
  optionActiveClassName?: string;
}) {
  const { apiUsageMode, setApiUsageMode } = useApiSettings();
  const [saving, setSaving] = useState(false);
  const allSite = apiUsageMode.llm === "site" && apiUsageMode.image === "site" && apiUsageMode.video === "site";
  const allUser = apiUsageMode.llm === "user" && apiUsageMode.image === "user" && apiUsageMode.video === "user";
  const valueLabel = allSite ? LABELS.site : allUser ? LABELS.user : "混合 API";
  const activeSource = allSite ? "site" : allUser ? "user" : null;

  async function choose(next: ApiUsageSource) {
    if (saving || activeSource === next) return;
    setSaving(true);
    try {
      await setApiUsageMode({ llm: next, image: next, video: next });
    } finally {
      setSaving(false);
    }
  }

  return (
    <ApiUsageDropdown
      valueLabel={valueLabel}
      activeSource={activeSource}
      saving={saving}
      className={className}
      hideChevron={hideChevron}
      menuClassName={menuClassName}
      backdropClassName={backdropClassName}
      optionClassName={optionClassName}
      optionActiveClassName={optionActiveClassName}
      ariaLabel="选择 API 来源"
      onChoose={(source) => void choose(source)}
    />
  );
}
