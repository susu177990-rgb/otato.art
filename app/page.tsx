"use client";

import Link from "next/link";
import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/branding";
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
            <p className={shellStyles.plainDockText}>{BRAND_NAME}</p>
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
          <p className={shellStyles.heroSubtitle}>{BRAND_TAGLINE}</p>
        </div>

        <div className={shellStyles.tileGrid} style={{ marginTop: 32 }}>
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

          <button type="button" onClick={() => router.push("/chat")} className={shellStyles.tile}>
            <span className={shellStyles.tileIcon}>
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm3.75 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm3.75 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM8.25 6.75h7.5v10.5h-7.5V6.75ZM6 20.25h12A2.25 2.25 0 0 0 20.25 18V6A2.25 2.25 0 0 0 18 3.75H6A2.25 2.25 0 0 0 3.75 6v12A2.25 2.25 0 0 0 6 20.25Z"
                />
              </svg>
            </span>
            <p className={shellStyles.tileTitle}>对话</p>
            <p className={shellStyles.tileMeta}>Agent · Skill · 多会话</p>
          </button>

          <button type="button" onClick={() => router.push("/image/gallery")} className={shellStyles.tile}>
            <span className={shellStyles.tileIcon}>
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.75 8.25A2.25 2.25 0 0 1 6 6h7.5a2.25 2.25 0 0 1 2.25 2.25v7.5A2.25 2.25 0 0 1 13.5 18H6a2.25 2.25 0 0 1-2.25-2.25v-7.5Z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8.25 10.5h3.75M8.25 13.5h5.25M16.5 8.25h1.5A2.25 2.25 0 0 1 20.25 10.5v7.5A2.25 2.25 0 0 1 18 20.25h-7.5A2.25 2.25 0 0 1 8.25 18v-1.5"
                />
              </svg>
            </span>
            <p className={shellStyles.tileTitle}>画廊</p>
            <p className={shellStyles.tileMeta}>查看生图记录</p>
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

          <button type="button" onClick={() => router.push("/video")} className={shellStyles.tile}>
            <span className={shellStyles.tileIcon}>
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.75 6.75v10.5m0 0L19.5 15m-3.75 2.25L12 15m-7.5-7.5h9A2.25 2.25 0 0 1 15.75 9.75v4.5A2.25 2.25 0 0 1 13.5 16.5h-9A2.25 2.25 0 0 1 2.25 14.25v-4.5A2.25 2.25 0 0 1 4.5 7.5Z"
                />
              </svg>
            </span>
            <p className={shellStyles.tileTitle}>视频</p>
            <p className={shellStyles.tileMeta}>模式化生视频 · 记录</p>
          </button>

          <button type="button" onClick={() => router.push("/canvas")} className={shellStyles.tile}>
            <span className={shellStyles.tileIcon}>
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4.5 7.5h4.75v4.75H4.5V7.5Zm10.25 0h4.75v4.75h-4.75V7.5ZM4.5 16.25h4.75v4.75H4.5v-4.75Zm10.25 0h4.75v4.75h-4.75v-4.75ZM9.25 9.875h5.5M9.25 18.625h5.5M6.875 12.25v4M17.125 12.25v4"
                />
              </svg>
            </span>
            <p className={shellStyles.tileTitle}>无限画布</p>
            <p className={shellStyles.tileMeta}>素材编排 · 分镜关系 · 灵感板</p>
          </button>

          <button type="button" onClick={() => router.push("/ai-live-action")} className={shellStyles.tile}>
            <span className={shellStyles.tileIcon}>
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.75 6.75h16.5m-16.5 0v10.5A2.25 2.25 0 0 0 6 19.5h12a2.25 2.25 0 0 0 2.25-2.25V6.75m-16.5 0A2.25 2.25 0 0 1 6 4.5h12a2.25 2.25 0 0 1 2.25 2.25M8.25 14.25l2.25-2.25 1.5 1.5 2.25-3 1.5 2.25"
                />
              </svg>
            </span>
            <p className={shellStyles.tileTitle}>AI+实拍</p>
            <p className={shellStyles.tileMeta}>首帧重构 · 转绘</p>
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
