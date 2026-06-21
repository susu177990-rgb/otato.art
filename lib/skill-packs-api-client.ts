import type { SkillPackRecord } from "@/lib/chat/types";

async function readApiError(res: Response, fallback: string): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return data.error?.trim() || fallback;
}

export type SiteSkillPacksResponse = {
  skillPacks: SkillPackRecord[];
  canManage: boolean;
};

export async function fetchSiteSkillPacks(): Promise<SiteSkillPacksResponse> {
  const res = await fetch("/api/site-skill-packs", { cache: "no-store" });
  if (!res.ok) throw new Error(await readApiError(res, "无法加载 Skill 包"));
  return (await res.json()) as SiteSkillPacksResponse;
}

export async function importSiteSkillPack(file: File): Promise<SkillPackRecord> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/site-skill-packs", { method: "POST", body: fd });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || "导入失败");
  }
  const data = (await res.json()) as { skillPack: SkillPackRecord };
  return data.skillPack;
}

export async function updateSiteSkillPackApi(
  id: string,
  patch: { displayLabel?: string; chatUsageHint?: string },
): Promise<SkillPackRecord> {
  const res = await fetch("/api/site-skill-packs", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, ...patch }),
  });
  if (!res.ok) {
    throw new Error(await readApiError(res, "无法保存 Skill 包"));
  }
  const data = (await res.json()) as { skillPack: SkillPackRecord };
  return data.skillPack;
}

export async function updateSiteSkillPackDisplayLabelApi(
  id: string,
  displayLabel: string,
): Promise<SkillPackRecord> {
  return updateSiteSkillPackApi(id, { displayLabel });
}

export async function deleteSiteSkillPackApi(id: string): Promise<void> {
  const res = await fetch(`/api/site-skill-packs?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || "无法删除 Skill 包");
  }
}
