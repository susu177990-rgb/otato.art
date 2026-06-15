"use client";

import type { Artifact } from "@/lib/types";
import { STAGES, STAGE_LABELS } from "@/lib/types";
import { evaluateStageGate } from "@/lib/stage-gate";
import shellStyles from "@/app/shared/shell.module.css";

interface Props {
  artifacts: Artifact[];
  /** 由对话内容推断出来的当前阶段（1–7） */
  currentStage: number;
  /** 主区当前查看哪一阶段；点 tile 默认会同步到这里 */
  viewStage: number;
  onViewStageChange: (stage: number) => void;
  /** 项目总集数（从 meta 解析），用于精确 Gate 校验 */
  episodeCount?: number;
}

type StageId = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export default function StudioStageStrip({
  artifacts,
  currentStage,
  viewStage,
  onViewStageChange,
  episodeCount,
}: Props) {
  function handleTileClick(stage: StageId) {
    onViewStageChange(stage);
  }

  return (
    <div className={shellStyles.stageStrip} aria-label="全流程进度">
      {STAGES.map((s) => {
        const stage = s.id as StageId;
        const g = evaluateStageGate(
          stage,
          artifacts,
          episodeCount ? { episodeCount } : undefined
        );
        const totalItems = g.items.filter((i) => !i.optional).length;
        const passedItems = g.items.filter((i) => i.pass && !i.optional).length;
        const hasItems = totalItems > 0;
        const viewingHere = viewStage === stage;
        const inferredHere = currentStage === stage;
        const statusClass = !hasItems
          ? shellStyles.stageStripTileEmpty
          : g.ok
            ? shellStyles.stageStripTileComplete
            : shellStyles.stageStripTileNeedsWork;
        const tileClass = [
          shellStyles.stageStripTile,
          statusClass,
          viewingHere ? shellStyles.stageStripTileActive : "",
          !viewingHere && inferredHere ? shellStyles.stageStripTileInferred : "",
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <button
            key={stage}
            type="button"
            onClick={() => handleTileClick(stage)}
            className={tileClass}
            title={`${STAGE_LABELS[stage]}：${
              hasItems ? (g.ok ? "Gate 通过" : `${passedItems}/${totalItems} 项已达`) : "暂无清单"
            }`}
          >
            <span className={shellStyles.stageStripIndex}>{stage}</span>
            <span>{s.label}</span>
            {hasItems ? (
              <span className={shellStyles.stageStripCount}>
                {passedItems}/{totalItems}
              </span>
            ) : null}
            <span className={shellStyles.stageStripDot} aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
