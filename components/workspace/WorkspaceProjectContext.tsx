"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { WorkspaceMode } from "./workspace-modes";

export type WorkspaceProjectContextValue = {
  projectId: string;
  mode: WorkspaceMode;
};

const WorkspaceProjectContext = createContext<WorkspaceProjectContextValue | null>(null);

type WorkspaceProjectProviderProps = WorkspaceProjectContextValue & {
  children: ReactNode;
};

export function WorkspaceProjectProvider({
  projectId,
  mode,
  children,
}: WorkspaceProjectProviderProps) {
  return (
    <WorkspaceProjectContext.Provider value={{ projectId, mode }}>
      {children}
    </WorkspaceProjectContext.Provider>
  );
}

export function useWorkspaceProject(): WorkspaceProjectContextValue {
  const context = useContext(WorkspaceProjectContext);
  if (!context) {
    throw new Error("useWorkspaceProject 必须在 WorkspaceProjectProvider 内使用");
  }
  return context;
}

export function useOptionalWorkspaceProject(): WorkspaceProjectContextValue | null {
  return useContext(WorkspaceProjectContext);
}
