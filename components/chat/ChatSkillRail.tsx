"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { skillPackDisplayLabel } from "@/lib/chat/skill-pack";
import type { SkillPackRecord } from "@/lib/chat/types";
import imageStyles from "@/app/image/image-page.module.css";
import railStyles from "./chat-side-rail.module.css";

/** 与 /image 左侧 mode 栏同结构：居中、渐变遮罩、纵向滑动 */
export function ChatSkillRail({
  skillPacks,
  selectedPackId,
  onSelectPack,
  skillSwitchDisabled = false,
}: {
  skillPacks: SkillPackRecord[];
  selectedPackId: string | null;
  onSelectPack: (packId: string | null) => void;
  skillSwitchDisabled?: boolean;
}) {
  const noneActive = selectedPackId === null;
  const itemCount = skillPacks.length === 0 ? 2 : skillPacks.length + 1;
  const faded = itemCount > 5;
  const visibleCount = Math.min(Math.max(itemCount, 1), 5);
  const railStyle = { "--rail-visible-count": visibleCount } as CSSProperties;

  return (
    <aside className={[imageStyles.modePanel, railStyles.presetPanel].join(" ")} aria-label="Skill">
      <div className={[imageStyles.modeColumn, railStyles.railColumn].join(" ")} style={railStyle}>
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
                    disabled={skillSwitchDisabled}
                    title="不使用 Skill"
                    onClick={() => onSelectPack(null)}
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

                  {skillPacks.map((p) => {
                    const active = selectedPackId === p.id;
                    const label = skillPackDisplayLabel(p);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        disabled={skillSwitchDisabled}
                        title={label}
                        onClick={() => onSelectPack(p.id)}
                        className={[
                          imageStyles.modeButton,
                          railStyles.railCard,
                          active ? [imageStyles.modeButtonActive, railStyles.railCardActive].join(" ") : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        <span className={[imageStyles.modeName, railStyles.railName].join(" ")}>{label}</span>
                      </button>
                    );
                  })}

                  {skillPacks.length === 0 ? (
                    <Link
                      href="/admin?tab=skillPacks"
                      className={[imageStyles.modeButton, railStyles.railCard].join(" ")}
                    >
                      <span className={[imageStyles.modeName, railStyles.railName].join(" ")}>添加 Skill</span>
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
