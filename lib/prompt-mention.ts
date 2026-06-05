export type MentionType = "gallery" | "node";

export type MentionItem = {
  name: string;
  type: MentionType;
  id: string;
};

/**
 * 提取所有 @[Name](type:id) 引用
 */
export function parseMentions(prompt: string): MentionItem[] {
  const regex = /@\[([^\]]+)\]\((gallery|node):([^\)]+)\)/g;
  const matches: MentionItem[] = [];
  let match;
  while ((match = regex.exec(prompt)) !== null) {
    matches.push({
      name: match[1],
      type: match[2] as MentionType,
      id: match[3],
    });
  }
  return matches;
}

/**
 * 解析并清洗提示词，提取对应的素材 URL（图片/视频）或直接展开文本内容。
 */
export function resolveMentions(
  prompt: string,
  options: {
    galleryRecords?: Array<{ id: string; imageUrl?: string; videoUrl?: string; [key: string]: any }>;
    canvasNodes?: Array<{
      id: string;
      type: string;
      title: string;
      metadata?: { imageUrl?: string; videoUrl?: string; text?: string; [key: string]: any };
    }>;
  },
): {
  cleanedPrompt: string;
  refImages: string[]; // 收集到的所有参考图片 url (dataUrl 或 http url)
  refVideos: string[]; // 收集到的所有参考视频 url
} {
  const galleryRecords = options.galleryRecords ?? [];
  const canvasNodes = options.canvasNodes ?? [];

  const refImages: string[] = [];
  const refVideos: string[] = [];

  // 使用 replace 的回调来逐个解析并清洗替换
  const cleanedPrompt = prompt.replace(
    /@\[([^\]]+)\]\((gallery|node):([^\)]+)\)/g,
    (match, name, type, id) => {
      if (type === "gallery") {
        const record = galleryRecords.find((r) => r.id === id);
        if (record) {
          const url = record.imageUrl || record.videoUrl;
          if (url) {
            if (record.videoUrl && !record.imageUrl) {
              refVideos.push(url);
            } else {
              refImages.push(url);
            }
          }
        }
        return name; // 将 @[图片](gallery:id) 替换为 纯文本 "图片"
      } else if (type === "node") {
        const node = canvasNodes.find((n) => n.id === id);
        if (node) {
          if (node.type === "text") {
            // 文本节点：直接 inline 展开其文本内容
            return node.metadata?.text ?? "";
          }
          if (node.type === "image") {
            const url = node.metadata?.imageUrl || node.metadata?.previewImageUrl;
            if (url) refImages.push(url);
          } else if (node.type === "video") {
            const url = node.metadata?.videoUrl || node.metadata?.previewVideoUrl;
            if (url) refVideos.push(url);
          }
        }
        return name;
      }
      return name;
    },
  );

  return {
    cleanedPrompt,
    refImages: Array.from(new Set(refImages)), // 去重
    refVideos: Array.from(new Set(refVideos)),
  };
}
