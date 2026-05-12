"use client";

import { useState } from "react";
import type { Artifact } from "@/lib/types";
import { STAGES, STAGE_LABELS } from "@/lib/types";
import { evaluateStageGate } from "@/lib/stage-gate";

interface Props {
  artifacts: Artifact[];
  currentStage: number;
  /** 产物面板当前展示的阶段，与左侧 ArtifactPanel 联动 */
  viewStage: number;
  onViewStageChange: (stage: number) => void;
  maxApprovedStage: number;
  gateOverrideNote: string;
  /** 未达标仍标记（人工）；达标时由页面自动提升「已验至」 */
  onGateOverrideMark: (overrideNote?: string) => void | Promise<void>;
  /** 项目总集数（从 meta 解析），用于精确 Gate 校验 */
  episodeCount?: number;
}

function gateStatusClass(ok: boolean, hasItems: boolean): string {
  if (!hasItems) return "bg-zinc-700";
  return ok ? "bg-emerald-500" : "bg-amber-500";
}

export default function StudioProcessRail({
  artifacts,
  currentStage,
  viewStage,
  onViewStageChange,
  maxApprovedStage,
  gateOverrideNote,
  onGateOverrideMark,
  episodeCount,
}: Props) {
  const [expandedStage, setExpandedStage] = useState<number | null>(1);

  const approvedShort =
    maxApprovedStage >= 1 && maxApprovedStage <= 7
      ? STAGES.find((s) => s.id === maxApprovedStage)?.label ?? "—"
      : "—";

  function handleStageClick(stage: number) {
    onViewStageChange(stage);
    setExpandedStage((prev) => (prev === stage ? null : stage));
  }

  return (
    <aside
      className="flex h-full w-[168px] shrink-0 flex-col border-l border-zinc-800 bg-zinc-950/95"
      aria-label="全流程控制"
    >
      <div className="shrink-0 border-b border-zinc-800/80 px-2 py-2 text-center">
        <p className="text-[9px] font-semibold uppercase tracking-wide text-zinc-500">流程</p>
        <p className="mt-1 text-[10px] leading-tight text-zinc-400" title="工程侧已验收的最高阶段">
          已验至
          <span className="mt-0.5 block font-medium text-zinc-200">{approvedShort}</span>
        </p>
        {gateOverrideNote ? (
          <p className="mt-1 line-clamp-2 text-[8px] text-amber-200/80" title={gateOverrideNote}>
            override
          </p>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 py-2">
        {STAGES.map((s) => {
          const stage = s.id as 1 | 2 | 3 | 4 | 5 | 6 | 7;
          const g = evaluateStageGate(stage, artifacts, episodeCount ? { episodeCount } : undefined);
          const hasItems = g.items.length > 0;
          const longLabel = STAGE_LABELS[stage] || `阶段 ${stage}`;
          const viewingHere = viewStage === stage;
          const inferredHere = currentStage === stage;
          const open = expandedStage === stage;

          return (
            <div
              key={stage}
              className={`rounded-md border transition-colors ${
                open
                  ? "border-indigo-500/50 bg-indigo-950/20"
                  : viewingHere
                    ? "border-indigo-500/35 bg-indigo-950/15"
                    : "border-zinc-800/80 bg-zinc-900/35"
              }`}
            >
              <button
                type="button"
                onClick={() => handleStageClick(stage)}
                className="flex w-full items-start gap-1 px-1.5 py-1.5 text-left"
                title={`${longLabel}：${hasItems ? (g.ok ? "Gate 通过" : "Gate 未全过") : "暂无清单"}。点击查看验收项`}
              >
                <span
                  className={`min-w-0 flex-1 text-[11px] font-semibold leading-tight ${
                    viewingHere ? "text-indigo-100" : inferredHere ? "text-zinc-200" : "text-zinc-400"
                  }`}
                >
                  {s.label}
                </span>
                <span
                  className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${gateStatusClass(g.ok, hasItems)}`}
                  aria-hidden
                />
                <svg
                  className={`mt-0.5 h-3 w-3 shrink-0 text-zinc-500 transition-transform ${
                    open ? "rotate-180" : ""
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {open ? (
                <div className="border-t border-zinc-800/70 px-1.5 pb-2 pt-1">
                  {hasItems ? (
                    <>
                      <p className="mb-1 px-0.5 text-[8px] font-medium uppercase tracking-wide text-zinc-600">
                        本阶段 Gate
                      </p>
                      <ul className="space-y-1.5">
                        {g.items.map((item) => (
                          <li key={item.id} className="text-[9px] leading-snug">
                            <div className="flex gap-1">
                              <span
                                className={`shrink-0 font-mono ${
                                  item.pass ? "text-emerald-400" : item.optional ? "text-zinc-500" : "text-amber-400"
                                }`}
                                title={item.pass ? "已满足" : "未满足"}
                              >
                                {item.pass ? "✓" : item.optional ? "○" : "!"}
                              </span>
                              <span className="min-w-0 text-zinc-300">
                                {item.label}
                                {item.optional ? (
                                  <span className="text-zinc-600">（可选）</span>
                                ) : null}
                              </span>
                            </div>
                            {!item.pass && item.hint ? (
                              <p className="mt-0.5 pl-4 text-[8px] leading-relaxed text-zinc-600">{item.hint}</p>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}

                  {currentStage >= 1 && currentStage <= 7 && stage !== currentStage ? (
                    <p className="mb-1.5 mt-2 text-[8px] leading-relaxed text-zinc-600">
                      人工「未达标仍标」针对左侧对话推断阶段「
                      {STAGES.find((x) => x.id === currentStage)?.label ?? currentStage}
                      」。请展开该项再操作。
                    </p>
                  ) : null}

                  <div
                    className={`flex flex-col gap-1 ${hasItems ? "mt-2 border-t border-zinc-800/60 pt-2" : "mt-1"}`}
                  >
                    <p className="text-[8px] font-medium text-zinc-600">未达标时</p>
                    <button
                      type="button"
                      disabled={currentStage < 1 || (currentStage >= 1 && currentStage <= 7 && stage !== currentStage)}
                      onClick={() => {
                        const note = window.prompt(
                          "未达标仍标记：请填写原因（将写入工程记录）",
                          gateOverrideNote || ""
                        );
                        if (note === null) return;
                        void onGateOverrideMark(note);
                      }}
                      className="rounded bg-zinc-800 px-1 py-1 text-[9px] leading-tight text-zinc-300 disabled:cursor-not-allowed disabled:opacity-40"
                      title={
                        stage !== currentStage && currentStage >= 1
                          ? "请展开与当前对话阶段一致的流程块"
                          : "Gate 未通过时仍将工程标为已验到此阶段（需填写原因）；达标时「已验至」会自动提升"
                      }
                    >
                      未达标仍标
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
