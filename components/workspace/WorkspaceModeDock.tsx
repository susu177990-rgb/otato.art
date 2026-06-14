"use client";

import Link from "next/link";
import { useOptionalWorkspaceProject } from "./WorkspaceProjectContext";
import {
  WORKSPACE_MODE_DEFINITIONS,
  buildProjectWorkspaceHref,
} from "./workspace-modes";
import styles from "./workspace-mode-dock.module.css";

export function WorkspaceModeDock({ className }: { className?: string }) {
  const workspaceProject = useOptionalWorkspaceProject();
  if (!workspaceProject?.projectId) return null;

  return (
    <nav className={[styles.dock, className ?? ""].filter(Boolean).join(" ")} aria-label="工作台模块">
      {WORKSPACE_MODE_DEFINITIONS.map(({ mode, label }) => {
        const active = mode === workspaceProject.mode;
        return (
          <Link
            key={mode}
            href={buildProjectWorkspaceHref(workspaceProject.projectId, mode)}
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
