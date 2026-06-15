"use client";

import { useEffect, useState } from "react";
import CanvasBoardPage from "@/app/canvas/[id]/page";
import shellStyles from "@/app/shared/shell.module.css";
import { ProjectCanvasRouteProvider } from "./project-canvas-route-context";
import {
  buildProjectCanvasDisplayTitle,
  resolveProjectCanvasBoard,
  type ProjectCanvasResolution,
} from "./project-canvas";

type ProjectCanvasWorkspaceProps = {
  projectId: string;
};

export function ProjectCanvasWorkspace({ projectId }: ProjectCanvasWorkspaceProps) {
  const [resolution, setResolution] = useState<ProjectCanvasResolution | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setResolution(null);
    setError("");

    void resolveProjectCanvasBoard(projectId)
      .then((result) => {
        if (!cancelled) setResolution(result);
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "主画布无法加载");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (error) {
    return (
      <main className={shellStyles.page}>
        <div className={shellStyles.empty}>{error}</div>
      </main>
    );
  }

  if (!resolution) {
    return (
      <main className={shellStyles.page}>
        <div className={shellStyles.empty}>正在准备项目主画布...</div>
      </main>
    );
  }

  return (
    <ProjectCanvasRouteProvider
      value={{
        projectId,
        boardId: resolution.board.id,
        backHref: "/projects",
        backLabel: "返回项目列表",
        displayTitle: buildProjectCanvasDisplayTitle(resolution.project),
        titleEditable: false,
      }}
    >
      <CanvasBoardPage />
    </ProjectCanvasRouteProvider>
  );
}
