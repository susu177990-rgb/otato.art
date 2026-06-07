import { describe, it, expect } from "vitest";

// ── extractJsonObject ────────────────────────────────────────
function extractJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(unfenced) as Record<string, unknown>;
  } catch { /* continue */ }
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(unfenced.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

describe("extractJsonObject", () => {
  it("parses plain JSON", () => expect(extractJsonObject('{"a":1}')).toEqual({ a: 1 }));
  it("strips code fences with json", () => expect(extractJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 }));
  it("strips fences without tag", () => expect(extractJsonObject('```\n{"b":2}\n```')).toEqual({ b: 2 }));
  it("extracts from surrounding text", () => expect(extractJsonObject("x {\"c\":3} y")).toEqual({ c: 3 }));
  it("null for non-JSON", () => expect(extractJsonObject("just text")).toBeNull());
  it("null for empty", () => { expect(extractJsonObject("")).toBeNull(); expect(extractJsonObject("   ")).toBeNull(); });
});

// ── parseAgentDecision ──────────────────────────────────────
describe("parseAgentDecision (pure JSON parse)", () => {
  function parseDecision(text: string): Record<string, unknown> | null {
    const obj = extractJsonObject(text);
    if (!obj) return null;
    if (obj.action === "reply") return { action: "reply", reason: obj.reason ?? undefined };
    if (obj.action !== "generate_image") return null;
    const g = obj.generate_image;
    if (!g || typeof g !== "object") return null;
    const prompt = typeof (g as Record<string, unknown>).prompt === "string" ? (g as Record<string, unknown>).prompt as string : "";
    if (!prompt) return null;
    return { action: "generate_image", prompt, reason: obj.reason ?? undefined };
  }

  it("reply", () => {
    const r = parseDecision('{"action":"reply","reason":"no need"}');
    expect(r?.action).toBe("reply");
    expect(r?.reason).toBe("no need");
  });

  it("generate_image", () => {
    const r = parseDecision('{"action":"generate_image","reason":"user asked","generate_image":{"prompt":"a cat"}}');
    expect(r?.action).toBe("generate_image");
    expect((r as Record<string, unknown>)?.prompt).toBe("a cat");
  });

  it("requires non-empty prompt", () => {
    expect(parseDecision('{"action":"generate_image","generate_image":{"prompt":""}}')).toBeNull();
  });

  it("rejects unknown action", () => {
    expect(parseDecision('{"action":"delete_all"}')).toBeNull();
  });

  it("rejects invalid JSON", () => {
    expect(parseDecision("not json")).toBeNull();
  });
});

// ── buildAgentSystemText ───────────────────────────────────
describe("buildAgentSystemText rules", () => {
  function buildSystemText(skillBlocks: string[], imageBlock: string | null, willGenerate: boolean): string {
    const active = imageBlock?.trim()
      ? `## 对话提示词预设\n${imageBlock}`
      : `## Skill 文档\n${skillBlocks.length === 0 ? "（当前未挂载 Skill 文档）" : skillBlocks.join("\n\n---\n\n")}`;
    const rules = willGenerate
      ? "- 本轮系统会先调用作图 API，再把【系统·生图结果】JSON 发给你。\n- 仅当 JSON 中 `success: true` 且含 `media_url` 时，才可对用户说图片已生成"
      : "- 本轮**未**调用作图 API。禁止声称「已生成」「图片如下」或编造 media_url";
    return `${active}\n\n${rules}`;
  }

  it("shows skill docs when no preset", () => {
    const t = buildSystemText(["skill A"], null, false);
    expect(t).toContain("skill A");
    expect(t).toContain("禁止声称");
  });

  it("shows preset when provided", () => {
    const t = buildSystemText([], "image preset text", true);
    expect(t).toContain("对话提示词预设");
    expect(t).toContain("会先调用作图 API");
  });

  it("shows empty placeholder when no skills and no preset", () => {
    const t = buildSystemText([], null, false);
    expect(t).toContain("未挂载 Skill 文档");
  });
});

// ── cnOrdinalToNum ─────────────────────────────────────────
describe("cnOrdinalToNum", () => {
  function cnOrdinalToNum(ord: string): number {
    const o = ord.trim();
    if (/^\d+$/.test(o)) {
      const n = parseInt(o, 10);
      return Number.isFinite(n) && n > 0 ? n : 0;
    }
    const d: Record<string, number> = { 〇: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
    if (d[o] != null) return d[o];
    if (o.startsWith("十") && o.length === 2) return 10 + (d[o[1]] ?? 0);
    const tensUnit = o.match(/^([一二三四五六七八九])十([一二三四五六七八九])?$/);
    if (tensUnit) {
      const tens = (d[tensUnit[1]] ?? 0) * 10;
      return tensUnit[2] ? tens + (d[tensUnit[2]] ?? 0) : tens;
    }
    return 0;
  }

  it("arabic numbers", () => { expect(cnOrdinalToNum("1")).toBe(1); expect(cnOrdinalToNum("21")).toBe(21); expect(cnOrdinalToNum("100")).toBe(100); });
  it("single Chinese", () => { expect(cnOrdinalToNum("一")).toBe(1); expect(cnOrdinalToNum("五")).toBe(5); });
  it("compound tens", () => { expect(cnOrdinalToNum("十一")).toBe(11); expect(cnOrdinalToNum("二十一")).toBe(21); expect(cnOrdinalToNum("二十")).toBe(20); });
  it("ten alone returns 0 (not handled)", () => { expect(cnOrdinalToNum("十")).toBe(0); });
  it("hundreds returns 0 (not handled)", () => { expect(cnOrdinalToNum("一百")).toBe(0); expect(cnOrdinalToNum("一百二十三")).toBe(0); });
  it("invalid", () => { expect(cnOrdinalToNum("abc")).toBe(0); expect(cnOrdinalToNum("")).toBe(0); expect(cnOrdinalToNum("零")).toBe(0); });
});