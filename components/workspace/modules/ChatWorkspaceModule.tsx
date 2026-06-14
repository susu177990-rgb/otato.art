"use client";

import { ChatWorkspace } from "@/components/chat/ChatWorkspace";
import { useWorkspaceProject } from "../WorkspaceProjectContext";

export function ChatWorkspaceModule() {
  const { projectId } = useWorkspaceProject();
  return <ChatWorkspace projectId={projectId} />;
}
