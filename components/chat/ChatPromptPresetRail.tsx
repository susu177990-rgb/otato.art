"use client";

import imageStyles from "@/app/image/image-page.module.css";
import type { SitePromptPreset } from "@/lib/db/prompt-preset-store";
import railStyles from "./chat-side-rail.module.css";

export function ChatPromptPresetRail({
  favoritePresets,
  selectedPresetId,
  onSelectPreset,
  switchDisabled = false,
}: {
  favoritePresets: SitePromptPreset[];
  selectedPresetId: string | null;
  onSelectPreset: (presetId: string) => void;
  switchDisabled?: boolean;
}) {
  const faded = favoritePresets.length > 7;

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
                  {favoritePresets.length === 0 ? (
                    <div className={[imageStyles.emptyRail, railStyles.railCard].join(" ")}>暂无预设</div>
                  ) : (
                    favoritePresets.map((preset) => {
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
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
