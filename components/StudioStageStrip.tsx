"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
  maxApprovedStage: number;
  gateOverrideNote: string;
  onGateOverrideMark: (overrideNote?: string) => void | Promise<void>;
  /** 项目总集数（从 meta 解析），用于精确 Gate 校验 */
  episodeCount?: number;
}

type StageId = 1 | 2 | 3 | 4 | 5 | 6 | 7;

interface PopoverState {
  stage: StageId;
  rect: DOMRect;
}

export default function StudioStageStrip({
  artifacts,
  currentStage,
  viewStage,
  onViewStageChange,
  maxApprovedStage,
  gateOverrideNote,
  onGateOverrideMark,
  episodeCount,
}: Props) {
  const [popover, setPopover] = useState<PopoverState | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ left: number; top: number } | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!popover) return;
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target)) return;
      setPopover(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPopover(null);
    }
    function onScroll() {
      setPopover(null);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [popover]);

  // 渲染后再测量 popover 实际宽高，再决定左/上对齐，避免越界
  useLayoutEffect(() => {
    if (!popover || !popoverRef.current) {
      setPopoverPos(null);
      return;
    }
    const popW = popoverRef.current.offsetWidth || 280;
    const popH = popoverRef.current.offsetHeight || 240;
    const rect = popover.rect;
    let left = rect.left;
    if (left + popW > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - popW - 8);
    }
    let top = rect.bottom + 8;
    if (top + popH > window.innerHeight - 8) {
      top = Math.max(8, rect.top - popH - 8);
    }
    setPopoverPos({ left, top });
  }, [popover]);

  function handleTileClick(stage: StageId, e: React.MouseEvent<HTMLButtonElement>) {
    onViewStageChange(stage);
    const rect = e.currentTarget.getBoundingClientRect();
    setPopover((prev) =>
      prev?.stage === stage && prev.rect.top === rect.top ? null : { stage, rect }
    );
  }

  const popoverStage = popover?.stage;
  const popoverGate = popoverStage
    ? evaluateStageGate(
        popoverStage,
        artifacts,
        episodeCount ? { episodeCount } : undefined
      )
    : null;
  const popoverLabel = popoverStage
    ? STAGE_LABELS[popoverStage] ?? `阶段 ${popoverStage}`
    : "";

  return (
    <>
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
          const dotColor = !hasItems
            ? "#52525b"
            : g.ok
              ? "#34d399"
              : "#fbbf24";
          const tileClass = [
            shellStyles.stageStripTile,
            viewingHere ? shellStyles.stageStripTileActive : "",
            !viewingHere && inferredHere ? shellStyles.stageStripTileInferred : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <button
              key={stage}
              type="button"
              onClick={(e) => handleTileClick(stage, e)}
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
              <span
                className={shellStyles.stageStripDot}
                style={{ background: dotColor }}
                aria-hidden
              />
            </button>
          );
        })}
      </div>

      {popover && popoverStage && popoverGate ? (
        <div
          ref={popoverRef}
          className={shellStyles.stagePopover}
          style={
            popoverPos
              ? { left: `${popoverPos.left}px`, top: `${popoverPos.top}px` }
              : { left: `${popover.rect.left}px`, top: `${popover.rect.bottom + 8}px`, visibility: "hidden" }
          }
          role="dialog"
          aria-label={`STAGE ${popoverStage} 详情`}
        >
          <div>
            <h3 className={shellStyles.floaterTitle}>
              STAGE {popoverStage} · {popoverLabel}
            </h3>
            <p className={shellStyles.floaterSubtitle}>
              已验至：S{maxApprovedStage > 0 ? maxApprovedStage : "—"}
              {popoverStage === maxApprovedStage ? "（当前 Gate 阶段）" : null}
            </p>
            {gateOverrideNote ? (
              <p
                className={shellStyles.floaterSubtitle}
                style={{ color: "#fbbf24", marginTop: 4 }}
                title={gateOverrideNote}
              >
                · 含「未达标仍标」备注
              </p>
            ) : null}
          </div>

          {popoverGate.items.length > 0 ? (
            <ul className={shellStyles.floaterList}>
              {popoverGate.items.map((item) => (
                <li key={item.id} className={shellStyles.floaterListItem}>
                  <code
                    style={{
                      color: item.pass
                        ? "#34d399"
                        : item.optional
                          ? "#71717a"
                          : "#fbbf24",
                    }}
                  >
                    {item.pass ? "✓" : item.optional ? "○" : "!"}
                  </code>
                  <span>
                    {item.label}
                    {item.optional ? <span style={{ color: "#52525b" }}>（可选）</span> : null}
                    {!item.pass && item.hint ? (
                      <span
                        style={{
                          display: "block",
                          marginTop: 2,
                          color: "#52525b",
                          fontSize: 9,
                          lineHeight: 1.55,
                        }}
                      >
                        {item.hint}
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={shellStyles.floaterSubtitle}>本阶段暂无验收清单。</p>
          )}

          {currentStage >= 1 && currentStage <= 7 && popoverStage !== currentStage ? (
            <p className={shellStyles.floaterSubtitle}>
              人工「未达标仍标」针对左侧对话推断阶段「
              {STAGE_LABELS[currentStage] ?? currentStage}
              」。请展开该项再操作。
            </p>
          ) : null}

          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <button
              type="button"
              disabled={currentStage < 1 || popoverStage !== currentStage}
              onClick={() => {
                const note = window.prompt(
                  "未达标仍标记：请填写原因（将写入工程记录）",
                  gateOverrideNote || ""
                );
                if (note === null) return;
                void onGateOverrideMark(note);
                setPopover(null);
              }}
              className={[shellStyles.button, shellStyles.buttonSubtle].join(" ")}
              title={
                popoverStage !== currentStage && currentStage >= 1
                  ? "请展开与当前对话阶段一致的流程块"
                  : "Gate 未通过时仍将工程标为已验到此阶段（需填写原因）"
              }
              style={{ height: 28, padding: "0 10px", fontSize: 11 }}
            >
              未达标仍标
            </button>
            <button
              type="button"
              onClick={() => {
                onViewStageChange(popoverStage);
                setPopover(null);
              }}
              className={[shellStyles.button, shellStyles.buttonSubtle].join(" ")}
              style={{ height: 28, padding: "0 10px", fontSize: 11 }}
            >
              查看产物
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
