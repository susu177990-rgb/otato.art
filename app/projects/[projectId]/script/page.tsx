import { notFound } from "next/navigation";
import { ProjectScriptWorkspace } from "@/components/project-script/ProjectScriptWorkspace";

type ProjectScriptPageProps = {
  params: Promise<{
    projectId: string;
  }>;
};

export default async function ProjectScriptPage({ params }: ProjectScriptPageProps) {
  const { projectId } = await params;
  if (!projectId) notFound();

  return <ProjectScriptWorkspace projectId={projectId} />;
}
