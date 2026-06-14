import { notFound } from "next/navigation";
import { ProjectCanvasWorkspace } from "@/components/project-canvas/ProjectCanvasWorkspace";

type ProjectCanvasPageProps = {
  params: Promise<{
    projectId: string;
  }>;
};

export default async function ProjectCanvasPage({ params }: ProjectCanvasPageProps) {
  const { projectId } = await params;
  if (!projectId) notFound();

  return <ProjectCanvasWorkspace projectId={projectId} />;
}
