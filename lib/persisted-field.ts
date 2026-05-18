/** 读取用户持久化字段：空白则使用代码内默认值（实现「换浏览器不丢」的回填） */
export function pickNonEmptyTrimmed(stored: unknown, fallback: string): string {
  if (typeof stored !== "string") return fallback;
  const t = stored.trim();
  return t.length > 0 ? t : fallback;
}
