"use client";

import type { Artifact } from "@/lib/types";
import {
  STAGE1_SLOTS,
  STAGE2_FIXED_SLOTS,
  STAGE3_SLOTS,
  STAGE4_FIXED_SLOTS,
  STAGE5_CATEGORY_SLOTS,
  STAGE6_OUTLINE_PREFIX,
} from "@/lib/stage-slot-schema";
import { compareStage6SubKeys, slugifyCharName } from "@/lib/artifact-mutations";
import ArtifactSlotEditor from "./ArtifactSlotEditor";

interface Props {
  stageId: number;
  artifacts: Artifact[];
  onUpsert: (patch: Omit<Artifact, "updatedAt"> & { updatedAt?: string }) => void;
  onRemove: (stage: number, subKey: string) => void;
}

function maxEventIndex(arts: Artifact[]): number {
  let m = 0;
  for (const a of arts) {
    if (a.stage !== 4) continue;
    const x = /^event_(\d+)$/.exec(a.subKey);
    if (x) m = Math.max(m, parseInt(x[1], 10) || 0);
  }
  return Math.max(m, 1);
}

/** 下一个 `supporting_pN` 序号（与解析落库一致） */
function nextSupportingPIndex(arts: Artifact[]): number {
  let max = 0;
  for (const a of arts) {
    if (a.stage !== 2) continue;
    const x = /^supporting_p(\d+)$/.exec(a.subKey);
    if (x) max = Math.max(max, parseInt(x[1], 10) || 0);
  }
  return max + 1;
}

