/**
 * 从策划/规划师助手整段回复中截取《创作思路确认书》Markdown 正文，
 * 去掉前后的会话性说明（如「策划会话最终对齐」「请回复确认书已锁定」等）。
 */

const DOC_HEADING_RES: RegExp[] = [
  /^#\s*《创作思路确认书》\s*$/m,
  /^#\s*创作思路确认书\s*$/m,
  /^#\s*《创作思路确认书》/m,
  /^#\s*创作思路确认书（/m,
  /^#\s*创作思路确认书[^\n]*/m,
  /^##\s*《创作思路确认书》\s*$/m,
  /^##\s*创作思路确认书\s*$/m,
  /^##\s*《创作思路确认书》/m,
  /^#\s*创作思路\s*$/m,
];

/** 出现在确认书正文之后的常见「对话收束」起笔（从该处截断） */
const TRAILING_CUE_RES: RegExp[] = [
  /\n(?:\r?\n|\s)*\*\*确认状态\*\*/,
  /\n(?:\r?\n|\s)*\*{1,2}确认状态\*{0,2}[：:]/,
  /\n(?:\r?\n|\s)*规划已就绪[，,]/,
  /\n(?:\r?\n|\s)*你现在想补充/,
  /\n(?:\r?\n|\s)*如无任何修改[，,、]/,
  /\n(?:\r?\n|\s)*若有任何最后调整/,
  /\n(?:\r?\n|\s)*请回复\s*[「“]/,
  /\n(?:\r?\n|\s)*可直接说[「“]/,
  /\n(?:\r?\n|\s)*随时说[，,]/,
];

function firstDocHeadingIndex(text: string): number {
  let best = -1;
  for (const re of DOC_HEADING_RES) {
    const m = text.match(re);
    if (m?.index != null && (best === -1 || m.index < best)) best = m.index;
  }
  return best;
}

const TRAILING_LITERALS: string[] = [
  "**确认状态**",
  "*确认状态*",
  "规划已就绪，可执行",
  "你现在想补充故事核心概念",
  "如无任何修改，请回复",
  "若有任何最后调整",
];

function stripTrailingChatter(body: string): string {
  const minSearch = Math.min(200, Math.floor(body.length * 0.15));
  let cut = body.length;

  for (const lit of TRAILING_LITERALS) {
    const idx = body.indexOf(lit, minSearch);
    if (idx !== -1 && idx < cut) cut = idx;
  }

  for (const re of TRAILING_CUE_RES) {
    const m = re.exec(body);
    if (m && m.index >= minSearch && m.index < cut) cut = m.index;
  }

  let out = body.slice(0, cut).trimEnd();
  out = out.replace(/(?:\r?\n){3,}$/, "\n\n");
  return out.trimEnd();
}

/**
 * @param raw 助手单条消息全文或用户粘贴内容
 * @returns 截取后的确认书 Markdown；无法识别时返回去掉首尾空白后的原文
 */
export function extractCreativeBriefDocument(raw: string): string {
  const t = raw.replace(/\r\n/g, "\n").trim();
  if (!t) return "";

  const start = firstDocHeadingIndex(t);
  let body = start >= 0 ? t.slice(start) : t;

  if (start < 0) {
    const firstHash = body.search(/^#\s+/m);
    if (firstHash > 0 && firstHash < 800) {
      const maybe = body.slice(firstHash);
      if (/创作思路|确认书/.test(maybe.slice(0, 200))) body = maybe;
    }
  }

  body = stripTrailingChatter(body);
  return body.trim();
}
