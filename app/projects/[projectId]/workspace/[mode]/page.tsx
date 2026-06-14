import { notFound } from "next/navigation";
import { WorkspaceModule } from "@/components/workspace/WorkspaceModule";
import { WorkspaceProjectProvider } from "@/components/workspace/WorkspaceProjectContext";
import { isWorkspaceMode } from "@/components/workspace/workspace-modes";

type ProjectWorkspacePageProps = {
  params: Promise<{
    projectId: string;
    mode: string;
  }>;
};

export default async function ProjectWorkspacePage({
  params,
}: ProjectWorkspacePageProps) {
  const { projectId, mode } = await params;

  if (!projectId || !isWorkspaceMode(mode)) {
    notFound();
  }

  return (
    <WorkspaceProjectProvider projectId={projectId} mode={mode}>
      <WorkspaceModule mode={mode} />
    </WorkspaceProjectProvider>
  );
}
