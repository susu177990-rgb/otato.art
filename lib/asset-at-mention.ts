/**
 * STAGE 5/6/7 资产 @ 引用：解析与提取。
 *
 * **标准注册名**（设定集起强制）：`@主称谓（中文名）`
 * - `主称谓`：人物可为英文 credit 名（可含空格）、物品/场景可为英文或项目内主名。
 * - 括号为 **全角** `（` `）`，括号内为 **中文** 全称或官方中文名，**禁止省略**。
 * - 示例：`@Claire Hart（克莱尔·哈特）`、`@Time Turner（时间转换器）`、`@The Palm（棕榈酒吧）`
 *
 * **兼容旧稿**：`@主名` 无括号，或 `@中文名(半角英文名)`。
 */

/**
 * 捕获组 1 = `@` 后的注册名片段。
 * 使用正则字面量，避免 `new RegExp(长字符串)` 时反斜杠/括号转义出错。
 */
const ASSET_MENTION_RE =
  /@((?:[^@\n]+?（[^）]+）)|(?:[^\s:：,，;；（\n@∆]+(?:\([^)]*\))?))/g;

export function extractAtMentionBodiesFromText(text: string): string[] {
  const out: string[] = [];
  forEachAssetMention(text, (name) => {
    if (name) out.push(name);
  });
  return out;
}

/** 按出现顺序遍历；`index` 为 `@` 在全文中的下标，`fullMatch` 含 `@`。 */
export function forEachAssetMention(
  text: string,
  cb: (name: string, index: number, fullMatch: string) => void
): void {
  const re = new RegExp(ASSET_MENTION_RE.source, ASSET_MENTION_RE.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const n = m[1].trim();
    if (n) cb(n, m.index, m[0]);
  }
}

export function extractAtMentionBodiesUnique(text: string): Set<string> {
  return new Set(extractAtMentionBodiesFromText(text));
}
