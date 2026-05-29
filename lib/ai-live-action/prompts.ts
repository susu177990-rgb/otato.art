import fs from "fs";
import path from "path";
import { resolveAgentRoot } from "@/lib/agent-paths";

const ROOT = path.join(resolveAgentRoot(), "agent", "ai-live-action", "agents");

export type LiveActionAgentPromptId =
  | "main-orchestrator"
  | "shot-reconstruction-director"
  | "first-frame-redraw-artist";

const FILE_BY_ID: Record<LiveActionAgentPromptId, string> = {
  "main-orchestrator": "main-orchestrator.md",
  "shot-reconstruction-director": "shot-reconstruction-director.md",
  "first-frame-redraw-artist": "first-frame-redraw-artist.md",
};

const cache = new Map<LiveActionAgentPromptId, string>();

export function loadLiveActionAgentPrompt(id: LiveActionAgentPromptId): string {
  const cached = cache.get(id);
  if (cached) return cached;
  const file = path.join(ROOT, FILE_BY_ID[id]);
  const content = fs.readFileSync(file, "utf8");
  cache.set(id, content);
  return content;
}
