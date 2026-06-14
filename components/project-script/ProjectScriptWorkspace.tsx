"use client";

import StudioPage from "@/app/studio/[id]/page";
import { ProjectScriptRouteProvider } from "./project-script-route-context";

type ProjectScriptWorkspaceProps = {
  projectId: string;
};

export function ProjectScriptWorkspace({ projectId }: ProjectScriptWorkspaceProps) {
  return (
    <ProjectScriptRouteProvider
      value={{
        projectId,
        backHref: `/projects/${encodeURIComponent(projectId)}`,
        requireOnboarding: false,
      }}
    >
      <StudioPage />
    </ProjectScriptRouteProvider>
  );
}
