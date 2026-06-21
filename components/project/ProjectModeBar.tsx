"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TopbarAccountActions } from "@/components/TopbarAccountActions";
import { useProjectWorkspace } from "./ProjectProvider";
import { PROJECT_MODES, projectModeFromPathname, projectModeHref } from "./project-routes";
import styles from "./project-mode-bar.module.css";

type ProjectModeBarProps = {
  onOpenAssets?: () => void;
  onOpenPresets?: () => void;
};

export function ProjectModeBar({ onOpenAssets, onOpenPresets }: ProjectModeBarProps) {
  const pathname = usePathname();
  const { project, projectId, loading, error, openRenameDialog } = useProjectWorkspace();
  const activeMode = projectId ? projectModeFromPathname(pathname, projectId) : "workspace";

  return (
    <header className={styles.bar}>
      <div className={styles.identity}>
        <Link href="/projects" className={styles.backLink}>
          项目
        </Link>
        <button
          type="button"
          className={styles.projectName}
          onClick={openRenameDialog}
          disabled={!project}
          title={project ? "修改项目名称" : undefined}
        >
          {loading ? "加载项目..." : error || project?.name || "项目"}
        </button>
      </div>

      <nav className={styles.modes} aria-label="项目模式">
        {PROJECT_MODES.map((mode) => (
          <Link
            key={mode.id}
            href={projectId ? projectModeHref(projectId, mode.id) : "/projects"}
            className={activeMode === mode.id ? styles.modeActive : styles.mode}
            aria-current={activeMode === mode.id ? "page" : undefined}
          >
            {mode.label}
          </Link>
        ))}
      </nav>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.presetButton}
          onClick={onOpenPresets}
          disabled={!project}
        >
          预设
        </button>
        <button
          type="button"
          className={styles.assetButton}
          onClick={onOpenAssets}
          disabled={!project}
        >
          素材 / 画廊
        </button>
        <TopbarAccountActions linkClassName={styles.accountLink} />
      </div>
    </header>
  );
}
