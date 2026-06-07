export type MediaKind = "image" | "video" | "audio";

const IMAGE_EXTENSIONS = new Set(["avif", "gif", "jpeg", "jpg", "png", "webp"]);
const VIDEO_EXTENSIONS = new Set(["mov", "mp4", "m4v", "webm"]);
const AUDIO_EXTENSIONS = new Set(["aac", "aif", "aiff", "flac", "m4a", "mp3", "oga", "ogg", "opus", "wav"]);

function extensionFromName(name: string | undefined): string {
  const match = name?.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? "";
}

export function detectMediaKind(file: File, preferredKind?: MediaKind): MediaKind | null {
  const ext = extensionFromName(file.name);
  if (preferredKind) {
    if (preferredKind === "image" && (file.type.startsWith("image/") || IMAGE_EXTENSIONS.has(ext))) return "image";
    if (preferredKind === "audio" && (file.type.startsWith("audio/") || AUDIO_EXTENSIONS.has(ext))) return "audio";
    if (preferredKind === "video" && (file.type.startsWith("video/") || VIDEO_EXTENSIONS.has(ext))) return "video";
  }

  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("audio/")) return "audio";
  if (AUDIO_EXTENSIONS.has(ext)) return "audio";
  if (file.type.startsWith("video/")) return "video";
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (VIDEO_EXTENSIONS.has(ext)) return "video";
  return null;
}

export function mediaFileMatchesKind(file: File, kind: MediaKind): boolean {
  return detectMediaKind(file, kind) === kind;
}

export function mediaFileExtension(file: File, kind?: MediaKind): string {
  const ext = extensionFromName(file.name);
  if (kind === "audio" && AUDIO_EXTENSIONS.has(ext)) return ext;
  if (kind === "video" && VIDEO_EXTENSIONS.has(ext)) return ext;
  if (kind === "image" && IMAGE_EXTENSIONS.has(ext)) return ext === "jpeg" ? "jpg" : ext;

  const t = file.type.toLowerCase();
  if (t.includes("mpeg") || t.includes("mp3")) return "mp3";
  if (t.includes("wav")) return "wav";
  if (t.includes("aac")) return "aac";
  if (t.includes("ogg")) return "ogg";
  if (t.includes("flac")) return "flac";
  if (t.includes("quicktime")) return "mov";
  if (t.includes("webm")) return "webm";
  if (t.includes("mp4")) return kind === "audio" ? "m4a" : "mp4";
  if (t.includes("jpeg") || t.includes("jpg")) return "jpg";
  if (t.includes("webp")) return "webp";
  if (t.includes("gif")) return "gif";

  if (kind === "audio") return "mp3";
  if (kind === "video") return "mp4";
  return "png";
}

export function mediaFallbackMime(kind: MediaKind): string {
  if (kind === "audio") return "audio/mpeg";
  if (kind === "video") return "video/mp4";
  return "image/png";
}

export function mediaContentType(file: File, kind: MediaKind): string {
  return mediaFileMatchesKind(file, kind) && file.type.startsWith(`${kind}/`)
    ? file.type
    : mediaFallbackMime(kind);
}
