"use client";

import imageStyles from "@/app/image/image-page.module.css";
import railStyles from "./chat-side-rail.module.css";

export function ChatPromptPresetRail({
  selectedPresetTitle,
  onOpenLibrary,
  onClearPreset,
  switchDisabled = false,
}: {
  selectedPresetTitle: string | null;
  onOpenLibrary: () => void;
  onClearPreset: () => void;
  switchDisabled?: boolean;
}) {
  return (
    <aside className={[imageStyles.modePanel, railStyles.presetPanel].join(" ")} aria-label="对话提示词预设">
      <div className={[imageStyles.modeColumn, railStyles.railColumn].join(" ")}>
        <div className={[imageStyles.modeRail, railStyles.railRail].join(" ")}>
          <div className={[imageStyles.modeRailFrame, railStyles.railRailFrame].join(" ")}>
            <div className={[imageStyles.modeScrollWrap, railStyles.railScrollWrap].join(" ")}>
              <div className={[imageStyles.modeScroll, railStyles.railScroll].join(" ")}>
                <div className={[imageStyles.modeList, railStyles.railList].join(" ")}>
                  <button
                    type="button"
                    disabled={switchDisabled}
                    title="打开对话提示词预设"
                    onClick={onOpenLibrary}
                    className={[imageStyles.modeButton, railStyles.railCard, selectedPresetTitle ? [imageStyles.modeButtonActive, railStyles.railCardActive].join(" ") : ""]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <span className={[imageStyles.modeName, railStyles.railName].join(" ")}>
                      {selectedPresetTitle ?? "选预设"}
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={switchDisabled}
                    title="不使用对话提示词预设"
                    onClick={onClearPreset}
                    className={[imageStyles.modeButton, railStyles.railCard, !selectedPresetTitle ? [imageStyles.modeButtonActive, railStyles.railCardActive].join(" ") : ""]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <span className={[imageStyles.modeName, railStyles.railName].join(" ")}>无预设</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
