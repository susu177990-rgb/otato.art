"use client";

import { useEffect, useMemo, useState } from "react";
import type { Artifact } from "@/lib/types";
import ArtifactSlotEditor from "./ArtifactSlotEditor";
import shellStyles from "@/app/shared/shell.module.css";
import styles from "./episode-tree-editor.module.css";

interface Props {
  artifacts: Artifact[];
  onUpsert: (patch: Omit<Artifact, "updatedAt"> & { updatedAt?: string }) => void;
  onRemoveSubtree: (rootSubKey: string) => void;
}

function isEpisodeRoot(a: Artifact): boolean {
  return !a.parentKey && (/^ep\d+$/u.test(a.subKey) || a.subKey === "ep_placeholder");
}

function epNumFromKey(epKey: string): number {
  if (epKey === "ep_placeholder") return 0;
  return parseInt(epKey.replace(/\D/g, ""), 10) || 0;
}

function nextEpisodeNum(all: Artifact[]): number {
  let max = 0;
  for (const a of all) {
    if (isEpisodeRoot(a)) {
      max = Math.max(max, epNumFromKey(a.subKey));
    }
  }
  return max + 1;
}

function epLabel(overview: Artifact | undefined, epKey: string): string {
  const fromOverview = overview?.label?.replace(/\s*-\s*场次.*/u, "").trim();
  if (fromOverview) return fromOverview;
  if (epKey === "ep_placeholder") return "第?集（占位）";
  return `第${epNumFromKey(epKey)}集`;
}

