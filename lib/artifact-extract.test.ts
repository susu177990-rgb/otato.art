import { describe, it, expect } from "vitest";

// ── splitBySections ───────────────────────────────────────
describe("splitBySections", () => {
  function splitBySections(content: string, level: "#" | "##" | "###" | "####"): { heading: string; body: string }[] {
    const re = new RegExp(`(?:^|\\n)(${level}\\s+[^\\n]+)`, "g");
    const hits: { index: number; heading: string; fullLen: number }[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      hits.push({ index: m.index, heading: m[1].trim(), fullLen: m[0].length });
    }
    const sections: { heading: string; body: string }[] = [];
    for (let i = 0; i < hits.length; i++) {
      const bodyStart = hits[i].index + hits[i].fullLen;
      const bodyEnd = i + 1 < hits.length ? hits[i + 1].index : content.length;
      sections.push({ heading: hits[i].heading, body: content.slice(bodyStart, bodyEnd).trim() });
    }
    return sections;
  }

  it("splits ## headings", () => {
    const content = "## 第一幕\n这是第一幕内容\n\n## 第二幕\n这是第二幕内容";
    const sections = splitBySections(content, "##");
    expect(sections).toHaveLength(2);
    expect(sections[0].heading).toBe("## 第一幕");
    expect(sections[0].body).toBe("这是第一幕内容");
    expect(sections[1].heading).toBe("## 第二幕");
    expect(sections[1].body).toBe("这是第二幕内容");
  });

  it("handles content before first heading as preamble (ignored)", () => {
    const content = "前言\n\n## 正文\n内容";
    const sections = splitBySections(content, "##");
    expect(sections).toHaveLength(1);
    expect(sections[0].heading).toBe("## 正文");
  });

  it("preserves multi-line body", () => {
    const content = "## 节\n行1\n行2\n行3\n\n## 节二\n乙";
    const sections = splitBySections(content, "##");
    expect(sections[0].body).toBe("行1\n行2\n行3");
  });

  it("handles single section", () => {
    const content = "## 唯一节\n内容";
    const sections = splitBySections(content, "##");
    expect(sections).toHaveLength(1);
  });

  it("returns empty array for no matches", () => {
    const sections = splitBySections("一些普通文字", "##");
    expect(sections).toHaveLength(0);
  });

  it("matches ### headings", () => {
    const content = "### 子节\n子内容\n### 子节二\n子内容二";
    const sections = splitBySections(content, "###");
    expect(sections).toHaveLength(2);
  });
});

