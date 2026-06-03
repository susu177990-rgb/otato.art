"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import shellStyles from "@/app/shared/shell.module.css";
import type { CanvasBoard, CanvasBoardSummary } from "@/lib/canvas/types";
import styles from "./canvas-page.module.css";

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未知时间";
  return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function CanvasLibraryPage() {
  const router = useRouter();
  const [boards, setBoards] = useState<CanvasBoardSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const loadBoards = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/canvas-boards", { cache: "no-store" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data.error === "string" ? data.error : "无法加载画布");
      }
      const data = (await res.json()) as { boards: CanvasBoardSummary[] };
      setBoards(data.boards);
    } catch (e) {
      setError(e instanceof Error ? e.message : "无法加载画布");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBoards();
  }, [loadBoards]);

  const createBoard = async () => {
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/canvas-boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: `无限画布 ${boards.length + 1}` }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data.error === "string" ? data.error : "新建失败");
      }
      const board = (await res.json()) as CanvasBoard;
      router.push(`/canvas/${board.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "新建失败");
    } finally {
      setCreating(false);
    }
  };

  const renameBoard = async (id: string, title: string) => {
    const nextTitle = title.trim();
    if (!nextTitle) return;
    setBoards((items) => items.map((item) => (item.id === id ? { ...item, title: nextTitle } : item)));
    await fetch(`/api/canvas-boards/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: nextTitle }),
    }).catch(() => undefined);
  };

  const deleteBoard = async (id: string) => {
    setBoards((items) => items.filter((item) => item.id !== id));
    const res = await fetch(`/api/canvas-boards/${id}`, { method: "DELETE" });
    if (!res.ok) void loadBoards();
  };

  return (
    <main className={shellStyles.page}>
      <header className={shellStyles.topbar}>
        <div className={shellStyles.topbarLeft}>
          <Link href="/" className={[shellStyles.plainDockText, shellStyles.dockTextLink].join(" ")}>
            返回首页
          </Link>
          <div className={shellStyles.topbarTagline}>
            <p className={shellStyles.plainDockText}>无限画布</p>
          </div>
        </div>
        <nav className={shellStyles.topnav}>
          <button type="button" className={[shellStyles.navLink, shellStyles.navLinkPrimary].join(" ")} onClick={createBoard} disabled={creating}>
            {creating ? "新建中..." : "新建画布"}
          </button>
        </nav>
      </header>

      <div className={shellStyles.body}>
        <div className={[shellStyles.shell, shellStyles.shellWide].join(" ")}>
          <section className={shellStyles.card}>
            <div className={shellStyles.cardHead}>
              <div>
                <h1 className={shellStyles.cardTitle}>画布项目</h1>
                <p className={shellStyles.cardSubtitle}>素材编排、分镜关系和灵感板会按账号云端保存。</p>
              </div>
              <button type="button" className={shellStyles.button} onClick={() => void loadBoards()} disabled={loading}>
                刷新
              </button>
            </div>
            {error ? <div className={[shellStyles.banner, shellStyles.bannerError].join(" ")}>{error}</div> : null}
          </section>

          {loading ? (
            <div className={shellStyles.empty}>正在加载画布...</div>
          ) : boards.length ? (
            <section className={styles.boardGrid}>
              {boards.map((board) => (
                <article key={board.id} className={[shellStyles.card, styles.boardCard].join(" ")}>
                  <div className={styles.boardTitleRow}>
                    <input
                      className={[shellStyles.input, shellStyles.inputCompact, styles.boardTitleInput].join(" ")}
                      defaultValue={board.title}
                      onBlur={(event) => void renameBoard(board.id, event.currentTarget.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") event.currentTarget.blur();
                      }}
                      aria-label="画布标题"
                    />
                  </div>
                  <div className={styles.boardMeta}>
                    <span className={shellStyles.metaPill}>{board.nodeCount} 节点</span>
                    <span className={shellStyles.metaPill}>{board.imageCount} 图片</span>
                    <span className={shellStyles.metaPill}>{board.videoCount} 视频</span>
                    <span className={shellStyles.metaPill}>更新 {formatTime(board.updatedAt)}</span>
                  </div>
                  <div className={styles.boardActions}>
                    <button type="button" className={shellStyles.button} onClick={() => router.push(`/canvas/${board.id}`)}>
                      进入
                    </button>
                    <button type="button" className={[shellStyles.button, shellStyles.buttonDanger].join(" ")} onClick={() => void deleteBoard(board.id)}>
                      删除
                    </button>
                  </div>
                </article>
              ))}
            </section>
          ) : (
            <section className={shellStyles.empty}>
              还没有画布。
              <button type="button" className={[shellStyles.button, shellStyles.buttonPrimary].join(" ")} onClick={createBoard} disabled={creating}>
                新建第一个画布
              </button>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
