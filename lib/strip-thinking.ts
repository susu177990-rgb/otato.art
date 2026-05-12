/**
 * 剥离模型「思考」块，避免进入对话区、产物解析与阶段检测。
 * 覆盖常见开闭标签组合及流式输出时尚未闭合的起始标签。
 */

const COMPLETE_BLOCK_RES: RegExp[] = [
  /<redacted_thinking>[\s\S]*?<\/redacted_thinking>/gi,
  /<redacted_thinking>[\s\S]*?<\/think>/gi,
  /<redacted_thinking>[\s\S]*?<\/redacted_reasoning>/gi,
  /<thinking>[\s\S]*?<\/thinking>/gi,
];

/** 流式过程中仅出现起始标签、尚无闭合时，截断到起始标签之前 */
const UNCLOSED_OPENER_RES: RegExp[] = [
  /<redacted_thinking>[\s\S]*$/i,
  /<thinking>[\s\S]*$/i,
];

export function stripThinkingBlocks(content: string): string {
  let s = content;
  for (let i = 0; i < 5; i++) {
    const before = s;
    for (const re of COMPLETE_BLOCK_RES) {
      s = s.replace(re, "");
    }
    if (s === before) break;
  }
  return s;
}

/** 用于聊天区展示（含流式未完成块） */
export function stripThinkingForDisplay(content: string): string {
  let s = stripThinkingBlocks(content);
  for (const re of UNCLOSED_OPENER_RES) {
    s = s.replace(re, "");
  }
  return s.trimStart();
}
