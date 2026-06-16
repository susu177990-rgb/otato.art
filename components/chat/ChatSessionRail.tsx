"use client";

import type { ChatConversationSummary } from "@/lib/chat/types";
import imageStyles from "@/app/image/image-page.module.css";
import type { CSSProperties } from "react";
import railStyles from "./chat-side-rail.module.css";
import styles from "./chat-session-rail.module.css";

function PencilIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 与 /image 右侧 history 栏同结构：居中、渐变遮罩、纵向滑动 */
export function ChatSessionRail({
  summaries,
  activeId,
  renamingId,
  renameDraft,
  onRenameDraftChange,
  onSelect,
  onNew,
  onStartRename,
  onCommitRename,
  onDelete,
}: {
  summaries: ChatConversationSummary[];
  activeId: string | null;
  renamingId: string | null;
  renameDraft: string;
  onRenameDraftChange: (value: string) => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onStartRename: (id: string, title: string) => void;
  onCommitRename: () => void;
  onDelete: (id: string) => void;
}) {
  const items = [{ kind: "new" as const, id: "__new__" }, ...summaries.map((s) => ({ kind: "session" as const, session: s }))];
  const faded = items.length > 5;
  const visibleCount = Math.min(Math.max(items.length, 1), 5);
  const railStyle = { "--rail-visible-count": visibleCount } as CSSProperties;

  return (
    <aside className={[imageStyles.historyPanel, railStyles.sessionPanel].join(" ")} aria-label="会话">
      <div className={[imageStyles.modeColumn, railStyles.railColumn].join(" ")} style={railStyle}>
        <div className={[imageStyles.modeRail, railStyles.railRail].join(" ")}>
          <div className={[imageStyles.modeRailFrame, railStyles.railRailFrame].join(" ")}>
            <div className={imageStyles.railLabel}>聊天记录</div>
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
                  {items.map((item) => {
                    if (item.kind === "new") {
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className={[imageStyles.modeButton, railStyles.railCard].filter(Boolean).join(" ")}
                          onClick={() => onNew()}
                        >
                          <span className={[imageStyles.modeName, railStyles.railName].join(" ")}>新建</span>
                        </button>
                      );
                    }

                    const s = item.session;
                    const active = s.id === activeId;
                    const renaming = renamingId === s.id;
                    const title = s.title.trim() || "新对话";

                    return (
                      <div key={s.id} className={styles.sessionRow}>
                        {renaming ? (
                          <input
                            className={[imageStyles.modeButton, railStyles.railCard, styles.renameInput].join(" ")}
                            value={renameDraft}
                            onChange={(e) => onRenameDraftChange(e.target.value)}
                            onBlur={() => onCommitRename()}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") onCommitRename();
                              if (e.key === "Escape") onCommitRename();
                            }}
                            autoFocus
                            aria-label="重命名会话"
                          />
                        ) : (
                          <>
                            <button
                              type="button"
                              title={title}
                              onClick={() => onSelect(s.id)}
                              onDoubleClick={() => onStartRename(s.id, s.title)}
                              className={[
                                imageStyles.modeButton,
                                railStyles.railCard,
                                styles.sessionBtn,
                                active
                                  ? [imageStyles.modeButtonActive, railStyles.railCardActive].join(" ")
                                  : "",
                              ]
                                .filter(Boolean)
                                .join(" ")}
                            >
                              <span className={[imageStyles.modeName, railStyles.railName].join(" ")}>{title}</span>
                            </button>
                            <button
                              type="button"
                              className={styles.renameBtn}
                              aria-label="重命名"
                              onClick={(e) => {
                                e.stopPropagation();
                                onStartRename(s.id, s.title);
                              }}
                            >
                              <PencilIcon />
                            </button>
                            <button
                              type="button"
                              className={styles.deleteBtn}
                              aria-label="删除"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDelete(s.id);
                              }}
                            >
                              ×
                            </button>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