export default function StageFlatManual({ stageId, artifacts, onUpsert, onRemove }: Props) {
  const a = artifacts.filter((x) => x.stage === stageId);

  if (stageId === 1) {
    const fixedKeys = new Set(STAGE1_SLOTS.map((s) => s.subKey));
    const extras = a.filter((x) => !fixedKeys.has(x.subKey));
    return (
      <div className="space-y-2">
        {STAGE1_SLOTS.map((slot) => {
          const art = a.find((x) => x.subKey === slot.subKey);
          const isOutline = slot.subKey === "outline";
          return (
            <ArtifactSlotEditor
              key={slot.subKey}
              label={slot.label}
              value={art?.content ?? ""}
              rows={isOutline ? 30 : 6}
              textareaClassName={
                isOutline ? "min-h-[min(22rem,42vh)]" : undefined
              }
              onCommit={(content) =>
                onUpsert({
                  stage: 1,
                  subKey: slot.subKey,
                  label: slot.label,
                  content,
                })
              }
            />
          );
        })}
        {extras.map((x) => (
          <ArtifactSlotEditor
            key={x.subKey}
            label={x.label || x.subKey}
            value={x.content}
            onCommit={(content) =>
              onUpsert({
                stage: 1,
                subKey: x.subKey,
                label: x.label,
                content,
              })
            }
            onRemove={() => onRemove(1, x.subKey)}
            removeLabel="移除条目"
          />
        ))}
      </div>
    );
  }

  if (stageId === 2) {
    const fixedKeys = new Set(STAGE2_FIXED_SLOTS.map((s) => s.subKey));
    const chars = a.filter(
      (x) =>
        !fixedKeys.has(x.subKey) &&
        (x.subKey.startsWith("char_") || x.subKey.startsWith("supporting_"))
    );
    const nextSupportingIdx = nextSupportingPIndex(a);
    return (
      <div className="space-y-2">
        {STAGE2_FIXED_SLOTS.map((slot) => {
          const art = a.find((x) => x.subKey === slot.subKey);
          return (
            <ArtifactSlotEditor
              key={slot.subKey}
              label={slot.label}
              value={art?.content ?? ""}
              onCommit={(content) =>
                onUpsert({
                  stage: 2,
                  subKey: slot.subKey,
                  label: slot.label,
                  content,
                })
              }
            />
          );
        })}
        {chars.map((x) => (
          <ArtifactSlotEditor
            key={x.subKey}
            label={x.label}
            value={x.content}
            onCommit={(content) =>
              onUpsert({
                stage: 2,
                subKey: x.subKey,
                label: x.label,
                content,
              })
            }
            onRemove={() => onRemove(2, x.subKey)}
            removeLabel="移除"
          />
        ))}
        <div className="flex flex-col gap-1.5 sm:flex-row">
          <button
            type="button"
            onClick={() => {
              const name = window.prompt("主角/双男主之一：姓名或代号（用于标签与键名）");
              if (name == null) return;
              const t = name.trim();
              if (!t) return;
              const subKey = `char_${slugifyCharName(t)}`;
              onUpsert({
                stage: 2,
                subKey,
                label: `主角：${t}`,
                content: "",
              });
            }}
            className="w-full rounded-lg border border-dashed border-zinc-700 py-2 text-[11px] text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
          >
            + 添加主角小传
          </button>
          <button
            type="button"
            onClick={() => {
              const n = nextSupportingPIndex(a);
              onUpsert({
                stage: 2,
                subKey: `supporting_p${n}`,
                label: `配角${n}`,
                content: "",
              });
            }}
            className="w-full rounded-lg border border-dashed border-zinc-700 py-2 text-[11px] text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
            title={`将创建 supporting_p${nextSupportingIdx}，与「## 配角一」解析键位一致时可对照编号`}
          >
            + 添加配角小传（下一格：配角{nextSupportingIdx}）
          </button>
        </div>
        {a.filter(
          (x) =>
            !fixedKeys.has(x.subKey) &&
            !x.subKey.startsWith("char_") &&
            !x.subKey.startsWith("supporting_")
        ).map((x) => (
          <ArtifactSlotEditor
            key={x.subKey}
            label={x.label || x.subKey}
            value={x.content}
            onCommit={(content) =>
              onUpsert({
                stage: 2,
                subKey: x.subKey,
                label: x.label,
                content,
              })
            }
            onRemove={() => onRemove(2, x.subKey)}
            removeLabel="移除条目"
          />
        ))}
      </div>
    );
  }

  if (stageId === 3) {
    return (
      <div className="space-y-2">
        {STAGE3_SLOTS.map((slot) => {
          const art = a.find((x) => x.subKey === slot.subKey);
          return (
            <ArtifactSlotEditor
              key={slot.subKey}
              label={slot.label}
              value={art?.content ?? ""}
              onCommit={(content) =>
                onUpsert({
                  stage: 3,
                  subKey: slot.subKey,
                  label: slot.label,
                  content,
                })
              }
            />
          );
        })}
        {a.filter((x) => !STAGE3_SLOTS.some((s) => s.subKey === x.subKey)).map((x) => (
          <ArtifactSlotEditor
            key={x.subKey}
            label={x.label || x.subKey}
            value={x.content}
            onCommit={(content) =>
              onUpsert({
                stage: 3,
                subKey: x.subKey,
                label: x.label,
                content,
              })
            }
            onRemove={() => onRemove(3, x.subKey)}
            removeLabel="移除条目"
          />
        ))}
      </div>
    );
  }

  if (stageId === 4) {
    const maxEv = maxEventIndex(a);
    const fixedKeys = new Set(STAGE4_FIXED_SLOTS.map((s) => s.subKey));
    const extras = a.filter(
      (x) => !fixedKeys.has(x.subKey) && !/^event_\d+$/.test(x.subKey)
    );

    return (
      <div className="space-y-2">
        {Array.from({ length: maxEv }, (_, i) => i + 1).map((n) => {
          const subKey = `event_${n}`;
          const art = a.find((x) => x.subKey === subKey);
          return (
            <ArtifactSlotEditor
              key={subKey}
              label={`核心事件 ${n}`}
              value={art?.content ?? ""}
              onCommit={(content) =>
                onUpsert({
                  stage: 4,
                  subKey,
                  label: `核心事件 ${n}`,
                  content,
                })
              }
            />
          );
        })}
        <button
          type="button"
          onClick={() => {
            const n = maxEv + 1;
            onUpsert({
              stage: 4,
              subKey: `event_${n}`,
              label: `核心事件 ${n}`,
              content: "",
            });
          }}
          className="w-full rounded-lg border border-dashed border-zinc-700 py-2 text-[11px] text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
        >
          + 添加核心事件 {maxEv + 1}
        </button>
        {extras.map((x) => (
          <ArtifactSlotEditor
            key={x.subKey}
            label={x.label || x.subKey}
            value={x.content}
            onCommit={(content) =>
              onUpsert({
                stage: 4,
                subKey: x.subKey,
                label: x.label,
                content,
              })
            }
            onRemove={() => onRemove(4, x.subKey)}
            removeLabel="移除条目"
          />
        ))}
        {STAGE4_FIXED_SLOTS.map((slot) => {
          const art = a.find((x) => x.subKey === slot.subKey);
          return (
            <ArtifactSlotEditor
              key={slot.subKey}
              label={slot.label}
              value={art?.content ?? ""}
              optional={slot.optional}
              onCommit={(content) =>
                onUpsert({
                  stage: 4,
                  subKey: slot.subKey,
                  label: slot.label,
                  content,
                })
              }
            />
          );
        })}
      </div>
    );
  }

  if (stageId === 5) {
    return (
      <div className="space-y-2">
        {STAGE5_CATEGORY_SLOTS.map((slot) => {
          const art = a.find((x) => x.subKey === slot.subKey);
          return (
            <ArtifactSlotEditor
              key={slot.subKey}
              label={slot.label}
              value={art?.content ?? ""}
              rows={8}
              onCommit={(content) =>
                onUpsert({
                  stage: 5,
                  subKey: slot.subKey,
                  label: slot.label,
                  content,
                })
              }
            />
          );
        })}
      </div>
    );
  }

  if (stageId === 6) {
    const outlines = a
      .filter((x) => x.subKey.startsWith(STAGE6_OUTLINE_PREFIX) && !x.parentKey)
      .sort((x, y) => compareStage6SubKeys(x.subKey, y.subKey));
    const outlineKeys = new Set(outlines.map((x) => x.subKey));
    const subItems = a.filter(
      (x) => x.parentKey && outlineKeys.has(x.parentKey)
    );
    const extras = a.filter(
      (x) =>
        !x.subKey.startsWith(STAGE6_OUTLINE_PREFIX) &&
        !(x.parentKey && outlineKeys.has(x.parentKey))
    );

    function maxOutlineEpNum(): number {
      let max = 0;
      for (const o of outlines) {
        const m = /outline_ep(\d+)/.exec(o.subKey);
        if (m) max = Math.max(max, parseInt(m[1], 10) || 0);
      }
      return max;
    }

    return (
      <div className="space-y-2">
        {outlines.map((ep) => {
          const children = subItems
            .filter((x) => x.parentKey === ep.subKey)
            .sort((x, y) => compareStage6SubKeys(x.subKey, y.subKey));
          return (
            <div key={ep.subKey}>
              <ArtifactSlotEditor
                label={ep.label || ep.subKey}
                value={ep.content}
                rows={6}
                onCommit={(content) =>
                  onUpsert({
                    stage: 6,
                    subKey: ep.subKey,
                    label: ep.label,
                    content,
                  })
                }
                onRemove={() => onRemove(6, ep.subKey)}
                removeLabel="移除"
              />
              {children.length > 0 && (
                <div className="ml-4 mt-1 space-y-1.5 border-l border-zinc-800 pl-3">
                  {children.map((sub) => (
                    <ArtifactSlotEditor
                      key={sub.subKey}
                      label={sub.label || sub.subKey}
                      value={sub.content}
                      rows={3}
                      onCommit={(content) =>
                        onUpsert({
                          stage: 6,
                          subKey: sub.subKey,
                          label: sub.label,
                          content,
                          parentKey: sub.parentKey,
                        })
                      }
                      onRemove={() => onRemove(6, sub.subKey)}
                      removeLabel="移除"
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => {
            const n = maxOutlineEpNum() + 1;
            onUpsert({
              stage: 6,
              subKey: `outline_ep${n}`,
              label: `第${n}集 大纲`,
              content: "",
            });
          }}
          className="w-full rounded-lg border border-dashed border-zinc-700 py-2 text-[11px] text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
        >
          + 添加第{maxOutlineEpNum() + 1}集大纲
        </button>
        {extras.map((x) => (
          <ArtifactSlotEditor
            key={x.subKey}
            label={x.label || x.subKey}
            value={x.content}
            onCommit={(content) =>
              onUpsert({
                stage: 6,
                subKey: x.subKey,
                label: x.label,
                content,
              })
            }
            onRemove={() => onRemove(6, x.subKey)}
            removeLabel="移除条目"
          />
        ))}
      </div>
    );
  }

  return null;
}
