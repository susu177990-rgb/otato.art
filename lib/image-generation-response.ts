/**
 * 从中上游「文生图 / 图生图」响应里取出可在浏览器展示的图片地址。
 *
 * 兼容形态（尽量都覆盖）：
 *   1. OpenAI Images：{ data: [{ url | b64_json }] }
 *   2. 国产中转包装：{ code, data: { url } } / { result } / { output: [...] } 等
 *   3. Replicate 风格：{ output: ["..."] }
 *   4. Gemini：{ candidates: [{ content: { parts: [{ inlineData: { mimeType, data } }] } }] }
 *   5. Chat Completions 套壳：{ choices: [{ message: { content: "![](url)" 或 url } }] }
 *   6. SSE 流：多行 `data: {...}` + `data: [DONE]`
 *   7. NDJSON：每行一个 JSON 对象
 *   8. 纯文本 / Markdown：直接含 http(s) URL 或 ![](url)
 *   9. BOM、代码块包裹（```json ... ```）等噪声
 */

export interface ExtractResult {
  /** 解析得到的可显示图片地址（http/https 或 data:image/...） */
  imageUrl: string | null;
  /** 已识别到的上游错误信息（如有） */
  errorMessage: string | null;
  /** 真正用来解析的载荷形态（用于诊断） */
  variant: "json" | "ndjson" | "sse" | "markdown" | "text" | "binary" | "empty" | "unknown";
}

/** 入口 1：旧用法，传已解析对象。 */
export function extractImageUrlFromUpstreamJson(data: unknown): string | null {
  return extractFromParsedJson(data);
}

/** 入口 2：新用法，传原始 Response，自动识别 SSE / NDJSON / 二进制 / 文本 / JSON。 */
export async function extractImageFromUpstreamResponse(response: Response): Promise<ExtractResult> {
  const contentType = (response.headers.get("content-type") || "").toLowerCase();

  // 1. 直接是图片二进制
  if (contentType.startsWith("image/")) {
    const buf = Buffer.from(await response.arrayBuffer());
    if (!buf.byteLength) return { imageUrl: null, errorMessage: null, variant: "empty" };
    const mime = contentType.split(";")[0].trim() || "image/png";
    return {
      imageUrl: `data:${mime};base64,${buf.toString("base64")}`,
      errorMessage: null,
      variant: "binary",
    };
  }

  const raw = await response.text();
  return extractFromText(raw, contentType);
}

export function extractFromText(rawInput: string, contentTypeHint = ""): ExtractResult {
  const text = stripBomAndCodeFence(rawInput).trim();
  if (!text) return { imageUrl: null, errorMessage: null, variant: "empty" };

  const ct = contentTypeHint.toLowerCase();
  const looksSse = ct.includes("event-stream") || /^data:\s/m.test(text);

  // SSE 流：把每个 data: ... 拼装、解析
  if (looksSse) {
    const merged = mergeSseDataChunks(text);
    for (const chunk of merged) {
      if (!chunk || chunk === "[DONE]") continue;
      const parsed = tryJson(chunk);
      if (parsed !== undefined) {
        const url = extractFromParsedJson(parsed);
        const err = readErrorMessage(parsed);
        if (url) return { imageUrl: url, errorMessage: null, variant: "sse" };
        if (err) return { imageUrl: null, errorMessage: err, variant: "sse" };
      } else {
        const inline = scanPlainTextForImage(chunk);
        if (inline) return { imageUrl: inline, errorMessage: null, variant: "sse" };
      }
    }
    const inline = scanPlainTextForImage(text);
    if (inline) return { imageUrl: inline, errorMessage: null, variant: "sse" };
    return { imageUrl: null, errorMessage: null, variant: "sse" };
  }

  // 整体 JSON
  const parsedAll = tryJson(text);
  if (parsedAll !== undefined) {
    const url = extractFromParsedJson(parsedAll);
    if (url) return { imageUrl: url, errorMessage: null, variant: "json" };
    const err = readErrorMessage(parsedAll);
    if (err) return { imageUrl: null, errorMessage: err, variant: "json" };
    // JSON 里可能在 chat content 里塞 markdown
    const contentScan = scanChatContentsForImage(parsedAll);
    if (contentScan) return { imageUrl: contentScan, errorMessage: null, variant: "json" };
    return { imageUrl: null, errorMessage: null, variant: "json" };
  }

  // NDJSON：逐行 JSON
  if (text.includes("\n")) {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    let parsedAny = false;
    for (const line of lines) {
      const p = tryJson(line);
      if (p === undefined) continue;
      parsedAny = true;
      const url = extractFromParsedJson(p);
      if (url) return { imageUrl: url, errorMessage: null, variant: "ndjson" };
      const err = readErrorMessage(p);
      if (err) return { imageUrl: null, errorMessage: err, variant: "ndjson" };
    }
    if (parsedAny) {
      const inline = scanPlainTextForImage(text);
      if (inline) return { imageUrl: inline, errorMessage: null, variant: "ndjson" };
      return { imageUrl: null, errorMessage: null, variant: "ndjson" };
    }
  }

  // Markdown / 纯文本里直接含 url 或 ![](url)
  const md = scanPlainTextForImage(text);
  if (md) return { imageUrl: md, errorMessage: null, variant: text.includes("![") ? "markdown" : "text" };

  return { imageUrl: null, errorMessage: null, variant: "unknown" };
}

