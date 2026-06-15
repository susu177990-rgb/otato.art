"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ProjectAssetLibrary } from "@/components/project-assets";
import { ProjectModeBar } from "./ProjectModeBar";
import { useProjectWorkspace } from "./ProjectProvider";
import styles from "./project-shell.module.css";

const WORKSPACE_PRESET_EVENTS: Record<string, string> = {
  chat: "otato:open-chat-prompt-presets",
  image: "otato:open-image-prompt-presets",
  video: "otato:open-video-prompt-presets",
};

export function ProjectShell({ children }: { children: ReactNode }) {
  const { project, projectId, loading, error, refreshProject } = useProjectWorkspace();
  const pathname = usePathname();
  const router = useRouter();
  const [assetsOpen, setAssetsOpen] = useState(false);
  const blocked = Boolean(projectId && (loading || error || !project));
  const isWorkspaceRoute = pathname.includes("/workspace/");
  const workspaceMode = pathname.match(/\/workspace\/([^/]+)/)?.[1] ?? "";

  function openPresets() {
    const eventName = WORKSPACE_PRESET_EVENTS[workspaceMode];
    if (eventName) {
      window.dispatchEvent(new CustomEvent(eventName));
      return;
    }
    router.push("/prompt");
  }

  return (
    <main className={styles.shell}>
      <ProjectModeBar onOpenAssets={() => setAssetsOpen(true)} onOpenPresets={openPresets} />
      <div className={[styles.content, isWorkspaceRoute ? styles.workspaceContent : ""].filter(Boolean).join(" ")}>
        {blocked ? (
          <section className={styles.state} aria-live="polite">
            <span>{loading ? "PROJECT LOADING" : "PROJECT UNAVAILABLE"}</span>
            <h1>{loading ? "正在加载项目" : error || "项目不可用"}</h1>
            <p>{loading ? "正在确认项目归属和工作区权限。" : "请返回项目列表，选择有权限访问的项目。"}</p>
            {!loading ? (
              <div className={styles.stateActions}>
                <button type="button" onClick={() => void refreshProject()}>
                  重新加载项目
                </button>
                <Link href="/projects">返回项目列表</Link>
              </div>
            ) : null}
          </section>
        ) : (
          children
        )}
      </div>
      {assetsOpen && projectId && project ? (
        <div className={styles.drawerScrim} role="presentation" onMouseDown={() => setAssetsOpen(false)}>
          <aside
            className={styles.drawer}
            role="dialog"
            aria-modal="true"
            aria-label="项目素材与画廊"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <ProjectAssetLibrary projectId={projectId} onClose={() => setAssetsOpen(false)} />
          </aside>
        </div>
      ) : null}
    </main>
  );
}
