export type AssetMentionType =
  | "slot"
  | "node"
  | "gallery-image"
  | "gallery-video"
  | "gallery-audio"
  | "project-asset";

export type AssetMentionRole =
  | "prompt"
  | "image_reference"
  | "start_frame"
  | "end_frame"
  | "video_reference"
  | "motion_source_video"
  | "audio_reference";

export type AssetMentionCandidate = {
  id: string;
  label: string;
  type: AssetMentionType;
  role?: AssetMentionRole;
  groupLabel?: string;
  description?: string;
  thumbnailUrl?: string;
  url?: string;
  referenceUrls?: string[];
  text?: string;
  nodeType?: "text" | "image" | "video" | "audio";
  durationSeconds?: number;
};

export type ParsedAssetMention = {
  raw: string;
  label: string;
  type: AssetMentionType;
  id: string;
  role?: AssetMentionRole;
  index: number;
};

export type ResolvedAssetMention = ParsedAssetMention & {
  candidate?: AssetMentionCandidate;
  missing: boolean;
};

export type AssetMentionResolution = {
  prompt: string;
  mentions: ResolvedAssetMention[];
  missingMentions: ResolvedAssetMention[];
  hasMentions: boolean;
};

const MENTION_RE = /@\[([^\]]+)\]\(([^)]+)\)/g;

function normalizeType(raw: string): AssetMentionType | null {
  if (
    raw === "slot" ||
    raw === "node" ||
    raw === "gallery-image" ||
    raw === "gallery-video" ||
    raw === "gallery-audio" ||
    raw === "project-asset"
  ) {
    return raw;
  }
  if (raw === "gallery") return "gallery-image";
  return null;
}

function normalizeRole(raw: string | null): AssetMentionRole | undefined {
  if (
    raw === "prompt" ||
    raw === "image_reference" ||
    raw === "start_frame" ||
    raw === "end_frame" ||
    raw === "video_reference" ||
    raw === "motion_source_video" ||
    raw === "audio_reference"
  ) {
    return raw;
  }
  return undefined;
}

function decodePart(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function encodePart(value: string): string {
  return encodeURIComponent(value);
}

function unescapeLabel(label: string): string {
  return label.replace(/\\([\]\\])/g, "$1");
}

function escapeLabel(label: string): string {
  return label.replace(/\\/g, "\\\\").replace(/\]/g, "\\]");
}

export function assetMentionKey(input: Pick<AssetMentionCandidate, "type" | "id" | "role">): string {
  return `${input.type}:${input.id}:${input.role ?? ""}`;
}

export function serializeAssetMention(input: Pick<AssetMentionCandidate, "label" | "type" | "id" | "role">): string {
  const role = input.role ? `?role=${encodePart(input.role)}` : "";
  return `@[${escapeLabel(input.label)}](${input.type}:${encodePart(input.id)}${role})`;
}

export function parseAssetMentionTarget(target: string): Omit<ParsedAssetMention, "raw" | "label" | "index"> | null {
  const [head, query = ""] = target.split("?");
  const colonIndex = head.indexOf(":");
  if (colonIndex === -1) return null;
  const type = normalizeType(head.slice(0, colonIndex));
  if (!type) return null;
  const id = decodePart(head.slice(colonIndex + 1));
  if (!id) return null;
  const params = new URLSearchParams(query);
  const role = normalizeRole(params.get("role"));
  return { type, id, role };
}

export function parseAssetMentions(value: string): ParsedAssetMention[] {
  const mentions: ParsedAssetMention[] = [];
  let match: RegExpExecArray | null;
  while ((match = MENTION_RE.exec(value)) !== null) {
    const target = parseAssetMentionTarget(match[2]);
    if (!target) continue;
    mentions.push({
      raw: match[0],
      label: unescapeLabel(match[1]),
      type: target.type,
      id: target.id,
      role: target.role,
      index: match.index,
    });
  }
  return mentions;
}

export function resolveAssetMentions(
  value: string,
  candidates: AssetMentionCandidate[] = [],
  options: {
    replaceMention?: (mention: ResolvedAssetMention) => string;
  } = {},
): AssetMentionResolution {
  const candidateMap = new Map<string, AssetMentionCandidate>();
  for (const candidate of candidates) {
    candidateMap.set(assetMentionKey(candidate), candidate);
    candidateMap.set(assetMentionKey({ ...candidate, role: undefined }), candidate);
  }
  const mentions: ResolvedAssetMention[] = [];
  const prompt = value.replace(MENTION_RE, (raw, labelRaw: string, targetRaw: string, offset: number) => {
    const target = parseAssetMentionTarget(targetRaw);
    if (!target) return raw;
    const parsed: ParsedAssetMention = {
      raw,
      label: unescapeLabel(labelRaw),
      type: target.type,
      id: target.id,
      role: target.role,
      index: offset,
    };
    const key = assetMentionKey(parsed);
    const fallbackKey = assetMentionKey({ ...parsed, role: undefined });
    const candidate = candidateMap.get(key) ?? candidateMap.get(fallbackKey);
    const resolved: ResolvedAssetMention = {
      ...parsed,
      role: parsed.role ?? candidate?.role,
      candidate,
      missing: !candidate,
    };
    mentions.push(resolved);
    return options.replaceMention ? options.replaceMention(resolved) : (candidate?.label ?? parsed.label);
  });

  return {
    prompt,
    mentions,
    missingMentions: mentions.filter((mention) => mention.missing),
    hasMentions: mentions.length > 0,
  };
}

export function hasAssetMentions(value: string): boolean {
  MENTION_RE.lastIndex = 0;
  return MENTION_RE.test(value);
}
