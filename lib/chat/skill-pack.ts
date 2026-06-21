import JSZip from "jszip";
import type { SkillDocument, SkillPackRecord } from "@/lib/chat/types";

export const MAX_SKILL_ZIP_BYTES = 15 * 1024 * 1024;
export const MAX_SKILL_BODY_CHARS = 48 * 1024;
const MAX_REFERENCE_CHARS = 8000;

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\/+/, "");
}

function isSkillMdPath(fileName: string): boolean {
  return /(^|\/)skill\.md$/i.test(normalizePath(fileName));
}

function parentDir(path: string): string {
  const n = normalizePath(path);
  const i = n.lastIndexOf("/");
  return i <= 0 ? "" : n.slice(0, i);
}

async function parseSkillZipBuffer(buffer: ArrayBuffer, fileName: string): Promise<SkillPackRecord> {
  if (buffer.byteLength > MAX_SKILL_ZIP_BYTES) {
    throw new Error(`ZIP 超过 ${Math.round(MAX_SKILL_ZIP_BYTES / 1024 / 1024)}MB`);
  }

  const zip = await JSZip.loadAsync(buffer);
  const paths: string[] = [];
  zip.forEach((relPath) => {
    if (!relPath.endsWith("/")) paths.push(normalizePath(relPath));
  });

  const skillMdPaths = paths.filter(isSkillMdPath);
  if (skillMdPaths.length === 0) {
    throw new Error("ZIP 内未找到 SKILL.md（任意目录下均可）");
  }

  const skills: SkillDocument[] = [];
  const seenFolders = new Set<string>();

  for (const skillPath of skillMdPaths.sort()) {
    const folder = parentDir(skillPath);
    const folderKey = folder || "__root__";
    if (seenFolders.has(folderKey)) continue;
    seenFolders.add(folderKey);

    const entry = zip.file(skillPath);
    if (!entry) continue;

    let body = await entry.async("string");
    if (body.length > MAX_SKILL_BODY_CHARS) {
      body = `${body.slice(0, MAX_SKILL_BODY_CHARS)}\n\n…(已截断，单 skill 上限 ${MAX_SKILL_BODY_CHARS} 字符)`;
    }

    const refPrefix = folder ? `${folder}/references/` : "references/";
    const refPaths = paths
      .filter((p) => {
        const norm = normalizePath(p);
        return norm.toLowerCase().startsWith(refPrefix.toLowerCase()) && /\.md$/i.test(norm);
      })
      .sort();

    let extra = "";
    for (const rp of refPaths) {
      const f = zip.file(rp);
      if (!f) continue;
      let txt = await f.async("string");
      if (txt.length > MAX_REFERENCE_CHARS) {
        txt = `${txt.slice(0, MAX_REFERENCE_CHARS)}\n…(截断)`;
      }
      const base = rp.split("/").pop() || rp;
      extra += `\n\n--- reference: ${base} ---\n\n${txt}`;
    }

    const displayName = folder ? folder.split("/").pop() || folder : fileName.replace(/\.zip$/i, "") || "root";

    skills.push({
      name: displayName,
      markdown: body + extra,
    });
  }

  if (skills.length === 0) {
    throw new Error("未能解析出有效 SKILL.md 内容");
  }

  const id = `pack-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const zipTitle = fileName.replace(/\.zip$/i, "") || "skill-pack";
  const displayLabel =
    skills.length === 1 ? skills[0]!.name : skills.map((s) => s.name).join(" · ") || zipTitle;

  return {
    id,
    title: zipTitle,
    displayLabel,
    importedAt: Date.now(),
    skills,
  };
}

/** 对话页 / 设置列表展示用（历史数据无 displayLabel 时回退） */
export function skillPackDisplayLabel(pack: SkillPackRecord): string {
  const label = pack.displayLabel?.trim();
  if (label) return label;
  if (pack.skills.length === 1) return pack.skills[0]!.name;
  return pack.title;
}

export async function parseSkillZipFile(file: File): Promise<SkillPackRecord> {
  return parseSkillZipBuffer(await file.arrayBuffer(), file.name);
}

export async function parseSkillZipBlob(blob: Blob, fileName: string): Promise<SkillPackRecord> {
  return parseSkillZipBuffer(await blob.arrayBuffer(), fileName);
}
