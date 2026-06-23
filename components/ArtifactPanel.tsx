"use client";

import type { Artifact } from "@/lib/types";
import { STAGES, STAGE_LABELS } from "@/lib/types";
import { getProjectScriptAutoStageUserMessage } from "@/lib/project-script-auto-kickoff";
import type { PipelineProgress } from "@/lib/stage5-pipeline";
import { ApiUsageModeToggle } from "@/components/ApiUsageModeSwitch";
import StageGroup from "./StageGroup";
import shellStyles from "@/app/shared/shell.module.css";
import styles from "./artifact-panel.module.css";

interface Props {
  hasProject: boolean;
  artifacts: Artifact[];
  currentStage: number;
  /** 与顶部流程条联动：当前查看哪一阶段的产物（1–7） */
  viewStage: number;
  /** 上层会传入但本组件不再自管 chrome 折叠（保留以兼容签名） */
  collapsed?: boolean;
  onToggle?: () => void;
  /** 从最新一条助手回复重新解析并写入指定阶段产物 */
  onReExtractStage?: (stageId: number) => void;
  onArtifactUpsert?: (patch: Omit<Artifact, "updatedAt"> & { updatedAt?: string }) => void;
  onArtifactRemove?: (stage: number, subKey: string) => void;
  onArtifactRemoveSubtree?: (rootSubKey: string) => void;
  /** 代发当前 viewStage 的「自动开始」用户消息（与流程条原播放键一致） */
  onStartThisStage?: () => void;
  hasApiKey?: boolean;
  chatLoading?: boolean;
  pipelineProgress?: PipelineProgress | null;
  onPausePipeline?: () => void;
  onResumePipeline?: () => void;
}

