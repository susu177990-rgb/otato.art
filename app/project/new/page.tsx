"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ApiSettingsToolbarButton from "@/components/ApiSettingsToolbarButton";

const RECENT_PROJECT_KEY = "script-agent:new-project:recent";
const RECENT_PROJECT_TTL_MS = 30_000;

type CreatedProject = { id: string };
type RecentProject = CreatedProject & { createdAt: number };

let pendingCreateProject: Promise<CreatedProject> | null = null;

function readRecentProject(): RecentProject | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(RECENT_PROJECT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RecentProject>;
    if (!parsed.id || typeof parsed.createdAt !== "number") {
      window.sessionStorage.removeItem(RECENT_PROJECT_KEY);
      return null;
    }
    if (Date.now() - parsed.createdAt > RECENT_PROJECT_TTL_MS) {
      window.sessionStorage.removeItem(RECENT_PROJECT_KEY);
      return null;
    }
    return { id: parsed.id, createdAt: parsed.createdAt };
  } catch {
    window.sessionStorage.removeItem(RECENT_PROJECT_KEY);
    return null;
  }
}

function writeRecentProject(project: CreatedProject) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(
    RECENT_PROJECT_KEY,
    JSON.stringify({ ...project, createdAt: Date.now() satisfies number })
  );
}

async function createProjectOnce(): Promise<CreatedProject> {
  if (!pendingCreateProject) {
    pendingCreateProject = (async () => {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "新剧本项目" }),
      });
      if (!res.ok) throw new Error("创建失败");
      const project = (await res.json()) as CreatedProject;
      writeRecentProject(project);
      return project;
    })();
  }

  try {
    return await pendingCreateProject;
  } finally {
    pendingCreateProject = null;
  }
}

export default function NewProjectPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // 复用短时间内刚创建的项目，避免 dev 下重挂载 / HMR 时重复建项。
        const recent = readRecentProject();
        const p = recent ?? (await createProjectOnce());
        if (!cancelled) router.replace(`/project/${p.id}/onboarding`);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "创建失败");
      }
    })();
    return () => {
      cancelled = true;
    };
    // next/navigation 的 router 在挂载时即可用；不依赖其引用变化，避免重复建项与反复跳转
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-h-[200px] flex-col bg-zinc-950 text-zinc-400">
      <div className="flex justify-end border-b border-zinc-800 px-4 py-2 sm:px-6">
        <ApiSettingsToolbarButton />
      </div>
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        {error ? <p className="text-sm text-red-400">{error}</p> : <p className="text-sm">正在创建项目…</p>}
      </div>
    </div>
  );
}
