import type { SupabaseClient } from "@supabase/supabase-js";
import { skillPackDisplayLabel } from "@/lib/chat/skill-pack";
import type { SkillPackRecord } from "@/lib/chat/types";

type SiteSkillPackRow = {
  id: string;
  title: string;
  skills: unknown;
  imported_at: string;
  display_label?: string | null;
  chat_usage_hint?: string | null;
};

const SELECT_FULL =
  "id, title, display_label, chat_usage_hint, skills, imported_at" as const;
const SELECT_LEGACY_LABEL = "id, title, display_label, skills, imported_at" as const;
const SELECT_LEGACY = "id, title, skills, imported_at" as const;

function rowToSkillPack(row: SiteSkillPackRow): SkillPackRecord {
  const skills = (Array.isArray(row.skills) ? row.skills : []) as SkillPackRecord["skills"];
  const pack: SkillPackRecord = {
    id: row.id,
    title: row.title,
    displayLabel: row.display_label?.trim() ?? "",
    chatUsageHint: row.chat_usage_hint?.trim() || undefined,
    importedAt: new Date(row.imported_at).getTime(),
    skills,
  };
  if (!pack.displayLabel) {
    pack.displayLabel = skillPackDisplayLabel(pack);
  }
  return pack;
}

function isMissingColumn(e: unknown, column: string): boolean {
  const message =
    e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string"
      ? (e as { message: string }).message
      : e instanceof Error
        ? e.message
        : String(e);
  const col = column.toLowerCase();
  return new RegExp(col, "i").test(message) && /does not exist|Could not find|schema cache/i.test(message);
}

export async function listSiteSkillPacks(supabase: SupabaseClient): Promise<SkillPackRecord[]> {
  const full = await supabase
    .from("site_skill_packs")
    .select(SELECT_FULL)
    .order("imported_at", { ascending: false });

  if (!full.error) {
    return (full.data ?? []).map((row) => rowToSkillPack(row as SiteSkillPackRow));
  }
  if (!isMissingColumn(full.error, "chat_usage_hint")) {
    throw full.error;
  }

  const withLabel = await supabase
    .from("site_skill_packs")
    .select(SELECT_LEGACY_LABEL)
    .order("imported_at", { ascending: false });

  if (!withLabel.error) {
    return (withLabel.data ?? []).map((row) => rowToSkillPack(row as SiteSkillPackRow));
  }
  if (!isMissingColumn(withLabel.error, "display_label")) {
    throw withLabel.error;
  }

  const legacy = await supabase
    .from("site_skill_packs")
    .select(SELECT_LEGACY)
    .order("imported_at", { ascending: false });

  if (legacy.error) throw legacy.error;
  return (legacy.data ?? []).map((row) => rowToSkillPack(row as SiteSkillPackRow));
}

export async function getSiteSkillPackById(
  supabase: SupabaseClient,
  id: string,
): Promise<SkillPackRecord | null> {
  const packs = await listSiteSkillPacks(supabase);
  return packs.find((p) => p.id === id) ?? null;
}

export async function insertSiteSkillPack(supabase: SupabaseClient, pack: SkillPackRecord): Promise<void> {
  const importedAt = new Date(pack.importedAt).toISOString();
  const full = await supabase.from("site_skill_packs").insert({
    id: pack.id,
    title: pack.title,
    display_label: pack.displayLabel,
    chat_usage_hint: pack.chatUsageHint ?? null,
    skills: pack.skills,
    imported_at: importedAt,
  });

  if (!full.error) return;

  if (
    !isMissingColumn(full.error, "chat_usage_hint") &&
    !isMissingColumn(full.error, "display_label")
  ) {
    throw full.error;
  }

  const withLabel = await supabase.from("site_skill_packs").insert({
    id: pack.id,
    title: pack.title,
    display_label: pack.displayLabel,
    skills: pack.skills,
    imported_at: importedAt,
  });
  if (!withLabel.error) return;
  if (!isMissingColumn(withLabel.error, "display_label")) throw withLabel.error;

  const legacy = await supabase.from("site_skill_packs").insert({
    id: pack.id,
    title: pack.title,
    skills: pack.skills,
    imported_at: importedAt,
  });
  if (legacy.error) throw legacy.error;
}

export type SiteSkillPackPatch = {
  displayLabel?: string;
  /** 传空字符串表示清空 */
  chatUsageHint?: string;
};

export async function updateSiteSkillPack(
  supabase: SupabaseClient,
  id: string,
  patch: SiteSkillPackPatch,
): Promise<SkillPackRecord> {
  const updates: Record<string, string | null> = {};
  if (patch.displayLabel !== undefined) {
    const label = patch.displayLabel.trim();
    if (!label) throw new Error("显示名不能为空");
    updates.display_label = label;
  }
  if (patch.chatUsageHint !== undefined) {
    const hint = patch.chatUsageHint.trim();
    updates.chat_usage_hint = hint || null;
  }
  if (Object.keys(updates).length === 0) {
    throw new Error("没有可更新的字段");
  }

  const { data, error } = await supabase
    .from("site_skill_packs")
    .update(updates)
    .eq("id", id)
    .select(SELECT_FULL)
    .single();

  if (error) {
    if (isMissingColumn(error, "chat_usage_hint") && patch.chatUsageHint !== undefined) {
      throw new Error("数据库缺少 chat_usage_hint 列，无法保存对话页说明。请执行迁移 SQL。");
    }
    if (isMissingColumn(error, "display_label")) {
      throw new Error("数据库缺少 display_label 列，无法保存显示名。请执行迁移 SQL。");
    }
    throw error;
  }
  if (!data) throw new Error("Skill 包不存在");
  return rowToSkillPack(data as SiteSkillPackRow);
}

/** @deprecated 使用 updateSiteSkillPack */
export async function updateSiteSkillPackDisplayLabel(
  supabase: SupabaseClient,
  id: string,
  displayLabel: string,
): Promise<SkillPackRecord> {
  return updateSiteSkillPack(supabase, id, { displayLabel });
}

export async function deleteSiteSkillPack(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from("site_skill_packs").delete().eq("id", id);
  if (error) throw error;
}
