"use client";

import type { ProjectSummary } from "@/lib/types";
import { STAGE_LABELS } from "@/lib/types";

interface Props {
  projects: ProjectSummary[];
  activeId: string | null;
  collapsed: boolean;
  onToggle: () => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
}

export default function ProjectSidebar({
  projects,
  activeId,
  collapsed,
  onToggle,
  onSelect,
  onCreate,
  onDelete,
}: Props) {
  if (collapsed) {
    return (
      <div className="flex w-10 flex-col items-center border-r border-zinc-800 py-3">
        <button
          onClick={onToggle}
          className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
          title="展开项目列表"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="flex w-56 flex-col border-r border-zinc-800">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          项目
        </span>
        <div className="flex gap-1">
          <button
            onClick={onCreate}
            className="rounded p-1 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
            title="新建项目"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </button>
          <button
            onClick={onToggle}
            className="rounded p-1 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
            title="收起"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto py-1">
        {projects.length === 0 && (
          <p className="px-3 py-6 text-center text-xs text-zinc-600">
            暂无项目
          </p>
        )}
        {projects.map((p) => (
          <div
            key={p.id}
            className={`group mx-1 flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 text-sm transition ${
              p.id === activeId
                ? "bg-zinc-800 text-zinc-100"
                : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
            }`}
            onClick={() => onSelect(p.id)}
          >
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{p.name}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] text-zinc-600">
                {p.currentStage > 0
                  ? STAGE_LABELS[p.currentStage] || `STAGE ${p.currentStage}`
                  : "未开始"}
                {p.onboardingStatus && p.onboardingStatus !== "ready" ? (
                  <span className="rounded bg-amber-900/50 px-1 text-amber-400/90">
                    {p.onboardingStatus === "pending_setup" ? "待立项" : "策划中"}
                  </span>
                ) : null}
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(p.id);
              }}
              className="ml-1 shrink-0 rounded p-0.5 text-zinc-600 opacity-0 transition hover:text-red-400 group-hover:opacity-100"
              title="删除"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
