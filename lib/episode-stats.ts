/**
 * 与 tools/episode-stats.mjs 对齐的启发式统计，供应用内「分集体检」使用。
 */

const CJK_RE = /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/g;

function countCjk(str: string): number {
  const m = str.match(CJK_RE);
  return m ? m.length : 0;
}

function stripMarkdownNoise(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[[^\]]*]\([^)]*\)/g, " ");
}

function extractKeyDialogueBlock(text: string): string {
  const idx = text.search(/\*\*关键对白\*\*|关键对白[:：]/);
  if (idx === -1) return "";
  const rest = text.slice(idx);
  const stop = rest.search(/\n## |\n\*\*[^(关键对白)]/);
  return stop === -1 ? rest : rest.slice(0, stop);
}

function extractDialogueLines(text: string): string {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  let inKey = false;
  for (const line of lines) {
    if (/^\*\*关键对白\*\*\s*$|^关键对白[:：]\s*$/.test(line.trim())) {
      inKey = true;
      continue;
    }
    if (inKey && (/^##\s+/.test(line) || /^\*\*[^*]+\*\*\s*$/.test(line.trim()))) {
      if (!/^关键对白/.test(line)) inKey = false;
    }
    if (inKey && /^\s*[-*]\s*.+[：:].+/.test(line)) {
      out.push(line);
    }
  }
  return out.join("\n");
}

export function countActHeadings(text: string): number {
  const m = text.match(/^####\s*幕(?:\s|$|\d)/gm);
  return m ? m.length : 0;
}

export interface EpisodeStatsResult {
  dialogue_chars: number;
  total_cjk_chars: number;
  estimated_seconds_by_total: number;
  estimated_seconds_by_dialogue: number;
  act_headings_count: number;
  min_acts_threshold: number;
  wps: number;
  lines: number;
  warnings: string[];
}

export function analyzeEpisodeMarkdown(
  raw: string,
  opts?: { wps?: number; minActs?: number; maxChars?: number; maxSeconds?: number }
): EpisodeStatsResult {
  const wps = opts?.wps && opts.wps > 0 ? opts.wps : 4.5;
  const minActs = opts?.minActs !== undefined ? opts.minActs : 8;
  const maxChars = opts?.maxChars !== undefined ? opts.maxChars : 380;
  const maxSeconds = opts?.maxSeconds !== undefined ? opts.maxSeconds : 120;

  const cleaned = stripMarkdownNoise(raw);
  const keyBlock = extractKeyDialogueBlock(raw);
  const bulletDialogue = extractDialogueLines(raw);
  const dialogueSource =
    bulletDialogue.length > 0 ? bulletDialogue : keyBlock.length > 0 ? keyBlock : cleaned;
  const dialogueChars = countCjk(dialogueSource);
  const totalChars = countCjk(cleaned);
  const estSecondsTotal = totalChars / wps;
  const estSecondsDialogue = dialogueChars / wps;
  const actHeadingsCount = countActHeadings(raw);
  const lines = raw.split(/\r?\n/).length;

  const warnings: string[] = [];
  if (minActs > 0 && actHeadingsCount < minActs) {
    warnings.push(`「#### 幕」共 ${actHeadingsCount} 个，低于建议下限 ${minActs}（见 knowledge/01_EPISODE_SPECS）`);
  }
  if (dialogueChars > maxChars) {
    warnings.push(`关键对白区汉字约 ${dialogueChars}，超过常见上限参考 ${maxChars}（可随项目调整）`);
  }
  if (estSecondsTotal > maxSeconds) {
    warnings.push(`按全篇汉字/${wps} 字每秒估算约 ${estSecondsTotal.toFixed(1)} 秒，超过 ${maxSeconds} 秒参考上限`);
  }

  return {
    dialogue_chars: dialogueChars,
    total_cjk_chars: totalChars,
    estimated_seconds_by_total: Math.round(estSecondsTotal * 10) / 10,
    estimated_seconds_by_dialogue: Math.round(estSecondsDialogue * 10) / 10,
    act_headings_count: actHeadingsCount,
    min_acts_threshold: minActs,
    wps,
    lines,
    warnings,
  };
}
