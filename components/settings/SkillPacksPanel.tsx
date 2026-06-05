"use client";

import { useCallback, useEffect, useState } from "react";
import shellStyles from "@/app/shared/shell.module.css";
import settingsStyles from "@/app/settings/settings-page.module.css";
import { SkillZipUploader } from "@/components/skill/SkillZipUploader";
import { skillPackDisplayLabel, skillPackHasFormInterface } from "@/lib/chat/skill-pack";
import type { SkillPackRecord } from "@/lib/chat/types";
import { MAX_SKILL_ZIP_BYTES } from "@/lib/chat/skill-pack";
import {
  deleteSiteSkillPackApi,
  fetchSiteSkillPacks,
  importSiteSkillPack,
  updateSiteSkillPackApi,
} from "@/lib/skill-packs-api-client";

function formatImportedAt(ts: number): string {
  try {
    return new Date(ts).toLocaleString("zh-CN", { hour12: false });
  } catch {
    return "";
  }
}

const settingsCardClass = [shellStyles.card, settingsStyles.floatCard].join(" ");

export function SkillPacksPanel() {
  const [skillPacks, setSkillPacks] = useState<SkillPackRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [hintDraftById, setHintDraftById] = useState<Record<string, string>>({});
  const [canManage, setCanManage] = useState(true);

  const reload = useCallback(async () => {
    const data = await fetchSiteSkillPacks();
    setSkillPacks(data.skillPacks);
    setCanManage(data.canManage);
  }, []);

  useEffect(() => {
    void reload()
      .catch((e) => setError(e instanceof Error ? e.message : "加载失败"))
      .finally(() => setLoading(false));
  }, [reload]);

  const flashStatus = (msg: string) => {
    setStatus(msg);
    window.setTimeout(() => setStatus(null), 2000);
  };

  const handleImport = async (file: File) => {
    setError(null);
    if (!canManage) {
      setError("只有管理员可以导入全站 Skill 包");
      return;
    }
    try {
      const pack = await importSiteSkillPack(file);
      setSkillPacks((prev) => [pack, ...prev.filter((p) => p.id !== pack.id)]);
      flashStatus(`已导入「${skillPackDisplayLabel(pack)}」`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "导入失败");
    }
  };

  const startEdit = (pack: SkillPackRecord) => {
    if (!canManage) return;
    setEditingId(pack.id);
    setEditDraft(skillPackDisplayLabel(pack));
    setHintDraftById((prev) => ({ ...prev, [pack.id]: pack.chatUsageHint ?? "" }));
  };

  const commitEdit = async (packId: string) => {
    if (!canManage) return;
    const label = editDraft.trim();
    if (!label) {
      setError("显示名不能为空");
      return;
    }
    setError(null);
    const hint = hintDraftById[packId] ?? "";
    try {
      const updated = await updateSiteSkillPackApi(packId, { displayLabel: label, chatUsageHint: hint });
      setSkillPacks((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setEditingId(null);
      flashStatus("已保存");
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    }
  };

  const handleDelete = async (id: string) => {
    setError(null);
    if (!canManage) {
      setError("只有管理员可以删除全站 Skill 包");
      return;
    }
    if (!window.confirm("确定删除该 Skill 包？")) return;
    try {
      await deleteSiteSkillPackApi(id);
      setSkillPacks((prev) => prev.filter((p) => p.id !== id));
      if (editingId === id) setEditingId(null);
      flashStatus("已删除");
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败");
    }
  };

  return (
    <section className={settingsStyles.panel}>
      <div className={settingsCardClass}>
        <div className={shellStyles.cardHead}>
          <div>
            <h2 className={shellStyles.cardTitle}>Skill 包预设</h2>
            <p className={shellStyles.cardSubtitle}>
              全站 Skill 包：用户在「对话」页单选一个 Skill 后注入 Agent。ZIP 须含 <code>SKILL.md</code>，上传后立即写入云端。
            </p>
            {!canManage ? <p className={shellStyles.banner}>当前账号只有读取权限，不能修改全站 Skill 包。</p> : null}
            {canManage ? (
              <div className={settingsStyles.promptIntroActions} style={{ maxWidth: "240px" }}>
                <SkillZipUploader maxZipBytes={MAX_SKILL_ZIP_BYTES} onImportZip={handleImport} />
              </div>
            ) : null}
            {status ? <p style={{ fontSize: "12px", color: "#86efac", marginTop: "8px", marginBottom: 0 }}>{status}</p> : null}
            {error ? <p className={shellStyles.bannerError} style={{ marginTop: "8px" }}>{error}</p> : null}
          </div>
        </div>
      </div>

      <div className={settingsStyles.promptModeGrid}>
        {loading ? (
          <p style={{ padding: "16px", color: "var(--settings-muted)", gridColumn: "1 / -1" }}>加载中…</p>
        ) : skillPacks.length === 0 ? (
          <p style={{ padding: "16px", color: "var(--settings-muted)", gridColumn: "1 / -1" }}>尚未上传 Skill 包。</p>
        ) : (
          skillPacks.map((p) => {
            const editing = editingId === p.id;
            const hintValue = editing ? (hintDraftById[p.id] ?? p.chatUsageHint ?? "") : (p.chatUsageHint ?? "");

            return (
              <article key={p.id} className={[settingsCardClass, settingsStyles.promptModeCard].join(" ")}>
                <header className={[shellStyles.cardHead, settingsStyles.promptModeCardHead].join(" ")}>
                  {editing ? (
                    <label className={settingsStyles.promptModeLabelEdit}>
                      <span className={settingsStyles.visuallyHidden}>显示名</span>
                      <input
                        className={[shellStyles.input, shellStyles.inputCompact].join(" ")}
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        autoFocus
                        aria-label="对话页显示名"
                        placeholder="显示名"
                      />
                    </label>
                  ) : (
                    <h3 className={settingsStyles.promptModeCardTitle}>{skillPackDisplayLabel(p)}</h3>
                  )}
                  <div className={settingsStyles.promptModeCardActions}>
                    <button
                      type="button"
                      className={shellStyles.buttonSubtle}
                      disabled={!canManage}
                      onClick={() => void handleDelete(p.id)}
                    >
                      删除
                    </button>
                    <button
                      type="button"
                      className={shellStyles.buttonSubtle}
                      disabled={!canManage}
                      onClick={() => (editing ? void commitEdit(p.id) : startEdit(p))}
                    >
                      {editing ? "保存" : "编辑"}
                    </button>
                  </div>
                </header>
                <div className={settingsStyles.promptModeEditBody} style={{ flexDirection: "column" }}>
                  <div style={{ fontSize: "11px", color: "var(--settings-muted)", padding: "4px 0", lineHeight: 1.5 }}>
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={p.title}>
                      ZIP: {p.title}
                    </div>
                    <div>
                      {p.skills.length} 个 skill · {skillPackHasFormInterface(p) ? "表单" : "对话"} · {formatImportedAt(p.importedAt).split(" ")[0]}
                    </div>
                  </div>
                  <textarea
                    className={[
                      shellStyles.textarea,
                      shellStyles.mono,
                      settingsStyles.promptModeTextarea,
                      !editing ? settingsStyles.promptModeTextareaReadOnly : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    style={{ minHeight: "140px", maxHeight: "240px", flex: 1 }}
                    value={hintValue}
                    readOnly={!editing}
                    spellCheck={false}
                    placeholder={`## ${skillPackDisplayLabel(p)}\n\n- /start — 查看菜单\n- /asset — 输出模板`}
                    onChange={(e) => {
                      if (!editing) return;
                      setHintDraftById((prev) => ({ ...prev, [p.id]: e.target.value }));
                    }}
                    onClick={() => {
                      if (!editing) startEdit(p);
                    }}
                    onFocus={() => {
                      if (!editing) startEdit(p);
                    }}
                  />
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
