import type { ReactNode } from "react";
import { ProjectProvider } from "@/components/project/ProjectProvider";

export default function ProjectsLayout({ children }: { children: ReactNode }) {
  return <ProjectProvider>{children}</ProjectProvider>;
}
