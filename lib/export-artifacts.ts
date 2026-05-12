/**
 * 产物在应用内仍按 Markdown 编辑与展示；本模块仅在「导出下载 / ZIP」时使用 .txt 扩展名与 text/plain，
 * 文件正文保持与界面一致的 Markdown 结构。
 */
import JSZip from "jszip";
import { compareStage6SubKeys } from "./artifact-mutations";
import type { Artifact } from "./types";
import { STAGES, STAGE_LABELS } from "./types";

function sanitizePathSegment(s: string): string {
  return s.replace(/[/\\?%*:|"<>]/g, "_").replace(/\s+/g, " ").trim() || "未命名";
}

function isSceneRootSubKeyExport(subKey: string): boolean {
  return /^ep\d+\.scene\d+$/u.test(subKey);
}

function sortMusBySubKey(a: Artifact, b: Artifact): number {
  const na = parseInt(a.subKey.replace(/^.*\.m(\d+)$/u, "$1"), 10) || 0;
  const nb = parseInt(b.subKey.replace(/^.*\.m(\d+)$/u, "$1"), 10) || 0;
  return na - nb;
}

/** STAGE 7：概述 + epN.body + 兼容旧场次/幕 */
type Stage7EpisodeBundle = {
  epKey: string;
  overview?: Artifact;
  body?: Artifact;
  scenes: { scene: Artifact; mus: Artifact[] }[];
  extras: Artifact[];
};

function isStage7BodySubKey(subKey: string): boolean {
  return /^ep\d+\.body$/u.test(subKey);
}

function orderedStage7Episodes(artifacts: Artifact[]): Stage7EpisodeBundle[] {
  const items = [...artifacts];
  const epKeys = new Set<string>();
  for (const a of items) {
    if (!a.parentKey && /^ep\d+$/u.test(a.subKey)) epKeys.add(a.subKey);
  }
  const sortedKeys = Array.from(epKeys).sort((a, b) => {
    const na = parseInt(a.replace(/\D/g, ""), 10) || 0;
    const nb = parseInt(b.replace(/\D/g, ""), 10) || 0;
    return na - nb;
  });
  return sortedKeys.map((epKey) => {
    const overview = items.find((x) => x.subKey === epKey && !x.parentKey);
    const direct = items.filter((x) => x.parentKey === epKey);
    const body = direct.find((x) => x.subKey === `${epKey}.body`);
    const sceneRoots = direct
      .filter((x) => isSceneRootSubKeyExport(x.subKey))
      .sort((a, b) => a.subKey.localeCompare(b.subKey));
    const scenes = sceneRoots.map((scene) => ({
      scene,
      mus: items.filter((x) => x.parentKey === scene.subKey).sort(sortMusBySubKey),
    }));
    const extras = direct.filter(
      (x) => !isSceneRootSubKeyExport(x.subKey) && !isStage7BodySubKey(x.subKey)
    );
    return { epKey, overview, body, scenes, extras };
  });
}

function stage7EpisodeZipFileName(bundle: Stage7EpisodeBundle): string {
  const n = bundle.epKey.replace(/\D/g, "") || "0";
  const label = bundle.overview?.label?.trim() || `第${n}集`;
  return `${String(parseInt(n, 10) || 0).toString().padStart(2, "0")}-${sanitizePathSegment(label)}.txt`;
}

function buildStage7SingleEpisodeMarkdown(projectName: string, bundle: Stage7EpisodeBundle): string {
  const { epKey, overview, body, scenes, extras } = bundle;
  const exportedAt = new Date().toLocaleString("zh-CN", { hour12: false });
  const epHeading = overview?.label?.trim() || `第${epKey.replace(/\D/g, "") || "?"}集`;
  const blocks: string[] = [
    `# ${epHeading}`,
    "",
    `- **项目**：${projectName}`,
    `- **导出时间**：${exportedAt}`,
    `- **阶段**：STAGE 7 分集剧本`,
    `- **集标识**：${epKey}`,
    "",
    "---",
    "",
  ];

  const bodyText = body?.content?.trim() ?? "";
  if (bodyText.length > 0) {
    if (overview?.content?.trim()) {
      blocks.push(overview.content.trim());
      blocks.push("");
      blocks.push("---");
      blocks.push("");
      blocks.push("正文：");
      blocks.push("");
    }
    blocks.push(bodyText);
    blocks.push("");
  } else {
    if (overview?.content?.trim()) {
      blocks.push(overview.content.trim());
      blocks.push("");
    }
    for (const { scene, mus } of scenes) {
      blocks.push(`## ${scene.label}`);
      blocks.push("");
      if (scene.content?.trim()) {
        blocks.push(scene.content.trim());
        blocks.push("");
      }
      for (const mu of mus) {
        const muNum = mu.subKey.replace(/^.*\.m(\d+)$/u, "$1");
        blocks.push(`### 幕 ${muNum}`);
        blocks.push("");
        blocks.push(mu.content.trim());
        blocks.push("");
      }
    }
    for (const ex of extras) {
      blocks.push(`## ${ex.label}`);
      blocks.push("");
      blocks.push(ex.content.trim());
      blocks.push("");
    }
  }
  return blocks.join("\n").trimEnd();
}

function sortFlatStage(stage: number, artifacts: Artifact[]): Artifact[] {
  const items = [...artifacts];
  if (stage === 1) {
    const rank = (subKey: string) => (subKey === "oneliner" ? 0 : subKey === "outline" ? 1 : 2);
    return items.sort((a, b) => rank(a.subKey) - rank(b.subKey) || a.subKey.localeCompare(b.subKey));
  }
  if (stage === 4) {
    const rank = (subKey: string) => {
      if (subKey === "chain_check") return 1_000_000;
      const m = /^event_(\d+)$/.exec(subKey);
      if (m) return parseInt(m[1], 10);
      return 500_000;
    };
    return items.sort((a, b) => rank(a.subKey) - rank(b.subKey) || a.subKey.localeCompare(b.subKey));
  }
  if (stage === 6) {
    return items.sort((a, b) => compareStage6SubKeys(a.subKey, b.subKey));
  }
  return items.sort((a, b) => a.subKey.localeCompare(b.subKey));
}

function buildStageMarkdown(stage: number, artifacts: Artifact[], projectName: string): string {
  const stageTitle = STAGE_LABELS[stage] || `STAGE ${stage}`;
  const exportedAt = new Date().toLocaleString("zh-CN", { hour12: false });

  const header = [
    `# ${stageTitle}`,
    "",
    `- **项目**：${projectName}`,
    `- **导出时间**：${exportedAt}`,
    `- **阶段**：STAGE ${stage}`,
    "",
    "---",
    "",
  ];

  if (stage === 7) {
    const blocks: string[] = [...header];
    for (const bundle of orderedStage7Episodes(artifacts)) {
      blocks.push(buildStage7SingleEpisodeMarkdown(projectName, bundle));
      blocks.push("");
      blocks.push("---");
      blocks.push("");
    }
    return blocks.join("\n").replace(/\n---\n\n$/u, "").trimEnd();
  }

  const blocks: string[] = [...header];
  for (const a of sortFlatStage(stage, artifacts)) {
    blocks.push(`## ${a.label}`);
    blocks.push("");
    blocks.push(a.content.trim());
    blocks.push("");
    blocks.push("---");
    blocks.push("");
  }
  return blocks.join("\n").replace(/\n---\n\n$/u, "").trimEnd();
}

function stageFileBaseName(stageId: number): string {
  const label = STAGE_LABELS[stageId] || `STAGE${stageId}`;
  return `${String(stageId).padStart(2, "0")}-${sanitizePathSegment(label)}`;
}

/** 《创作思路确认书》导出正文（立项 creativeBrief，与 ZIP 内 `00-创作思路确认书.txt` 一致） */
export function buildCreativeBriefMarkdown(projectName: string, creativeBrief: string): string {
  const exportedAt = new Date().toLocaleString("zh-CN", { hour12: false });
  const body = creativeBrief.trim();
  return [
    `# 《创作思路确认书》`,
    "",
    `- **项目**：${projectName}`,
    `- **导出时间**：${exportedAt}`,
    "",
    "---",
    "",
    body,
    "",
  ].join("\n");
}

/** 仅下载创作思路确认书为单个 .txt 文件（立项页等场景） */
export function downloadCreativeBriefMarkdownFile(projectName: string, creativeBrief: string): void {
  const body = creativeBrief.trim();
  if (!body) return;
  const text = buildCreativeBriefMarkdown(projectName, body);
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safeProject = sanitizePathSegment(projectName);
  const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
  a.href = url;
  a.download = `${safeProject}-创作思路确认书-${stamp}.txt`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** 《系列圣经（SSOT）》导出正文 */
export function buildSeriesBibleMarkdown(projectName: string, seriesBible: string): string {
  const exportedAt = new Date().toLocaleString("zh-CN", { hour12: false });
  const body = seriesBible.trim();
  return [
    `# 《系列圣经（SSOT）》`,
    "",
    `- **项目**：${projectName}`,
    `- **导出时间**：${exportedAt}`,
    "",
    "---",
    "",
    body,
    "",
  ].join("\n");
}

export function downloadSeriesBibleMarkdownFile(projectName: string, seriesBible: string): void {
  const body = seriesBible.trim();
  if (!body) return;
  const text = buildSeriesBibleMarkdown(projectName, body);
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safeProject = sanitizePathSegment(projectName);
  const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
  a.href = url;
  a.download = `${safeProject}-系列圣经-SSOT-${stamp}.txt`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export type DownloadArtifactsZipOptions = {
  /** 立项阶段写入的《创作思路确认书》；若有则写入 ZIP 内 `00-创作思路确认书.txt` */
  creativeBrief?: string;
  /** 系列圣经；若有则写入 ZIP 内 `系列圣经（SSOT）.txt` */
  seriesBible?: string;
};

export async function downloadArtifactsZip(
  projectName: string,
  artifacts: Artifact[],
  options?: DownloadArtifactsZipOptions
): Promise<void> {
  const briefBody = options?.creativeBrief?.trim() ?? "";
  const briefMd = briefBody ? buildCreativeBriefMarkdown(projectName, briefBody) : "";
  const bibleBody = options?.seriesBible?.trim() ?? "";
  const bibleMd = bibleBody ? buildSeriesBibleMarkdown(projectName, bibleBody) : "";
  if (artifacts.length === 0 && !briefMd && !bibleMd) return;

  const zip = new JSZip();
  const safeProject = sanitizePathSegment(projectName);
  const root = zip.folder(safeProject) ?? zip;

  if (bibleMd) {
    root.file("系列圣经（SSOT）.txt", bibleMd);
  }
  if (briefMd) {
    root.file("00-创作思路确认书.txt", briefMd);
  }

  for (const s of STAGES) {
    const stageArts = artifacts.filter((a) => a.stage === s.id);
    if (stageArts.length === 0) continue;
    if (s.id === 7) {
      const bundles = orderedStage7Episodes(stageArts);
      if (bundles.length > 0) {
        const dir = root.folder(stageFileBaseName(7));
        const target = dir ?? root;
        const usedNames = new Set<string>();
        for (const b of bundles) {
          let name = stage7EpisodeZipFileName(b);
          if (usedNames.has(name)) {
            const num = b.epKey.replace(/\D/g, "") || "0";
            name = `${num.padStart(2, "0")}-${sanitizePathSegment(b.epKey)}.txt`;
          }
          usedNames.add(name);
          target.file(name, buildStage7SingleEpisodeMarkdown(projectName, b));
        }
      } else {
        root.file(`${stageFileBaseName(7)}.txt`, buildStageMarkdown(7, stageArts, projectName));
      }
    } else {
      const md = buildStageMarkdown(s.id, stageArts, projectName);
      root.file(`${stageFileBaseName(s.id)}.txt`, md);
    }
  }

  const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const zipSuffix =
    artifacts.length > 0
      ? "剧本产物"
      : briefMd || bibleMd
        ? "立项导出"
        : "导出";
  a.download = `${safeProject}-${zipSuffix}-${stamp}.zip`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
