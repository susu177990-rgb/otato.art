import {
  parseAssetMentions,
  resolveAssetMentions,
  type AssetMentionCandidate,
  type AssetMentionResolution,
  type ParsedAssetMention,
} from "./asset-mentions";

export type MentionType = "slot" | "node" | "gallery-image" | "gallery-video" | "gallery-audio";

export type MentionItem = {
  name: string;
  type: MentionType;
  id: string;
};

export type CanvasMentionNode = {
  id: string;
  type: string;
  title: string;
  metadata?: { text?: string; imageUrl?: string; previewImageUrl?: string; videoUrl?: string; previewVideoUrl?: string; audioUrl?: string };
};

export type CanvasMentionReference = {
  id: string;
  type: "image" | "video" | "audio";
  url: string;
  label: string;
  role?: "prompt" | "image_reference" | "start_frame" | "end_frame" | "video_reference" | "motion_source_video" | "audio_reference";
};

/**
 * Backward-compatible parser for all stored asset mention strings.
 */
export function parseMentions(prompt: string): MentionItem[] {
  return parseAssetMentions(prompt).map((mention) => ({
    name: mention.label,
    type: mention.type,
    id: mention.id,
  }));
}

function candidateForCanvasNode(node: CanvasMentionNode): AssetMentionCandidate {
  const role =
    node.type === "text"
      ? "prompt"
      : node.type === "video"
        ? "video_reference"
        : node.type === "audio"
          ? "audio_reference"
          : "image_reference";
  return {
    id: node.id,
    label: node.title || (node.type === "image" ? "图片" : node.type === "video" ? "视频" : node.type === "audio" ? "音频" : "输入"),
    type: "node",
    role,
    nodeType: node.type === "image" || node.type === "video" || node.type === "audio" || node.type === "text" ? node.type : undefined,
    text: node.metadata?.text,
    url: node.metadata?.imageUrl || node.metadata?.previewImageUrl || node.metadata?.videoUrl || node.metadata?.previewVideoUrl || node.metadata?.audioUrl,
  };
}

function urlForCanvasNode(node: CanvasMentionNode): string {
  if (node.type === "image") return node.metadata?.imageUrl?.trim() || node.metadata?.previewImageUrl?.trim() || "";
  if (node.type === "video") return node.metadata?.videoUrl?.trim() || node.metadata?.previewVideoUrl?.trim() || "";
  if (node.type === "audio") return node.metadata?.audioUrl?.trim() || "";
  return "";
}

function resolveCanvasNodeMention(
  mention: ParsedAssetMention,
  canvasNodes: CanvasMentionNode[],
): { replacement: string; resolvedTextNodeId?: string; reference?: CanvasMentionReference } {
  if (mention.type !== "node") return { replacement: mention.label };
  const node = canvasNodes.find((item) => item.id === mention.id);
  if (!node) return { replacement: mention.label };
  if (node.type === "text") {
    return {
      replacement: node.metadata?.text ?? "",
      resolvedTextNodeId: node.id,
    };
  }
  if (node.type === "image" || node.type === "video" || node.type === "audio") {
    const url = urlForCanvasNode(node);
    return {
      replacement: node.title || mention.label,
      reference: url
        ? {
            id: node.id,
            type: node.type,
            url,
            label: node.title || mention.label,
            role: mention.role,
          }
        : undefined,
    };
  }
  return { replacement: mention.label };
}

/**
 * Resolve prompt mentions and keep the legacy return shape used by image/video/canvas runtimes.
 * Text canvas node mentions are expanded inline; image/video node mentions are returned as references.
 */
export function resolveMentions(
  prompt: string,
  options: {
    canvasNodes?: CanvasMentionNode[];
    candidates?: AssetMentionCandidate[];
  },
): {
  cleanedPrompt: string;
  resolvedNodeIds: string[];
  mentionedReferences: CanvasMentionReference[];
  resolution: AssetMentionResolution;
} {
  const canvasNodes = options.canvasNodes ?? [];
  const candidates = [...(options.candidates ?? []), ...canvasNodes.map(candidateForCanvasNode)];
  const resolvedNodeIds: string[] = [];
  const mentionedReferences: CanvasMentionReference[] = [];

  const resolution = resolveAssetMentions(prompt, candidates, {
    replaceMention: (mention) => {
      const canvasMention = resolveCanvasNodeMention(mention, canvasNodes);
      if (canvasMention.resolvedTextNodeId) resolvedNodeIds.push(canvasMention.resolvedTextNodeId);
      if (canvasMention.reference) mentionedReferences.push(canvasMention.reference);
      return canvasMention.replacement;
    },
  });

  return {
    cleanedPrompt: resolution.prompt,
    resolvedNodeIds: Array.from(new Set(resolvedNodeIds)),
    mentionedReferences: Array.from(new Map(mentionedReferences.map((item) => [item.id, item])).values()),
    resolution,
  };
}

export { parseAssetMentions, resolveAssetMentions };
