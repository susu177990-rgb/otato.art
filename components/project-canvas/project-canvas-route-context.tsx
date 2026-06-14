"use client";

import { createContext, type ReactNode, useContext } from "react";

export type ProjectCanvasRouteOptions = {
  projectId: string;
  boardId: string;
  backHref: string;
  backLabel: string;
  displayTitle: string;
  titleEditable: boolean;
};

const ProjectCanvasRouteContext = createContext<ProjectCanvasRouteOptions | null>(null);

export function ProjectCanvasRouteProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: ProjectCanvasRouteOptions;
}) {
  return (
    <ProjectCanvasRouteContext.Provider value={value}>
      {children}
    </ProjectCanvasRouteContext.Provider>
  );
}

export function useProjectCanvasRouteOptions(): ProjectCanvasRouteOptions | null {
  return useContext(ProjectCanvasRouteContext);
}