function PipelineStrip({
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
  const stripClass = [
    shellStyles.pipelineStrip,
    isPaused ? shellStyles.pipelineStripPaused : "",
    isError ? shellStyles.pipelineStripError : "",
    isDone ? shellStyles.pipelineStripDone : "",
  ]
    .filter(Boolean)
    .join(" ");
  const text =
    progress.kind === "outline"
      ? isDone
        ? `全部 ${progress.total} 集大纲已生成`
        : isError
          ? progress.errorMessage || "大纲流水线出错"
          : isPaused
            ? `大纲已暂停（约第 ${progress.current} / ${progress.total} 集）`
            : `正在生成分集大纲（约第 ${progress.current} / ${progress.total} 集）…`
      : isDone
        ? `全部 ${progress.total} 集已生成`
        : isError
          ? progress.errorMessage || "流水线出错"
          : isPaused
            ? `已暂停（第 ${progress.current} / ${progress.total} 集）`
            : `正在写第 ${progress.current} / ${progress.total} 集…`;

  return (
    <div className={stripClass}>
      <span className={shellStyles.pipelineStripText}>{text}</span>
      <div className={shellStyles.pipelineStripBar} aria-hidden>
        <div
          className={shellStyles.pipelineStripBarFill}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      {isRunning && onPause ? (
        <button
          type="button"
          onClick={onPause}
          className={[shellStyles.button, shellStyles.buttonSubtle].join(" ")}
          style={{ height: 26, padding: "0 10px" }}
        >
          暂停
        </button>
      ) : null}
      {isPaused && onResume ? (
        <button
          type="button"
          onClick={onResume}
          className={[shellStyles.button, shellStyles.buttonSubtle].join(" ")}
          style={{ height: 26, padding: "0 10px" }}
        >
          继续
        </button>
      ) : null}
    </div>
  );
}

export default function ArtifactPanel({
  hasProject,
  artifacts,
  currentStage,
  viewStage,
  onReExtractStage,
  onArtifactUpsert,
  onArtifactRemove,
  onArtifactRemoveSubtree,
  onStartThisStage,
  hasApiKey = false,
  chatLoading = false,
  pipelineProgress,
  onPausePipeline,
  onResumePipeline,
}: Props) {
  const groupedByStage = (stageId: number) =>
    artifacts.filter((a) => a.stage === stageId);

  const viewStageSafe = Math.min(7, Math.max(1, viewStage)) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
  /** STAGE 6/7 由流水线自建 user 消息，不得依赖 project-script-auto-kickoff 文案是否存在，否则「连续大纲」会被误禁用 */
  const isPipelineKickoffStage = viewStageSafe === 6 || viewStageSafe === 7;
  const kickoffReady =
    isPipelineKickoffStage || Boolean(getProjectScriptAutoStageUserMessage(viewStageSafe)?.trim());
  const startDisabled =
    !hasProject || !hasApiKey || chatLoading || !kickoffReady || !onStartThisStage;
  const startLabel =
    viewStageSafe === 7
      ? "连续分集"
      : viewStageSafe === 6
        ? "连续大纲"
        : "开始本阶段";
  const startTitle = !hasApiKey
    ? "请先配置 LLM API（设置 → LLM API）"
    : chatLoading
      ? "对话生成中，请稍候"
      : !kickoffReady
        ? "本阶段暂无代发文案"
        : viewStageSafe === 6
          ? "按 STAGE 4 事件集数范围启动分集大纲自动流水线（多轮对话，每批一批集）"
          : viewStageSafe === 7
            ? "从当前进度起自动逐集生成分集剧本"
            : `代发一条用户消息，开始「${STAGE_LABELS[viewStageSafe] ?? ""}」模板交付`;

  const stageLabel = STAGE_LABELS[viewStage] ?? STAGES.find((st) => st.id === viewStage)?.label ?? "";
  const isActiveStage = currentStage === viewStage;
  const showPipeline =
    pipelineProgress &&
    (viewStageSafe === 6 || viewStageSafe === 7) &&
    ((pipelineProgress.kind === "outline" && viewStageSafe === 6) ||
      (pipelineProgress.kind === "episode" && viewStageSafe === 7) ||
      pipelineProgress.kind == null);

  return (
    <div className={styles.panel}>
      {/* Header：阶段徽章 + 标题 + 小字 与「开始」「重新记录」同一行；流水线条仍在下方 */}
      <div className={styles.header}>
        <div className={styles.headerRow}>
          <div className={styles.headerLabel}>
            <span
              className={[
                styles.stageBadge,
                isActiveStage ? styles.stageBadgeActive : "",
              ].join(" ")}
            >
              {viewStage}
            </span>
            <span className={styles.stageName}>{stageLabel}</span>
            <span className={shellStyles.helpText}>
              · {groupedByStage(viewStage).length > 0
                ? `${groupedByStage(viewStage).length} 项`
                : "可手写"}
            </span>
          </div>
          <div className={styles.headerActions}>
            {onReExtractStage ? (
              <button
                type="button"
                onClick={() => onReExtractStage(viewStage)}
                className={[shellStyles.button, shellStyles.buttonSubtle].join(" ")}
                title="从左上角对话最新一条助手回复重新解析并写入本阶段"
              >
                重新记录
              </button>
            ) : null}
            {onStartThisStage ? (
              <>
                <ApiUsageModeToggle module="llm" />
              <button
                type="button"
                onClick={() => onStartThisStage()}
                disabled={startDisabled || (isPipelineKickoffStage && pipelineProgress?.status === "running")}
                title={startTitle}
                className={[shellStyles.button, shellStyles.buttonPrimary].join(" ")}
              >
                {startLabel}
              </button>
              </>
            ) : null}
          </div>
        </div>

        {showPipeline && pipelineProgress ? (
          <div className={styles.pipelineWrap}>
            <PipelineStrip
              progress={pipelineProgress}
              onPause={onPausePipeline}
              onResume={onResumePipeline}
            />
          </div>
        ) : null}
      </div>

      {/* 当前阶段产物 */}
      <div className={styles.body}>
        {!hasProject ? (
          <div className={styles.empty}>
            <p>对话开始后，各阶段产物<br />将自动分类显示在此处</p>
          </div>
        ) : (
          <StageGroup
            key={viewStage}
            stageId={viewStage}
            artifacts={groupedByStage(viewStage)}
            onArtifactUpsert={onArtifactUpsert}
            onArtifactRemove={onArtifactRemove}
            onArtifactRemoveSubtree={onArtifactRemoveSubtree}
          />
        )}
      </div>
    </div>
  );
}
