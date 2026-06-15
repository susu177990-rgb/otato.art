import { redirect } from "next/navigation";
import { projectModeHref } from "@/components/project/project-routes";

type ProjectRootPageProps = {
  params: Promise<{
    projectId: string;
  }>;
};

export default async function ProjectRootPage({ params }: ProjectRootPageProps) {
  const { projectId } = await params;
  redirect(projectModeHref(projectId, "workspace"));
}
