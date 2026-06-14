"use client";

import Link from "next/link";
import { useProjectWorkspace } from "@/components/project/ProjectProvider";
import { PROJECT_MODES, projectModeHref } from "@/components/project/project-routes";
import { STAGE_LABELS } from "@/lib/types";
import styles from "./project-overview.module.css";

function formatUpdated(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未知";
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ProjectOverviewPage() {
  const { project, projectId, loading, error, refreshProject, openRenameDialog, openDeleteDialog } = useProjectWorkspace();

  if (loading) {
    return <div className={styles.state}>正在加载项目...</div>;
  }

  if (!project || !projectId) {
    return (
      <div className={styles.state}>
        <h1>项目无法打开</h1>
        <p>{error || "项目不存在或当前账号无权访问。"}</p>
        <Link href="/projects">返回项目列表</Link>
      </div>
    );
  }

  const currentStage = project.currentStage > 0
    ? STAGE_LABELS[project.currentStage] || `STAGE ${project.currentStage}`
    : "尚未开始";
  const completedArtifacts = project.artifacts.filter((artifact) => artifact.content.trim()).length;

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>项目总览</p>
          <h1>{project.name}</h1>
          <p className={styles.updated}>最后更新 {formatUpdated(project.updatedAt)}</p>
        </div>
        <div className={styles.heroActions}>
          <button type="button" onClick={openRenameDialog}>修改名称</button>
          <button
            type="button"
            className={styles.deleteButton}
            onClick={() => openDeleteDialog({ id: project.id, name: project.name })}
          >
            删除项目
          </button>
        </div>
      </section>

      {error ? (
        <section className={styles.notice}>
          <span>{error}</span>
          <button type="button" onClick={() => void refreshProject()}>重新加载</button>
        </section>
      ) : null}

      <section className={styles.stats} aria-label="项目状态">
        <article>
          <span>当前阶段</span>
          <strong>{currentStage}</strong>
        </article>
        <article>
          <span>已验收</span>
          <strong>{project.maxApprovedStage ? `S${project.maxApprovedStage}` : "—"}</strong>
        </article>
        <article>
          <span>已有产物</span>
          <strong>{completedArtifacts}</strong>
        </article>
        <article>
          <span>系列圣经</span>
          <strong>{project.seriesBible?.trim() ? "已建立" : "待建立"}</strong>
        </article>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <h2>继续创作</h2>
            <p>所有模式都保留当前项目身份，从顶部模式栏也可以随时切换。</p>
          </div>
        </div>
        <div className={styles.modeGrid}>
          {PROJECT_MODES.filter((mode) => mode.id !== "overview").map((mode, index) => (
            <Link key={mode.id} href={projectModeHref(projectId, mode.id)} className={styles.modeCard}>
              <span className={styles.modeIndex}>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h3>{mode.label}</h3>
                <p>{mode.description}</p>
              </div>
              <span className={styles.arrow} aria-hidden="true">↗</span>
            </Link>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <h2>项目资料</h2>
            <p>总览只呈现当前已有信息，不在这里重复立项表单。</p>
          </div>
          <Link href={`/projects/${encodeURIComponent(projectId)}/script`} className={styles.outlineLink}>
            打开剧本设置
          </Link>
        </div>
        <dl className={styles.details}>
          <div><dt>作品名</dt><dd>{project.meta?.seriesTitle || project.name}</dd></div>
          <div><dt>目标集数</dt><dd>{project.meta?.episodeCount || "未填写"}</dd></div>
          <div><dt>目标市场</dt><dd>{project.meta?.targetMarket || "未填写"}</dd></div>
          <div><dt>对白语言</dt><dd>{project.meta?.dialogueLanguage || "未填写"}</dd></div>
        </dl>
      </section>
    </div>
  );
}