/** 卡片摘要：优先「本集剧情核心」一行 */
function episodeCardExcerpt(overviewText: string, maxLen: number): string {
  const core = overviewText.match(/本集剧情核心\s*[：:]\s*([^\n]+)/u)?.[1]?.trim() ?? "";
  if (core) return core.length <= maxLen ? core : `${core.slice(0, maxLen)}…`;
  const t = overviewText
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*?|__|`/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (t.length <= maxLen) return t || "（暂无概述）";
  return `${t.slice(0, maxLen)}…`;
}

export default function EpisodeTreeEditor({ artifacts, onUpsert, onRemoveSubtree }: Props) {
  const stage5 = useMemo(() => artifacts.filter((a) => a.stage === 7), [artifacts]);
  const [modalEpKey, setModalEpKey] = useState<string | null>(null);

  const epKeys = useMemo(() => {
    const s = new Set<string>();
    for (const a of stage5) {
      if (isEpisodeRoot(a)) s.add(a.subKey);
    }
    return Array.from(s).sort((a, b) => epNumFromKey(a) - epNumFromKey(b));
  }, [stage5]);

  useEffect(() => {
    if (!modalEpKey) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModalEpKey(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalEpKey]);

  return (
    <div className={styles.outer}>
      <p className={shellStyles.helpText} style={{ lineHeight: 1.6 }}>
        分集以 5 列卡片总览；每集为「概述（epN）+ 正文（epN.body）」两块。点击卡片在弹窗中编辑；删除整集请在卡片上操作。
      </p>

      {epKeys.length === 0 ? (
        <button
          type="button"
          onClick={() =>
            onUpsert({
              stage: 7,
              subKey: "ep1",
              label: "第1集",
              content: "",
            })
          }
          className={styles.firstAddButton}
        >
          添加第 1 集
        </button>
      ) : (
        <div className={styles.grid}>
          {epKeys.map((epKey) => (
            <EpisodeCard
              key={epKey}
              epKey={epKey}
              all={stage5}
              onOpen={() => setModalEpKey(epKey)}
              onRemove={() => {
                const overview = stage5.find((a) => a.subKey === epKey && !a.parentKey);
                const lab = epLabel(overview, epKey);
                if (confirm(`删除「${lab}」及其正文与关联块？`)) {
                  onRemoveSubtree(epKey);
                  setModalEpKey((k) => (k === epKey ? null : k));
                }
              }}
            />
          ))}
        </div>
      )}

      {epKeys.length > 0 ? (
        <button
          type="button"
          onClick={() => {
            const n = nextEpisodeNum(stage5);
            onUpsert({
              stage: 7,
              subKey: `ep${n}`,
              label: `第${n}集`,
              content: "",
            });
          }}
          className={styles.addButton}
        >
          + 添加第 {nextEpisodeNum(stage5)} 集
        </button>
      ) : null}

      {modalEpKey ? (
        <div
          className={shellStyles.modalScrim}
          role="dialog"
          aria-modal="true"
          aria-labelledby="episode-modal-title"
          onClick={() => setModalEpKey(null)}
        >
          <div
            className={shellStyles.modalCard}
            style={{ maxWidth: 880 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={shellStyles.modalHead}>
              <h2 id="episode-modal-title" className={shellStyles.modalTitle}>
                {epLabel(
                  stage5.find((a) => a.subKey === modalEpKey && !a.parentKey),
                  modalEpKey
                )}
              </h2>
              <button
                type="button"
                onClick={() => setModalEpKey(null)}
                className={[shellStyles.button, shellStyles.buttonSubtle].join(" ")}
              >
                关闭
              </button>
            </div>
            <div className={styles.modalBody}>
              <EpisodeBlock epKey={modalEpKey} all={stage5} onUpsert={onUpsert} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function EpisodeCard({
  epKey,
  all,
  onOpen,
  onRemove,
}: {
  epKey: string;
  all: Artifact[];
  onOpen: () => void;
  onRemove: () => void;
}) {
  const overview = all.find((a) => a.subKey === epKey && !a.parentKey);
  const body = all.find((a) => a.subKey === `${epKey}.body`);
  const lab = epLabel(overview, epKey);
  const excerpt = episodeCardExcerpt(overview?.content ?? "", 100);
  const oChars = (overview?.content ?? "").length;
  const bChars = (body?.content ?? "").length;

  return (
    <div className={styles.card}>
      <button type="button" onClick={onOpen} className={styles.cardOpen}>
        <span className={styles.cardTitle}>{lab}</span>
        <span className={styles.cardExcerpt}>{excerpt}</span>
        <span className={styles.cardMeta}>
          <span>
            概述 {oChars > 0 ? `${oChars} 字` : "—"} · 正文 {bChars > 0 ? `${bChars} 字` : "—"}
          </span>
        </span>
      </button>
      <button
        type="button"
        title="删除本集"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className={styles.cardDelete}
      >
        删除
      </button>
    </div>
  );
}

function EpisodeBlock({
  epKey,
  all,
  onUpsert,
}: {
  epKey: string;
  all: Artifact[];
  onUpsert: Props["onUpsert"];
}) {
  const overview = all.find((a) => a.subKey === epKey && !a.parentKey);
  const direct = all.filter((a) => a.parentKey === epKey);
  const extras = direct.filter(
    (a) => a.subKey !== `${epKey}.body` && !/^ep\d+\.scene\d+$/u.test(a.subKey)
  );
  const epLab = epLabel(overview, epKey);
  const bodyArt = all.find((a) => a.subKey === `${epKey}.body`);

  return (
    <div className={styles.block}>
      <div className={styles.blockInner}>
        <ArtifactSlotEditor
          label={`${epLab} · 概述（头信息 / epN）`}
          value={overview?.content ?? ""}
          compact
          rows={8}
          textareaClassName="min-h-[min(12rem,28vh)]"
          onCommit={(content) =>
            onUpsert({
              stage: 7,
              subKey: epKey,
              label: epLab,
              content,
            })
          }
        />

        <ArtifactSlotEditor
          label={`${epLab} · 正文（时间线叙事 / epN.body）`}
          value={bodyArt?.content ?? ""}
          compact
          rows={14}
          textareaClassName="min-h-[min(18rem,40vh)]"
          onCommit={(content) =>
            onUpsert({
              stage: 7,
              subKey: `${epKey}.body`,
              parentKey: epKey,
              label: `${epLab} - 正文`,
              content,
            })
          }
        />

        {extras.length > 0 ? (
          <div className={styles.extras}>
            <p className={styles.extrasTitle}>其他块（旧版解析产物等，可删改）</p>
            {extras.map((a) => (
              <ArtifactSlotEditor
                key={a.subKey}
                label={a.label}
                value={a.content}
                compact
                rows={4}
                onCommit={(content) =>
                  onUpsert({
                    stage: 7,
                    subKey: a.subKey,
                    parentKey: a.parentKey,
                    label: a.label,
                    content,
                  })
                }
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
