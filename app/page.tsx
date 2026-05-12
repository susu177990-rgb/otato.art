"use client";

import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ApiSettingsToolbarButton from "@/components/ApiSettingsToolbarButton";

function ModeHomeInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectParam = searchParams.get("project");

  useEffect(() => {
    if (!projectParam) return;
    router.replace(`/studio/${projectParam}`);
    // 与 /project/new 相同：不把 router 放进依赖，避免其引用变化时重复 replace 造成「一直刷新」
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectParam]);

  if (projectParam) {
    return (
      <div className="flex h-full min-h-[200px] items-center justify-center bg-zinc-950 text-zinc-500">
        正在跳转…
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col bg-zinc-950">
      <header className="border-b border-zinc-800 px-4 py-6 sm:px-6">
        <div className="mx-auto flex max-w-lg items-start justify-between gap-4">
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <h1 className="text-lg font-semibold tracking-tight text-zinc-100">BL 短剧工作台</h1>
            <p className="mt-1 text-[12px] text-zinc-500">选择工作模式</p>
          </div>
          <ApiSettingsToolbarButton className="self-start" />
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-4 py-10 sm:px-6">
        <div className="grid w-full max-w-lg gap-4 sm:grid-cols-2 sm:gap-5">
          <button
            type="button"
            onClick={() => router.push("/wattpad")}
            className="group flex min-h-[160px] flex-col items-center justify-center rounded-2xl border border-zinc-600/40 bg-zinc-900/50 p-6 text-center transition hover:border-amber-600/35 hover:bg-zinc-900/80"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-800 text-amber-500/90 transition group-hover:bg-amber-950/40 group-hover:text-amber-400">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
                />
              </svg>
            </span>
            <span className="mt-4 text-sm font-semibold text-zinc-100">扒网文</span>
            <span className="mt-1 text-[11px] text-zinc-500">Wattpad 搜索与导出</span>
          </button>

          <button
            type="button"
            onClick={() => router.push("/projects")}
            className="group flex min-h-[160px] flex-col items-center justify-center rounded-2xl border border-indigo-500/25 bg-zinc-900/50 p-6 text-center shadow-lg shadow-indigo-950/20 transition hover:border-indigo-400/40 hover:bg-zinc-900/80"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600/90 text-white transition group-hover:bg-indigo-500">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
                />
              </svg>
            </span>
            <span className="mt-4 text-sm font-semibold text-zinc-100">创作剧本</span>
            <span className="mt-1 text-[11px] text-zinc-500">项目列表 · 新建后进入立项</span>
          </button>
        </div>
      </main>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full min-h-[200px] items-center justify-center bg-zinc-950 text-zinc-500">
          加载中…
        </div>
      }
    >
      <ModeHomeInner />
    </Suspense>
  );
}
