"use client";

import Link from "next/link";
import type { SitePromptPreset } from "@/lib/db/prompt-preset-store";
import imageStyles from "@/app/image/image-page.module.css";
import railStyles from "./chat-side-rail.module.css";

export function ChatPromptPresetRail({
  presets,
  selectedPresetId,
  onSelectPreset,
  switchDisabled = false,
}: {
  presets: SitePromptPreset[];
  selectedPresetId: string | null;
  onSelectPreset: (presetId: string | null) => void;
  switchDisabled?: boolean;
}) {
  const noneActive = selectedPresetId === null;
  const faded = presets.length + 1 > 7;

  return (
    <aside className={[imageStyles.modePanel, railStyles.presetPanel].join(" ")} aria-label="对话提示词预设">
      <div className={[imageStyles.modeColumn, railStyles.railColumn].join(" ")}>
        <div className={[imageStyles.modeRail, railStyles.railRail].join(" ")}>
          <div className={[imageStyles.modeRailFrame, railStyles.railRailFrame].join(" ")}>
            <div
              className={[
                imageStyles.modeScrollWrap,
                railStyles.railScrollWrap,
                faded ? imageStyles.modeScrollWrapFaded : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <div className={[imageStyles.modeScroll, railStyles.railScroll].join(" ")}>
                <div className={[imageStyles.modeList, railStyles.railList].join(" ")}>
                  <button
                    type="button"
                    disabled={switchDisabled}
                    title="不使用对话提示词预设"
                    onClick={() => onSelectPreset(null)}
                    className={[
                      imageStyles.modeButton,
                      railStyles.railCard,
                      noneActive ? [imageStyles.modeButtonActive, railStyles.railCardActive].join(" ") : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <span className={[imageStyles.modeName, railStyles.railName].join(" ")}>无</span>
                  </button>

                  {presets.map((preset) => {
                    const active = selectedPresetId === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        disabled={switchDisabled}
                        title={preset.title}
                        onClick={() => onSelectPreset(preset.id)}
                        className={[
                          imageStyles.modeButton,
                          railStyles.railCard,
                          active ? [imageStyles.modeButtonActive, railStyles.railCardActive].join(" ") : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        <span className={[imageStyles.modeName, railStyles.railName].join(" ")}>{preset.title}</span>
                      </button>
                    );
                  })}

                  {presets.length === 0 ? (
                    <Link
                      href="/settings?tab=chatPrompts"
                      className={[imageStyles.modeButton, railStyles.railCard].join(" ")}
                    >
                      <span className={[imageStyles.modeName, railStyles.railName].join(" ")}>添加预设</span>
                    </Link>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
