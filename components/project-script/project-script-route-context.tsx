"use client";

import { createContext, type ReactNode, useContext } from "react";

export type ProjectScriptRouteOptions = {
  projectId: string;
  backHref: string;
  requireOnboarding: boolean;
};

const ProjectScriptRouteContext = createContext<ProjectScriptRouteOptions | null>(null);

export function ProjectScriptRouteProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: ProjectScriptRouteOptions;
}) {
  return (
    <ProjectScriptRouteContext.Provider value={value}>
      {children}
    </ProjectScriptRouteContext.Provider>
  );
}

export function useProjectScriptRouteOptions(): ProjectScriptRouteOptions | null {
  return useContext(ProjectScriptRouteContext);
}
