export type MentionType = "slot" | "node";

export type MentionItem = {
  name: string;
  type: MentionType;
  id: string;
};

/**
 * 提取所有 @[Name](type:id) 引用，其中 type 可为 slot 或 node
 */
export function parseMentions(prompt: string): MentionItem[] {
  const regex = /@\[([^\]]+)\]\((slot|node):([^\)]+)\)/g;
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
 * 解析并清洗提示词，对于连线的文本节点进行 inline 替换，而对图片槽位等资产仅清洗格式为纯文本“名称”。
 * 同时返回被 inline 替换展开的文本节点 ID 列表，以便在外部构建最终提示词时剔除，避免重复拼接在末尾。
 */
export function resolveMentions(
  prompt: string,
  options: {
    canvasNodes?: Array<{
      id: string;
      type: string;
      title: string;
      metadata?: { text?: string; [key: string]: any };
    }>;
  },
): {
  cleanedPrompt: string;
  resolvedNodeIds: string[]; // 记录已被 inline 替换的文本节点 ID
} {
  const canvasNodes = options.canvasNodes ?? [];
  const resolvedNodeIds: string[] = [];

  const cleanedPrompt = prompt.replace(
    /@\[([^\]]+)\]\((slot|node):([^\)]+)\)/g,
    (match, name, type, id) => {
      if (type === "node") {
        const node = canvasNodes.find((n) => n.id === id);
        if (node) {
          if (node.type === "text") {
            resolvedNodeIds.push(id);
            // 文本节点：直接 inline 展开其文本内容
            return node.metadata?.text ?? "";
          }
        }
      }
      // 对于 slot 或非文本 node，直接替换为纯文本的“名称”
      return name;
    },
  );

  return {
    cleanedPrompt,
    resolvedNodeIds: Array.from(new Set(resolvedNodeIds)),
  };
}
