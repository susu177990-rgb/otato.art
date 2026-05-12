"use client";

import { useState, useEffect, useCallback, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ApiSettingsToolbarButton from "@/components/ApiSettingsToolbarButton";
import type { ProjectSummary } from "@/lib/types";
import { STAGE_LABELS } from "@/lib/types";

function formatUpdated(iso: string) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function ProjectsHubInner() {
  const router = useRouter();

  const [projects, setProjects] = useState<ProjectSummary[]>([]);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects");
      if (res.ok) setProjects(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    void fetchProjects();
  }, [fetchProjects]);

  function handleOpen(id: string) {
    router.push(`/studio/${id}`);
  }

  function handleCreate() {
    router.push("/project/new");
  }

  async function handleDelete(e: MouseEvent, id: string) {
    e.stopPropagation();
    if (!confirm("确定删除该项目？此操作不可恢复。")) return;
    try {
      await fetch(`/api/projects/${id}`, { method: "DELETE" });
      await fetchProjects();
    } catch {}
  }

  return (
    <div className="flex min-h-full flex-col bg-zinc-950">
      <header className="border-b border-zinc-800 px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-3">
          <div>
            <Link
              href="/"
              className="text-[11px] text-zinc-500 transition hover:text-zinc-300"
            >
              ← 模式选择
            </Link>
            <h1 className="mt-1 text-base font-semibold text-zinc-100">创作剧本 · 项目</h1>
            <p className="mt-0.5 text-[12px] text-zinc-500">点击卡片进入编剧室；新建将先走立项与策划</p>
          </div>
          <ApiSettingsToolbarButton />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto grid max-w-6xl gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <button
            type="button"
            onClick={handleCreate}
            className="group flex min-h-[120px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-700 bg-zinc-900/30 px-4 py-6 text-center transition hover:border-indigo-500/50 hover:bg-zinc-900/60"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-800 text-indigo-400 transition group-hover:bg-indigo-950/50 group-hover:text-indigo-300">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </span>
            <span className="mt-3 text-sm font-medium text-zinc-300">新建项目</span>
            <span className="mt-1 text-[11px] text-zinc-600">立项 · 素材 · 策划对齐</span>
          </button>

          {projects.map((p) => (
            <div
              key={p.id}
              role="button"
              tabIndex={0}
              onClick={() => handleOpen(p.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleOpen(p.id);
                }
              }}
              className="group relative flex min-h-[120px] cursor-pointer flex-col rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 text-left transition hover:border-indigo-500/35 hover:bg-zinc-900/70"
            >
              <div className="pr-8">
                <h2 className="line-clamp-2 text-sm font-semibold text-zinc-100">{p.name}</h2>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-500">
                  <span>
                    {p.currentStage > 0 ? STAGE_LABELS[p.currentStage] || `STAGE ${p.currentStage}` : "未开始"}
                  </span>
                  {p.onboardingStatus && p.onboardingStatus !== "ready" ? (
                    <span className="rounded bg-amber-950/60 px-1.5 py-0.5 text-amber-400/95">
                      {p.onboardingStatus === "pending_setup" ? "待立项" : "策划中"}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="mt-auto pt-3 text-[10px] text-zinc-600">
                {formatUpdated(p.updatedAt) ? `更新 ${formatUpdated(p.updatedAt)}` : "\u00a0"}
              </div>
              <button
                type="button"
                onClick={(e) => void handleDelete(e, p.id)}
                className="absolute right-2 top-2 rounded p-1.5 text-zinc-600 opacity-0 transition hover:bg-zinc-800 hover:text-red-400 group-hover:opacity-100"
                title="删除项目"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>

        {projects.length === 0 && (
          <p className="mx-auto mt-8 max-w-md text-center text-xs text-zinc-600">
            暂无项目，点击上方「新建项目」开始。
          </p>
        )}
      </main>
    </div>
  );
}

export default function ProjectsPage() {
  return <ProjectsHubInner />;
}
