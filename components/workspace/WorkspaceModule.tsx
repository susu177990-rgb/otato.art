"use client";

import type { ComponentType } from "react";
import { ChatWorkspaceModule } from "./modules/ChatWorkspaceModule";
import { ImageWorkspaceModule } from "./modules/ImageWorkspaceModule";
import { VideoWorkspaceModule } from "./modules/VideoWorkspaceModule";
import type { WorkspaceMode } from "./workspace-modes";

const WORKSPACE_MODULES: Record<WorkspaceMode, ComponentType> = {
  chat: ChatWorkspaceModule,
  image: ImageWorkspaceModule,
  video: VideoWorkspaceModule,
};

export function WorkspaceModule({ mode }: { mode: WorkspaceMode }) {
  const Module = WORKSPACE_MODULES[mode];
  return <Module />;
}