function tryJson(s: string): unknown | undefined {
  if (!s) return undefined;
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

function stripBomAndCodeFence(s: string): string {
  if (!s) return "";
  const out = s.replace(/^\uFEFF/, "");
  const fence = out.match(/^```(?:json|JSON)?\s*\n([\s\S]*?)\n```\s*$/);
  if (fence) return fence[1];
  return out;
}

function mergeSseDataChunks(text: string): string[] {
  // SSE 一次事件可能跨多行 data:，事件之间空行分隔
  const events = text.split(/\r?\n\r?\n/);
  const out: string[] = [];
  for (const ev of events) {
    const lines = ev.split(/\r?\n/);
    const dataLines = lines
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.replace(/^data:\s?/, ""));
    if (dataLines.length === 0) continue;
    out.push(dataLines.join("\n").trim());
  }
  return out;
}

function readErrorMessage(parsed: unknown): string | null {
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  // 常见国产中转：{ code: -4, msg: "...", data: null }
  if (typeof o.code === "number" && o.code !== 0) {
    if (typeof o.msg === "string" && o.msg.trim()) return o.msg.trim();
  }
  const err = o.error;
  if (typeof err === "string" && err.trim()) return err.trim();
  if (err && typeof err === "object") {
    const msg = (err as Record<string, unknown>).message;
    if (typeof msg === "string" && msg.trim()) return msg.trim();
  }
  if (typeof o.message === "string" && o.message.trim() && (o.code || o.status)) {
    return o.message.trim();
  }
  return null;
}

