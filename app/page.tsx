"use client";

import Link from "next/link";
import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import shellStyles from "./shared/shell.module.css";

function ModeHomeInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectParam = searchParams.get("project");

  useEffect(() => {
    if (!projectParam) return;
    router.replace(`/studio/${projectParam}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectParam]);

  if (projectParam) {
    return <div className={shellStyles.empty}>正在跳转…</div>;
  }

  return (
    <main className={shellStyles.page}>
      <header className={shellStyles.topbar}>
        <div className={shellStyles.topbarLeft}>
          <div className={shellStyles.topbarTagline}>
            <p className={shellStyles.plainDockText}>BL 短剧工作台</p>
          </div>
        </div>
        <nav className={shellStyles.topnav}>
          <Link href="/settings" className={shellStyles.navLink}>
            设置
          </Link>
        </nav>
      </header>

      <div className={shellStyles.heroWrap}>
        <div style={{ maxWidth: 720, width: "100%", textAlign: "center" }}>
          <h1 className={shellStyles.heroTitle}>选择工作模式</h1>
          <p className={shellStyles.heroSubtitle}>剧本立项 · 网文素材 · 模式化生图</p>
        </div>

        <div
          className={shellStyles.tileGrid}
          style={{ marginTop: 32, maxWidth: 720 }}
        >
          <button type="button" onClick={() => router.push("/wattpad")} className={shellStyles.tile}>
            <span className={shellStyles.tileIcon}>
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
                />
              </svg>
            </span>
            <p className={shellStyles.tileTitle}>扒网文</p>
            <p className={shellStyles.tileMeta}>Wattpad 搜索与导出</p>
          </button>

          <button type="button" onClick={() => router.push("/projects")} className={shellStyles.tile}>
            <span className={shellStyles.tileIcon}>
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
                />
              </svg>
            </span>
            <p className={shellStyles.tileTitle}>创作剧本</p>
            <p className={shellStyles.tileMeta}>项目列表 · 立项 · 编剧室</p>
          </button>

          <button type="button" onClick={() => router.push("/image")} className={shellStyles.tile}>
            <span className={shellStyles.tileIcon}>
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"
                />
              </svg>
            </span>
            <p className={shellStyles.tileTitle}>作图</p>
            <p className={shellStyles.tileMeta}>模式化生图 · 画廊</p>
          </button>
        </div>
      </div>
    </main>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className={shellStyles.empty}>加载中…</div>}>
      <ModeHomeInner />
    </Suspense>
  );
}
