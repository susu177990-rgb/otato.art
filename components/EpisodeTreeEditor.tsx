"use client";

import { useEffect, useMemo, useState } from "react";
import type { Artifact } from "@/lib/types";
import ArtifactSlotEditor from "./ArtifactSlotEditor";

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
    <div className="space-y-3">
      <p className="text-[10px] leading-relaxed text-zinc-500">
        分集以 <span className="text-zinc-400">5 列卡片</span> 总览；每集为{" "}
        <span className="text-zinc-400">概述（epN）+ 正文（epN.body）</span>{" "}
        两块。点击卡片在弹窗中编辑；删除整集请在卡片上操作。
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
          className="rounded-lg border border-dashed border-zinc-700 bg-zinc-950/50 px-3 py-2 text-[11px] text-zinc-400 transition hover:border-indigo-600/50 hover:text-zinc-200"
        >
          添加第 1 集
        </button>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
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
          className="w-full rounded-lg border border-dashed border-zinc-700 py-2 text-[11px] text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
        >
          + 添加第 {nextEpisodeNum(stage5)} 集
        </button>
      ) : null}

      {modalEpKey ? (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="episode-modal-title"
        >
          <button
            type="button"
            className="fixed inset-0 bg-zinc-950/75 backdrop-blur-[2px]"
            aria-label="关闭弹窗"
            onClick={() => setModalEpKey(null)}
          />
          <div className="relative z-10 my-auto w-full max-w-4xl rounded-xl border border-zinc-700/90 bg-zinc-900 shadow-2xl shadow-black/50">
            <div className="flex items-center justify-between gap-2 border-b border-zinc-800 px-4 py-3">
              <h2 id="episode-modal-title" className="truncate text-sm font-semibold text-zinc-100">
                {epLabel(
                  stage5.find((a) => a.subKey === modalEpKey && !a.parentKey),
                  modalEpKey
                )}
              </h2>
              <button
                type="button"
                onClick={() => setModalEpKey(null)}
                className="shrink-0 rounded-md px-3 py-1.5 text-[11px] font-medium text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-100"
              >
                关闭
              </button>
            </div>
            <div className="max-h-[min(85vh,880px)] overflow-y-auto p-3 sm:p-4">
              <EpisodeBlock
                epKey={modalEpKey}
                all={stage5}
                onUpsert={onUpsert}
              />
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
    <div className="group relative flex min-h-[5.5rem] flex-col rounded-lg border border-zinc-800/90 bg-zinc-950/60 p-2.5 shadow-sm transition hover:border-indigo-500/45 hover:bg-zinc-900/50">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-h-0 flex-1 flex-col text-left"
      >
        <span className="line-clamp-2 text-[12px] font-semibold leading-snug text-zinc-100">{lab}</span>
        <span className="mt-1.5 line-clamp-3 flex-1 text-[10px] leading-relaxed text-zinc-500">{excerpt}</span>
        <span className="mt-2 flex items-center justify-between gap-1 border-t border-zinc-800/60 pt-1.5 text-[9px] text-zinc-600">
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
        className="absolute right-1.5 top-1.5 rounded px-1.5 py-0.5 text-[9px] text-zinc-600 opacity-0 transition hover:bg-rose-950/50 hover:text-rose-400 group-hover:opacity-100"
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
    <div className="rounded-lg border border-zinc-800/50 bg-zinc-950/20">
      <div className="space-y-2 p-2">
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
          <div className="space-y-1.5 pt-1">
            <p className="text-[9px] uppercase tracking-wide text-zinc-600">
              其他块（旧版解析产物等，可删改）
            </p>
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