// ── normalizeStage1Markdown ────────────────────────────────
describe("normalizeStage1Markdown", () => {
  function normalizeStage1Markdown(c: string): string {
    return c.replace(/^(\s*)#{3,4}\s*(一句话梗概|完整大纲|详细剧情梗概)\s*$/gim, "$1## $2");
  }

  it("promotes ### 一句话梗概 to ##", () => {
    expect(normalizeStage1Markdown("### 一句话梗概")).toBe("## 一句话梗概");
  });

  it("promotes #### 完整大纲 to ##", () => {
    expect(normalizeStage1Markdown("#### 完整大纲")).toBe("## 完整大纲");
  });

  it("leaves ## headings unchanged", () => {
    expect(normalizeStage1Markdown("## 正文")).toBe("## 正文");
  });

  it("handles indented headings", () => {
    expect(normalizeStage1Markdown(" ### 一句话梗概")).toBe(" ## 一句话梗概");
  });
});

// ── looksLikeTemplateDeliverable ──────────────────────────
describe("looksLikeTemplateDeliverable", () => {
  function stripThinkingBlocks(c: string): string { return c; }
  function looksLikeTemplateDeliverable(content: string): boolean {
    const c = stripThinkingBlocks(content);
    if (/(?:^|\n)##\s*(?:第\s*\d+\s*集|第\s*[一二三四五六七八九十百千]+\s*集|第\s*\[集数\]\s*集|一句话梗概|完整大纲|详细剧情梗概)/m.test(c)) return true;
    if (/(?:^|\n)#{3,4}\s*(?:一句话梗概|完整大纲|详细剧情梗概)\s*$/m.test(c)) return true;
    if (/(?:^|\n)\s*\*{1,2}\s*一句话梗概\s*\*{0,2}\s*(?:[：:]|\s*$)/m.test(c)) return true;
    if (/(?:^|\n)##\s*角色[一二三四五六七八九十\d]+[：:]/m.test(c)) return true;
    if (/(?:^|\n)##\s*(?:主角|配角)[一二三四五六七八九十\d]+(?:[：:]|$)/m.test(c)) return true;
    if (/(?:^|\n)##\s*关键配角[：:]/m.test(c)) return true;
    if (/(?:^|\n)##\s*核心关系定义/m.test(c)) return true;
    if (/(?:^|\n)##\s*人物矩阵总览/m.test(c)) return true;
    if (/(?:^|\n)##\s*第[一二三]幕(?:\s|$|[：:（(])/m.test(c)) return true;
    if (/(?:^|\n)##\s*核心事件\s*\d/m.test(c)) return true;
    if (/(?:^|\n)##\s*事件链总检/m.test(c)) return true;
    if (/(?:^|\n)###\s*场次\s*\d+/m.test(c)) return true;
    if (/(?:^|\n)####\s*幕\s*\d+/m.test(c)) return true;
    if (/\s*本集剧情核心\s*[：:]/m.test(c)) return true;
    if (/\s*∆出场人物\s*[：:]/m.test(c)) return true;
    if (/\s*∆出场物品\s*[：:]/m.test(c)) return true;
    if (/---\s*\n\s*正文\s*[：:]/m.test(c)) return true;
    if (/(?:^|\n)##?\s*∆(?:人物|物品|场景)/m.test(c)) return true;
    if (/(?:^|\n)##?\s*设定集/m.test(c)) return true;
    if (/(?:^|\n)###?\s*(?:开头钩子|本集概述|本集剧情|结尾悬念)/m.test(c)) return true;
    if (/(?:^|\n)(?:开头钩子|本集剧情|本集概述|结尾悬念)[：:]/m.test(c)) return true;
    if (/(?:^|\n)##?\s*分集大纲/m.test(c)) return true;
    const h2 = c.match(/^##\s+\S[^\n]*/gm) ?? [];
    if (h2.length >= 2) return true;
    if (/(?:^|\n)\s*一句话梗概\s*[：:]/.test(c)) return true;
    if (/(?:^|\n)\s*#{1,3}\s*一句话梗概/.test(c)) return true;
    if (/(?:^|\n)\s*【\s*一句话梗概\s*】/.test(c)) return true;
    return false;
  }

  it("detects ## 第1集", () => expect(looksLikeTemplateDeliverable("## 第1集")).toBe(true));
  it("detects ## 第2集 标题", () => expect(looksLikeTemplateDeliverable("前面\n## 第2集 标题")).toBe(true));
  it("detects 一句话梗概", () => expect(looksLikeTemplateDeliverable("## 一句话梗概\n故事")).toBe(true));
  it("detects 完整大纲", () => expect(looksLikeTemplateDeliverable("## 完整大纲")).toBe(true));
  it("detects ### 一句话梗概", () => expect(looksLikeTemplateDeliverable("### 一句话梗概")).toBe(true));
  it("detects 角色1:", () => expect(looksLikeTemplateDeliverable("## 角色1：张三")).toBe(true));
  it("detects 主角1：", () => expect(looksLikeTemplateDeliverable("## 主角1：李四")).toBe(true));
  it("detects 第1幕", () => expect(looksLikeTemplateDeliverable("## 第一幕\n正文")).toBe(true));
  it("detects 核心事件 1", () => expect(looksLikeTemplateDeliverable("## 核心事件 1")).toBe(true));
  it("detects 开头钩子", () => expect(looksLikeTemplateDeliverable("### 开头钩子")).toBe(true));
  it("detects 本集剧情：", () => expect(looksLikeTemplateDeliverable("本集剧情：内容")).toBe(true));
  it("detects ∆出场人物：", () => expect(looksLikeTemplateDeliverable("∆出场人物：张三")).toBe(true));
  it("detects 2+ ## headings", () => expect(looksLikeTemplateDeliverable("## 一\n## 二\n")).toBe(true));
  it("detects 【一句话梗概】", () => expect(looksLikeTemplateDeliverable("【一句话梗概】故事")).toBe(true));
  it("rejects plain text", () => expect(looksLikeTemplateDeliverable("你好世界")).toBe(false));
  it("rejects single ## heading", () => expect(looksLikeTemplateDeliverable("## 单一标题")).toBe(false));
  it("rejects short reply", () => expect(looksLikeTemplateDeliverable("好的我明白了")).toBe(false));
  it("detects 正文： after ---", () => expect(looksLikeTemplateDeliverable("---\n正文：内容")).toBe(true));
});

// ── extractOnelinerLoose ───────────────────────────────────
describe("extractOnelinerLoose", () => {
  function extractOnelinerLoose(content: string): string | null {
    const blocks: RegExp[] = [
      /(?:^|\n)\s*(?:#{1,4}\s*|\*{1,2}\s*)?一句话梗概(?:\s*\*{0,2})?\s*[：:]\s*([^\n]+)/u,
      /(?:^|\n)\s*【\s*一句话梗概\s*】\s*[：:\-—]?\s*([^\n]+)/u,
      /(?:^|\n)\s*「\s*一句话梗概\s*」\s*[：:\-—]?\s*([^\n]+)/u,
    ];
    for (const re of blocks) {
      const m = re.exec(content);
      if (m?.[1]?.trim()) return m[1].trim();
    }
    return null;
  }

  it("extracts after ## 一句话梗概：", () => {
    expect(extractOnelinerLoose("## 一句话梗概：故事内容")).toBe("故事内容");
  });
  it("extracts after 【一句话梗概】", () => {
    expect(extractOnelinerLoose("【一句话梗概】故事内容")).toBe("故事内容");
  });
  it("extracts after 「一句话梗概」", () => {
    expect(extractOnelinerLoose("「一句话梗概」故事内容")).toBe("故事内容");
  });
  it("returns null when not found", () => {
    expect(extractOnelinerLoose("正常文字")).toBeNull();
  });
});