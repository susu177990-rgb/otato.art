"use client";

import OnboardingPage from "@/app/project/[id]/onboarding/page";
import { useProjectWorkspace } from "@/components/project/ProjectProvider";
import { ProjectScriptEditor } from "./ProjectScriptEditor";
import { ProjectScriptRouteProvider } from "./project-script-route-context";

type ProjectScriptWorkspaceProps = {
  projectId: string;
};

export function ProjectScriptWorkspace({ projectId }: ProjectScriptWorkspaceProps) {
  const { project, refreshProject } = useProjectWorkspace();
  const encodedProjectId = encodeURIComponent(projectId);
  const scriptHref = `/projects/${encodedProjectId}/script`;
  const onboardingHref = `${scriptHref}`;
  const onboardingStatus = project?.onboardingStatus ?? "ready";

  if (project && onboardingStatus !== "ready") {
    return (
      <OnboardingPage
        projectId={projectId}
        embedded
        backHref="/projects"
        completionHref={scriptHref}
        onCompleted={refreshProject}
      />
    );
  }

  return (
    <ProjectScriptRouteProvider
      value={{
        projectId,
        backHref: "/projects",
        onboardingHref,
        onRestartOnboarding: refreshProject,
        requireOnboarding: true,
      }}
    >
      <ProjectScriptEditor />
    </ProjectScriptRouteProvider>
  );
}