function scanPlainTextForImage(text: string): string | null {
  if (!text) return null;

  // Markdown 图片
  const md = text.match(/!\[[^\]]*\]\((https?:\/\/[^\s)]+|data:image\/[^\s)]+)\)/);
  if (md) return md[1];

  // Markdown 链接（限定到图片后缀）
  const mdLink = text.match(/\]\((https?:\/\/[^\s)]+\.(?:png|jpe?g|webp|gif|bmp|svg)(?:\?[^\s)]*)?)\)/i);
  if (mdLink) return mdLink[1];

  // data URL
  const dataUrl = text.match(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/);
  if (dataUrl) return dataUrl[0];

  // 纯 http(s) URL（优先带图片后缀的）
  const httpImg = text.match(/https?:\/\/[^\s"'<>)]+\.(?:png|jpe?g|webp|gif|bmp|svg)(?:\?[^\s"'<>)]*)?/i);
  if (httpImg) return httpImg[0];

  // 退一步：任何 http(s) URL
  const anyHttp = text.match(/https?:\/\/[^\s"'<>)]+/);
  if (anyHttp) return anyHttp[0];

  return null;
}

function scanChatContentsForImage(parsed: unknown): string | null {
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  const choices = o.choices;
  if (!Array.isArray(choices)) return null;
  for (const ch of choices) {
    if (!ch || typeof ch !== "object") continue;
    const message = (ch as Record<string, unknown>).message;
    const delta = (ch as Record<string, unknown>).delta;
    for (const m of [message, delta]) {
      if (!m || typeof m !== "object") continue;
      const content = (m as Record<string, unknown>).content;
      if (typeof content === "string") {
        const inline = scanPlainTextForImage(content);
        if (inline) return inline;
      } else if (Array.isArray(content)) {
        for (const part of content) {
          if (typeof part === "string") {
            const inline = scanPlainTextForImage(part);
            if (inline) return inline;
            continue;
          }
          if (part && typeof part === "object") {
            const p = part as Record<string, unknown>;
            const text = typeof p.text === "string" ? p.text : "";
            if (text) {
              const inline = scanPlainTextForImage(text);
              if (inline) return inline;
            }
            const url = (p.image_url as { url?: unknown })?.url ?? p.url ?? p.image;
            if (typeof url === "string") {
              const u = url.trim();
              if (u.startsWith("http") || u.startsWith("data:image")) return u;
            }
          }
        }
      }
    }
  }
  return null;
}

// ---------------- 内层：从已解析 JSON 中递归抓取 ----------------

function extractFromParsedJson(data: unknown): string | null {
  const gemini = extractGeminiInlineImage(data);
  if (gemini) return gemini;
  return extractLoosely(data, 0);
}

function extractGeminiInlineImage(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const root = data as Record<string, unknown>;
  const candidates = root.candidates;
  if (!Array.isArray(candidates)) return null;
  for (const c of candidates) {
    if (!c || typeof c !== "object") continue;
    const content = (c as Record<string, unknown>).content;
    if (!content || typeof content !== "object") continue;
    const parts = (content as Record<string, unknown>).parts;
    if (!Array.isArray(parts)) continue;
    for (const part of parts) {
      if (!part || typeof part !== "object") continue;
      const p = part as Record<string, unknown>;
      const inline = (p.inlineData ?? p.inline_data) as Record<string, unknown> | undefined;
      if (!inline || typeof inline !== "object") continue;
      const mime =
        (typeof inline.mimeType === "string" && inline.mimeType) ||
        (typeof inline.mime_type === "string" && inline.mime_type) ||
        "image/png";
      const b64 = inline.data;
      if (typeof b64 === "string" && b64.trim()) {
        return `data:${mime};base64,${b64.replace(/\s/g, "")}`;
      }
    }
  }
  return null;
}

function pickHttpOrDataUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  if (!t) return null;
  if (t.startsWith("http://") || t.startsWith("https://") || t.startsWith("data:image/")) return t;
  return null;
}

function toDataUrlFromBase64Field(raw: string): string | null {
  const s = raw.replace(/\s/g, "");
  if (s.length < 32) return null;
  if (!/^[A-Za-z0-9+/]+=*$/.test(s)) return null;
  return `data:image/png;base64,${s}`;
}

function extractLoosely(data: unknown, depth: number): string | null {
  if (depth > 10) return null;

  const direct = pickHttpOrDataUrl(data);
  if (direct) return direct;

  if (!data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;

  for (const key of ["url", "image_url", "imageUrl", "href", "link"]) {
    const u = pickHttpOrDataUrl(o[key]);
    if (u) return u;
  }

  for (const key of ["b64_json", "b64", "base64", "image_base64"]) {
    const val = o[key];
    if (typeof val === "string" && val.trim()) {
      if (val.startsWith("data:image")) return val.trim();
      const dataUrl = toDataUrlFromBase64Field(val);
      if (dataUrl) return dataUrl;
    }
  }

  const imageVal = o.image;
  if (typeof imageVal === "string" && imageVal.trim()) {
    if (imageVal.startsWith("data:image")) return imageVal.trim();
    const dataUrl = toDataUrlFromBase64Field(imageVal);
    if (dataUrl) return dataUrl;
    const http = pickHttpOrDataUrl(imageVal);
    if (http) return http;
  }

  if (typeof o.output === "string") {
    const u = pickHttpOrDataUrl(o.output);
    if (u) return u;
  }

  if (Array.isArray(o.output)) {
    for (const item of o.output) {
      const u = extractLoosely(item, depth + 1);
      if (u) return u;
    }
  }

  const urlArrays = ["urls", "image_urls", "images"] as const;
  for (const key of urlArrays) {
    const arr = o[key];
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      const u = extractLoosely(item, depth + 1);
      if (u) return u;
    }
  }

  if (Array.isArray(o.data)) {
    for (const item of o.data) {
      const u = extractLoosely(item, depth + 1);
      if (u) return u;
    }
  }

  if (o.data && typeof o.data === "object" && !Array.isArray(o.data)) {
    const u = extractLoosely(o.data, depth + 1);
    if (u) return u;
  }

  if (Array.isArray(o.choices)) {
    for (const ch of o.choices) {
      const u = extractLoosely(ch, depth + 1);
      if (u) return u;
    }
  }

  for (const key of ["result", "payload", "response", "body", "message", "delta"]) {
    const nested = o[key];
    if (nested && typeof nested === "object") {
      const u = extractLoosely(nested, depth + 1);
      if (u) return u;
    }
  }

  return null;
}
