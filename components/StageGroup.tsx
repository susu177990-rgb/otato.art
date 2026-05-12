"use client";

import type { Artifact } from "@/lib/types";
import type { PipelineProgress } from "@/lib/stage5-pipeline";
import StageFlatManual from "./StageFlatManual";
import EpisodeTreeEditor from "./EpisodeTreeEditor";

interface Props {
  stageId: number;
  stageLabel: string;
  artifacts: Artifact[];
  isActive: boolean;
  onReExtractStage?: (stageId: number) => void;
  onArtifactUpsert?: (patch: Omit<Artifact, "updatedAt"> & { updatedAt?: string }) => void;
  onArtifactRemove?: (stage: number, subKey: string) => void;
  onArtifactRemoveSubtree?: (rootSubKey: string) => void;
  /** 代发本阶段「自动开始」文案；不传则不显示按钮 */
  onStartThisStage?: () => void;
  startThisStageDisabled?: boolean;
  startThisStageTitle?: string;
  pipelineProgress?: PipelineProgress | null;
  onPausePipeline?: () => void;
  onResumePipeline?: () => void;
}

/** 避免 STAGE6 与 STAGE7 共用同一 state 时，在错误阶段也渲染同一条进度条（视觉「重合」） */
function pipelineProgressMatchesStage(stageId: number, p: PipelineProgress): boolean {
  if (p.kind === "outline") return stageId === 6;
  if (p.kind === "episode") return stageId === 7;
  return stageId === 6 || stageId === 7;
}

function PipelineProgressBar({
  progress,
  onPause,
  onResume,
}: {
  progress: PipelineProgress;
  onPause?: () => void;
  onResume?: () => void;
}) {
  const pct = progress.total > 0 ? (progress.current / progress.total) * 100 : 0;
  const isRunning = progress.status === "running";
  const isPaused = progress.status === "paused";
  const isDone = progress.status === "done";
  const isError = progress.status === "error";

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/80 p-2.5">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-zinc-300">
          {progress.kind === "outline"
            ? isDone
              ? `全部 ${progress.total} 集大纲已生成`
              : isError
                ? progress.errorMessage || "大纲流水线出错"
                : isPaused
                  ? `大纲已暂停（进度约第 ${progress.current} / ${progress.total} 集）`
                  : `正在生成分集大纲（约第 ${progress.current} / ${progress.total} 集）…`
            : isDone
              ? `全部 ${progress.total} 集已生成`
              : isError
                ? progress.errorMessage || "流水线出错"
                : isPaused
                  ? `已暂停（第 ${progress.current} / ${progress.total} 集）`
                  : `正在写第 ${progress.current} / ${progress.total} 集…`}
        </span>
        <div className="flex gap-1">
          {isRunning && onPause && (
            <button
              type="button"
              onClick={onPause}
              className="rounded px-2 py-0.5 text-[10px] font-medium text-amber-400 transition hover:bg-amber-950/50"
            >
              暂停
            </button>
          )}
          {isPaused && onResume && (
            <button
              type="button"
              onClick={onResume}
              className="rounded px-2 py-0.5 text-[10px] font-medium text-indigo-400 transition hover:bg-indigo-950/50"
            >
              继续
            </button>
          )}
        </div>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            isDone
              ? "bg-emerald-500"
              : isError
                ? "bg-rose-500"
                : isPaused
                  ? "bg-amber-500"
                  : "bg-indigo-500"
          }`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  );
}

export default function StageGroup({
  stageId,
  stageLabel,
  artifacts,
  isActive,
  onReExtractStage,
  onArtifactUpsert,
  onArtifactRemove,
  onArtifactRemoveSubtree,
  onStartThisStage,
  startThisStageDisabled,
  startThisStageTitle,
  pipelineProgress,
  onPausePipeline,
  onResumePipeline,
}: Props) {
  const isEpisodes = stageId === 7;
  const isOutlines = stageId === 6;
  const isPipelineStage = isEpisodes || isOutlines;

  return (
    <div className="space-y-2">
      <div className="flex w-full items-center gap-1.5 py-1">
        <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-bold ${
                isActive ? "bg-indigo-600 text-white" : "bg-zinc-800 text-zinc-500"
              }`}
            >
              {stageId}
            </span>
            <div className="flex min-w-0 items-center gap-1.5">
              <span className={`truncate text-sm font-medium ${isActive ? "text-zinc-100" : "text-zinc-400"}`}>
                {stageLabel}
              </span>
              {onStartThisStage ? (
                <button
                  type="button"
                  disabled={startThisStageDisabled || (isPipelineStage && pipelineProgress?.status === "running")}
                  title={startThisStageTitle}
                  onClick={() => onStartThisStage()}
                  className="shrink-0 rounded-md bg-indigo-600 px-1.5 py-0.5 text-[10px] font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isEpisodes ? "连续分集" : isOutlines ? "连续大纲" : "开始"}
                </button>
              ) : null}
            </div>
          </div>
          <span className="shrink-0 text-[10px] text-zinc-600">
            {artifacts.length > 0 ? `${artifacts.length} 项` : "可手写"}
          </span>
        </div>
        {onReExtractStage ? (
          <button
            type="button"
            title="从左侧最新一条助手回复重新解析并写入本阶段"
            className="shrink-0 rounded-md px-2 py-1 text-[10px] font-medium text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
            onClick={() => onReExtractStage(stageId)}
          >
            重新记录
          </button>
        ) : null}
      </div>

      <div className="space-y-2">
        <p className="text-[10px] leading-relaxed text-zinc-500">
          {isEpisodes
            ? "分集为卡片总览（大屏 5 列），每集「概述 + 正文」双槽；点卡片在弹窗编辑；左侧解析落入 epN / epN.body。"
            : stageId === 5
              ? "仅三块：在对应 ∆ 分类正文里用 @名称 登记即可；自动记录会落入这三栏，无需逐条拆成子卡片。"
              : stageId === 6
                ? "逐集大纲：∆资产 → 开头钩子 → 本集剧情 → 结尾悬念；每集一块，自动记录落入对应集。"
                : "下方槽位与工程验收项一致；可直接粘贴左侧助手输出，或点「重新记录」自动抓取。"}
        </p>

        {isPipelineStage &&
          pipelineProgress &&
          pipelineProgressMatchesStage(stageId, pipelineProgress) && (
          <PipelineProgressBar
            progress={pipelineProgress}
            onPause={onPausePipeline}
            onResume={onResumePipeline}
          />
        )}

        {onArtifactUpsert && onArtifactRemove && onArtifactRemoveSubtree ? (
          isEpisodes ? (
            <EpisodeTreeEditor
              artifacts={artifacts}
              onUpsert={onArtifactUpsert}
              onRemoveSubtree={onArtifactRemoveSubtree}
            />
          ) : (
            <StageFlatManual
              stageId={stageId}
              artifacts={artifacts}
              onUpsert={onArtifactUpsert}
              onRemove={onArtifactRemove}
            />
          )
        ) : null}
      </div>
    </div>
  );
}
