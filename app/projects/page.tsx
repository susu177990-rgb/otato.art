"use client";

import { useState, useEffect, useCallback, useMemo, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useProjectWorkspace } from "@/components/project/ProjectProvider";
import type { ProjectSummary } from "@/lib/types";
import { STAGE_LABELS } from "@/lib/types";
import shellStyles from "../shared/shell.module.css";
import styles from "./projects-page.module.css";

type SortKey = "updated" | "stage" | "name";

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
  const { openCreateDialog, openDeleteDialog } = useProjectWorkspace();

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("updated");

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

  function handleOpen(id: string) {
    router.push(`/projects/${encodeURIComponent(id)}`);
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
    <main className={shellStyles.page}>
      <header className={styles.projectTopbar}>
        <div className={styles.projectTopbarIdentity}>
          <Link href="/" className={styles.projectTopbarBack}>
            首页
          </Link>
          <span className={styles.projectTopbarTitle}>项目</span>
        </div>

        <nav className={styles.projectTopbarModes} aria-label="项目入口">
          <span className={styles.projectTopbarModeActive}>项目列表</span>
          <Link href="/prompt" className={styles.projectTopbarMode}>
            预设社区
          </Link>
        </nav>

        <div className={styles.projectTopbarActions}>
          {needsLogin ? (
            <Link href="/login?next=/projects" className={styles.projectTopbarAction}>
              登录
            </Link>
          ) : (
            <button
              type="button"
              onClick={openCreateDialog}
              className={styles.projectTopbarAction}
            >
              新建项目
            </button>
          )}
        </div>
      </header>

      <div className={shellStyles.body}>
        <div className={[shellStyles.shell, shellStyles.shellWide].join(" ")}>
          <section className={styles.hero}>
            <span>PROJECTS</span>
            <h1>项目</h1>
            <p>只填写项目名称即可立项；进入项目后再切换工作台、剧本和无限画布。</p>
          </section>

          {needsLogin ? (
            <section className={styles.loginPanel}>
              <h2>先登录再管理项目</h2>
              <p>项目、工作台、剧本、画布、素材和画廊都绑定账号保存。</p>
              <Link href="/login?next=/projects">去登录</Link>
            </section>
          ) : null}

          {!needsLogin ? <div className={styles.toolbar}>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索项目名称…"
              className={[shellStyles.input, styles.search].join(" ")}
            />
            <label className={styles.sortField}>
              <span className={shellStyles.fieldLabel}>排序</span>
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                className={[shellStyles.select, shellStyles.inputCompact].join(" ")}
              >
                <option value="updated">按更新时间</option>
                <option value="stage">按已验阶段</option>
                <option value="name">按名称</option>
              </select>
            </label>
            <span className={shellStyles.helpText}>共 {visible.length} 个项目</span>
          </div> : null}

          {!needsLogin && visible.length > 0 ? (
            <div className={styles.grid}>
              {visible.map((p) => {
                const stageLabel = p.currentStage > 0
                  ? STAGE_LABELS[p.currentStage] || `STAGE ${p.currentStage}`
                  : "未开始";
                const approved = p.maxApprovedStage ?? 0;
                const seriesBibleOk = Boolean(p.seriesBibleFilled);
                const onboardingPending = p.onboardingStatus && p.onboardingStatus !== "ready";
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
                    <div className={styles.projectBody}>
                      <h2 className={styles.projectTitle}>{p.name}</h2>
                      <p className={styles.projectStage}>{stageLabel}</p>
                      <div className={styles.projectMeta}>
                        {p.creativeDirectionLabel ? (
                          <span className={shellStyles.metaPill} title="创作方向">
                            {p.creativeDirectionLabel}
                          </span>
                        ) : null}
                        <span
                          className={[
                            shellStyles.metaPill,
                            approved > 0 ? shellStyles.metaPillOk : shellStyles.metaPillMute,
                          ].join(" ")}
                          title="工程已验收的最高阶段"
                        >
                          已验至 {approved > 0 ? `S${approved}` : "—"}
                        </span>
                        {p.episodeCount ? (
                          <span className={shellStyles.metaPill} title="目标集数">
                            {p.episodeCount.includes("集") ? p.episodeCount : `${p.episodeCount} 集`}
                          </span>
                        ) : null}
                        <span
                          className={[
                            shellStyles.metaPill,
                            seriesBibleOk ? shellStyles.metaPillOk : shellStyles.metaPillMute,
                          ].join(" ")}
                          title="是否已生成系列圣经"
                        >
                          圣经 {seriesBibleOk ? "✓" : "·"}
                        </span>
                        {onboardingPending ? (
                          <span className={[shellStyles.metaPill, styles.metaPillPending].join(" ")}>
                            {p.onboardingStatus === "pending_setup" ? "待立项" : "策划中"}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className={styles.projectFoot}>
                      {formatUpdated(p.updatedAt) ? `更新 ${formatUpdated(p.updatedAt)}` : "\u00a0"}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => handleDelete(e, p)}
                      className={styles.removeBtn}
                      title="删除项目"
                      aria-label="删除项目"
                    >
                      ×
                    </button>
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
                  : "暂无项目，点击右上「新建项目」开始。"}
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
