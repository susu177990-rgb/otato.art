import Link from "next/link";
import styles from "./workspace-mode-nav.module.css";
import {
  WORKSPACE_MODE_DEFINITIONS,
  buildProjectWorkspaceHref,
  type WorkspaceMode,
} from "./workspace-modes";

type WorkspaceModeNavProps = {
  projectId: string;
  activeMode: WorkspaceMode;
};

export function WorkspaceModeNav({ projectId, activeMode }: WorkspaceModeNavProps) {
  return (
    <nav className={styles.nav} aria-label="工作台模块">
      {WORKSPACE_MODE_DEFINITIONS.map(({ mode, label }) => {
        const active = mode === activeMode;
        return (
          <Link
            key={mode}
            href={buildProjectWorkspaceHref(projectId, mode)}
            className={[styles.link, active ? styles.linkActive : ""].filter(Boolean).join(" ")}
            aria-current={active ? "page" : undefined}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
