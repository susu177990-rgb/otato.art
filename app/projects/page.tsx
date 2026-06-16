"use client";

import { useState, useEffect, useCallback, useMemo, type FocusEvent, type KeyboardEvent, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useProjectWorkspace } from "@/components/project/ProjectProvider";
import { projectModeHref } from "@/components/project/project-routes";
import type { ProjectSummary } from "@/lib/types";
import shellStyles from "../shared/shell.module.css";
import styles from "./projects-page.module.css";

type SortKey = "updated" | "stage" | "name";
const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: "updated", label: "按更新时间" },
  { value: "stage", label: "按项目进度" },
  { value: "name", label: "按名称" },
];

function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("zh-CN", { year: "numeric", month: "numeric", day: "numeric" });
  } catch {
    return "";
  }
}

function PencilIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ProjectsHubInner() {
  const router = useRouter();
  const { openCreateDialog, openDeleteDialog } = useProjectWorkspace();

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("updated");
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminChecked, setAdminChecked] = useState(false);
  const [savingProjectId, setSavingProjectId] = useState<string | null>(null);
  const [projectNameError, setProjectNameError] = useState<{ id: string; message: string } | null>(null);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects");
      if (res.status === 401) {
        setNeedsLogin(true);
        setProjects([]);
        return;
      }
      if (res.ok) {
        setNeedsLogin(false);
        setProjects(await res.json());
      }
    } catch {
      // ignore
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void fetchProjects();
  }, [fetchProjects]);

  useEffect(() => {
    let cancelled = false;
    async function checkAdmin() {
      try {
        const res = await fetch("/api/admin/me", { cache: "no-store" });
        if (!cancelled) setIsAdmin(res.ok);
      } catch {
        if (!cancelled) setIsAdmin(false);
      } finally {
        if (!cancelled) setAdminChecked(true);
      }
    }
    void checkAdmin();
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    let list = projects;
    if (trimmed) {
      list = list.filter((p) => p.name.toLowerCase().includes(trimmed));
    }
    const sorted = [...list];
    if (sortKey === "updated") {
      sorted.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    } else if (sortKey === "stage") {
      sorted.sort((a, b) => {
        const am = a.maxApprovedStage ?? 0;
        const bm = b.maxApprovedStage ?? 0;
        if (bm !== am) return bm - am;
        return b.updatedAt.localeCompare(a.updatedAt);
      });
    } else {
      sorted.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
    }
    return sorted;
  }, [projects, query, sortKey]);

  const sortLabel = SORT_OPTIONS.find((option) => option.value === sortKey)?.label ?? "按更新时间";

  function handleOpen(id: string) {
    router.push(projectModeHref(id, "workspace"));
  }

  async function handleSaveProjectName(project: ProjectSummary, rawName: string) {
    const name = rawName.trim();
    if (!name) {
      setProjectNameError({ id: project.id, message: "项目名称不能为空" });
      return;
    }
    if (name === project.name.trim()) {
      setProjectNameError(null);
      return;
    }
    setSavingProjectId(project.id);
    setProjectNameError(null);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(project.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || "项目保存失败");
      }
      await fetchProjects();
    } catch (error) {
      setProjectNameError({ id: project.id, message: error instanceof Error ? error.message : "项目保存失败" });
    } finally {
      setSavingProjectId(null);
    }
  }

  function handleProjectNameBlur(e: FocusEvent<HTMLInputElement>, project: ProjectSummary) {
    void handleSaveProjectName(project, e.currentTarget.value);
  }

  function handleProjectNameKeyDown(e: KeyboardEvent<HTMLInputElement>, project: ProjectSummary) {
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.blur();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      e.currentTarget.value = project.name;
      setProjectNameError(null);
      e.currentTarget.blur();
    }
  }

  function handleDelete(e: MouseEvent, project: ProjectSummary) {
    e.stopPropagation();
    openDeleteDialog({
      id: project.id,
      name: project.name,
      onDeleted: fetchProjects,
    });
  }

  return (
    <main className={[shellStyles.page, styles.projectsPage].join(" ")}>
      <header className={styles.projectTopbar}>
        <div className={styles.projectTopbarIdentity}>
          <Link href="/" className={styles.projectTopbarBack}>
            首页
          </Link>
          {adminChecked && isAdmin ? (
            <Link href="/admin" className={styles.projectTopbarTitle}>
              Admin
            </Link>
          ) : null}
        </div>

        <nav className={styles.projectTopbarModes} aria-label="项目入口">
          <span className={styles.projectTopbarModeActive}>项目列表</span>
          <Link href="/prompt" className={styles.projectTopbarMode}>
            预设社区
          </Link>
        </nav>

        <div className={styles.projectTopbarActions}>
          {loaded ? (
            <>
              {needsLogin ? (
                <Link href="/login?next=/projects" className={styles.projectTopbarAction}>
                  登录 / 注册
                </Link>
              ) : (
                <>
                  <Link href="/settings" className={styles.projectTopbarAction}>
                    API 设置
                  </Link>
                  <Link href="/me" className={styles.projectTopbarAction}>
                    我的
                  </Link>
                </>
              )}
            </>
          ) : null}
        </div>
      </header>

      <div className={shellStyles.body}>
        <div className={[shellStyles.shell, shellStyles.shellWide].join(" ")}>
          {needsLogin ? (
            <section className={styles.loginPanel}>
              <h2>先登录再管理项目</h2>
              <p>项目、工作台、剧本、画布、素材和画廊都绑定账号保存。</p>
              <Link href="/login?next=/projects">去登录</Link>
            </section>
          ) : null}

          {!needsLogin ? <div className={styles.toolbar}>
            <button
              type="button"
              onClick={openCreateDialog}
              className={styles.toolbarCreate}
            >
              新建项目
            </button>
            <div className={styles.toolbarRight}>
              <span className={shellStyles.helpText}>共 {visible.length} 个项目</span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索项目名称…"
                className={styles.search}
              />
              <div
                className={styles.sortField}
                onBlur={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSortMenuOpen(false);
                }}
              >
                <span className={styles.sortLabel}>排序</span>
                <button
                  type="button"
                  className={styles.sortButton}
                  aria-haspopup="menu"
                  aria-expanded={sortMenuOpen}
                  onClick={() => setSortMenuOpen((open) => !open)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setSortMenuOpen(false);
                  }}
                >
                  <span>{sortLabel}</span>
                  <span className={styles.sortChevron} aria-hidden>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <path
                        d="m6 9 6 6 6-6"
                        stroke="currentColor"
                        strokeWidth="3.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                </button>
                {sortMenuOpen ? (
                  <div className={styles.sortMenu} role="menu">
                    {SORT_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        role="menuitemradio"
                        aria-checked={sortKey === option.value}
                        className={[styles.sortOption, sortKey === option.value ? styles.sortOptionActive : ""].filter(Boolean).join(" ")}
                        onClick={() => {
                          setSortKey(option.value);
                          setSortMenuOpen(false);
                        }}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div> : null}

          {!needsLogin && visible.length > 0 ? (
            <div className={styles.grid}>
              {visible.map((p) => {
                const created = formatDate(p.createdAt);
                const isSaving = savingProjectId === p.id;
                const nameError = projectNameError?.id === p.id ? projectNameError.message : "";
                const assetCounts = p.assetCounts ?? { character: 0, prop: 0, scene: 0 };
                const generationCounts = p.generationCounts ?? { image: 0, video: 0 };
                return (
                  <article
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
                    className={styles.projectCard}
                  >
                    <div className={styles.projectCardHead}>
                      <span className={styles.projectCreated}>{created ? `创建 ${created}` : "创建日期未知"}</span>
                    </div>
                    <div className={styles.projectBody}>
                      <label
                        className={styles.projectNameField}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span className={styles.projectNameAssist}>
                          {isSaving ? "保存中" : "项目名称"}
                        </span>
                        <span className={styles.projectNameControl}>
                          <input
                            key={`${p.id}:${p.name}`}
                            defaultValue={p.name}
                            className={styles.projectNameInput}
                            disabled={isSaving}
                            aria-label="项目名称"
                            onBlur={(e) => handleProjectNameBlur(e, p)}
                            onKeyDown={(e) => handleProjectNameKeyDown(e, p)}
                            onFocus={(e) => e.currentTarget.select()}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <span className={styles.projectNameIcon}>
                            <PencilIcon />
                          </span>
                        </span>
                      </label>
                      {nameError ? <p className={styles.projectNameError}>{nameError}</p> : null}
                      <div className={styles.projectCountBlock} aria-label="项目资源统计">
                        <span className={styles.projectCountTitle}>素材</span>
                        <div className={styles.projectCountChips}>
                          <span>角色 {assetCounts.character}</span>
                          <span>道具 {assetCounts.prop}</span>
                          <span>场景 {assetCounts.scene}</span>
                        </div>
                      </div>
                      <div className={styles.projectCountBlock} aria-label="项目生成记录统计">
                        <span className={styles.projectCountTitle}>生成记录</span>
                        <div className={styles.projectCountChips}>
                          <span>图片 {generationCounts.image}</span>
                          <span>视频 {generationCounts.video}</span>
                        </div>
                      </div>
                    </div>
                    <div className={styles.projectCardActions}>
                      <button
                        type="button"
                        onClick={(e) => handleDelete(e, p)}
                        className={styles.removeBtn}
                        title="删除项目"
                        aria-label="删除项目"
                      >
                        ×
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : !needsLogin ? (
            <p className={shellStyles.helpText} style={{ textAlign: "center", marginTop: 24 }}>
              {!loaded
                ? "加载中…"
                : query.trim()
                  ? "没有匹配的项目，换个关键词试试。"
                  : "暂无项目，点击搜索栏左侧「新建项目」开始。"}
            </p>
          ) : null}
        </div>
      </div>
    </main>
  );
}

export default function ProjectsPage() {
  return <ProjectsHubInner />;
}
