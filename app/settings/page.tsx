"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type MutableRefObject } from "react";
import shellStyles from "../shared/shell.module.css";
import styles from "./settings-page.module.css";
import type { Settings } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/types";
import { normalizeModel } from "@/lib/model-presets";
import { loadSettings as loadLlmSettings } from "@/components/SettingsDialog";
import { saveLlmSettingsToLocal } from "@/lib/llm-settings-storage";
import { flushWorkspaceSettingsToProject } from "@/lib/workspace-settings-client";
import {
  DEFAULT_IMAGE_SETTINGS,
  IMAGE_MODEL_ORDER,
  IMAGE_MODES,
  IMAGE_REF_SLOT_COUNT,
  defaultImageModePrompt,
  extractPromptPlaceholderOccurrences,
  newCustomImageModeId,
  refSlotHintsDraftRowsToStored,
  refSlotHintsStoredToDraftRows,
  type ImageModeId,
  type ImageWorkspaceSettings,
} from "@/lib/image-workspace";
import { loadImageSettings, saveImageSettings } from "@/lib/image-storage";

type Tab = "llmApi" | "imageApi" | "imagePrompts";

const TAB_DEFS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: "llmApi", label: "LLM API" },
  { id: "imageApi", label: "生图 API" },
  { id: "imagePrompts", label: "生图 提示词" },
];

function persistLlmSettings(s: Settings) {
  const next = { ...s, model: normalizeModel(s.model) };
  saveLlmSettingsToLocal(next);
  flushWorkspaceSettingsToProject();
  return next;
}

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("llmApi");
  const [llmSettings, setLlmSettings] = useState<Settings>(() =>
    typeof window !== "undefined" ? loadLlmSettings() : DEFAULT_SETTINGS,
  );
  const [imageSettings, setImageSettings] = useState<ImageWorkspaceSettings>(() =>
    typeof window !== "undefined" ? loadImageSettings() : DEFAULT_IMAGE_SETTINGS,
  );
  const [savedMessage, setSavedMessage] = useState("");
  const imagePromptsPersistMergeRef = useRef<(() => ImageWorkspaceSettings) | null>(null);

  function saveAll() {
    const mergedImage =
      typeof imagePromptsPersistMergeRef.current === "function"
        ? imagePromptsPersistMergeRef.current()
        : imageSettings;
    setImageSettings(mergedImage);
    persistLlmSettings(llmSettings);
    saveImageSettings(mergedImage);
    setSavedMessage("已保存");
    window.setTimeout(() => setSavedMessage(""), 1400);
  }

  return (
    <main className={shellStyles.page}>
      <header className={shellStyles.topbar}>
        <div className={shellStyles.topbarLeft}>
          <Link href="/" className={[shellStyles.plainDockText, shellStyles.dockTextLink].join(" ")}>
            返回首页
          </Link>
          <div className={shellStyles.topbarTagline}>
            <p className={shellStyles.plainDockText}>项目设置</p>
          </div>
        </div>
        <nav className={shellStyles.topnav}>
          {savedMessage ? <span className={shellStyles.savedHint}>{savedMessage}</span> : null}
          <button
            type="button"
            onClick={saveAll}
            className={[shellStyles.navLink, shellStyles.navLinkPrimary].join(" ")}
          >
            保存
          </button>
        </nav>
      </header>

      <div className={shellStyles.body}>
        <div className={shellStyles.shell}>
          <p className={styles.workspacePersistNotice}>
            <strong>项目级配置</strong>以仓库根目录{" "}
            <code className={shellStyles.mono}>workspace-settings.json</code> 为准（启动时会注入浏览器）。
            本地运行 <code className={shellStyles.mono}>next dev</code>{" "}
            时点击「保存」会尝试写回该文件；请将其 <strong>git commit 并推送</strong>
            ，其他机器拉代码后即与仓库一致。部署环境若无写盘权限，界面仍会保存到浏览器缓存，需在本机写入 JSON 后提交。
          </p>
          <div className={styles.tabBar}>
            <div className={shellStyles.segmented}>
              {TAB_DEFS.map((def) => {
                const active = tab === def.id;
                return (
                  <button
                    key={def.id}
                    type="button"
                    onClick={() => setTab(def.id)}
                    className={[shellStyles.segmentedItem, active ? shellStyles.segmentedItemActive : ""].filter(Boolean).join(" ")}
                  >
                    {def.label}
                  </button>
                );
              })}
            </div>
          </div>

          {tab === "llmApi" ? (
            <LlmApiPanel value={llmSettings} onChange={setLlmSettings} />
          ) : null}

          {tab === "imagePrompts" ? (
            <ImagePromptsPanel
              value={imageSettings}
              onChange={setImageSettings}
              persistMergeRef={imagePromptsPersistMergeRef}
            />
          ) : null}

          {tab === "imageApi" ? (
            <ImageApiPanel value={imageSettings} onChange={setImageSettings} />
          ) : null}
        </div>
      </div>
    </main>
  );
}

function LlmApiPanel({
  value,
  onChange,
}: {
  value: Settings;
  onChange: (next: Settings) => void;
}) {
  return (
    <section className={styles.panel}>
      <div className={shellStyles.card}>
        <div className={shellStyles.cardHead}>
          <div>
            <h2 className={shellStyles.cardTitle}>LLM API</h2>
            <p className={shellStyles.cardSubtitle}>
              所有文本大模型（编剧室、策划对话、英语简报等）共用这一套 OpenAI 兼容网关；修改后点击顶部「保存」写入本机。
            </p>
          </div>
        </div>

        <div className={shellStyles.row}>
          <label className={[shellStyles.field, shellStyles.rowFull].join(" ")}>
            <span className={shellStyles.fieldLabel}>API URL</span>
            <input
              className={shellStyles.input}
              value={value.apiUrl}
              onChange={(e) => onChange({ ...value, apiUrl: e.target.value })}
              placeholder="https://.../v1/chat/completions"
            />
          </label>

          <label className={shellStyles.field}>
            <span className={shellStyles.fieldLabel}>API Key</span>
            <input
              type="password"
              className={[shellStyles.input, shellStyles.mono].join(" ")}
              value={value.apiKey}
              onChange={(e) => onChange({ ...value, apiKey: e.target.value })}
              placeholder="sk-..."
            />
          </label>

          <label className={shellStyles.field}>
            <span className={shellStyles.fieldLabel}>模型</span>
            <input
              className={[shellStyles.input, shellStyles.mono].join(" ")}
              value={value.model}
              onChange={(e) => onChange({ ...value, model: e.target.value })}
              placeholder="例如 gpt-5.4-mini、gemini-3.1-pro-preview（任意网关支持的模型 id）"
              spellCheck={false}
              autoComplete="off"
            />
          </label>
        </div>
      </div>
    </section>
  );
}

type ModePromptRow = { id: string; label: string; isCustom: boolean };

function ImagePromptsPanel({
  value,
  onChange,
  persistMergeRef,
}: {
  value: ImageWorkspaceSettings;
  onChange: (next: ImageWorkspaceSettings) => void;
  persistMergeRef?: MutableRefObject<(() => ImageWorkspaceSettings) | null>;
}) {
  const builtinRows: ModePromptRow[] = IMAGE_MODES.filter((m) => m.id !== "free").map((m) => ({
    id: m.id,
    label: m.label,
    isCustom: false,
  }));
  const customRows: ModePromptRow[] = (value.customModes ?? []).map((m) => ({
    id: m.id,
    label: m.label,
    isCustom: true,
  }));
  const allRows = [...builtinRows, ...customRows];

  const [editingPromptModeId, setEditingPromptModeId] = useState<string | null>(null);
  const [draftPrompts, setDraftPrompts] = useState<Partial<Record<string, string>>>({});
  const [draftLabels, setDraftLabels] = useState<Partial<Record<string, string>>>({});
  const [draftRefHintRows, setDraftRefHintRows] = useState<Partial<Record<string, string[]>>>({});

  useEffect(() => {
    const ref = persistMergeRef;
    if (!ref) return;
    ref.current = () => {
      if (editingPromptModeId === null) return value;
      const id = editingPromptModeId;
      const text = draftPrompts[id] ?? value.prompts[id] ?? "";
      const rows =
        draftRefHintRows[id] ?? refSlotHintsStoredToDraftRows(value.refSlotHintsByMode[id]);
      const parsedHints = refSlotHintsDraftRowsToStored(rows);
      const hintsMap = { ...value.refSlotHintsByMode };
      if (parsedHints.length === 0) delete hintsMap[id];
      else hintsMap[id] = parsedHints;

      let merged: ImageWorkspaceSettings = {
        ...value,
        prompts: { ...value.prompts, [id]: text },
        refSlotHintsByMode: hintsMap,
      };
      if (id.startsWith("custom_")) {
        const labelRaw =
          draftLabels[id] ?? value.customModes?.find((m) => m.id === id)?.label ?? id;
        const label = String(labelRaw).trim() || id;
        merged = {
          ...merged,
          customModes: (merged.customModes ?? []).map((m) => (m.id === id ? { ...m, label } : m)),
        };
      }
      return merged;
    };
    return () => {
      ref.current = null;
    };
  }, [
    persistMergeRef,
    value,
    editingPromptModeId,
    draftPrompts,
    draftLabels,
    draftRefHintRows,
  ]);

  function handleSavePrompt(modeId: string) {
    const text = draftPrompts[modeId] ?? value.prompts[modeId] ?? "";
    const rows =
      draftRefHintRows[modeId] ?? refSlotHintsStoredToDraftRows(value.refSlotHintsByMode[modeId]);
    const parsedHints = refSlotHintsDraftRowsToStored(rows);
    const hintsMap = { ...value.refSlotHintsByMode };
    if (parsedHints.length === 0) delete hintsMap[modeId];
    else hintsMap[modeId] = parsedHints;

    let next: ImageWorkspaceSettings = {
      ...value,
      prompts: { ...value.prompts, [modeId]: text },
      refSlotHintsByMode: hintsMap,
    };
    if (modeId.startsWith("custom_")) {
      const labelRaw =
        draftLabels[modeId] ?? value.customModes?.find((m) => m.id === modeId)?.label ?? modeId;
      const label = String(labelRaw).trim() || modeId;
      next = {
        ...next,
        customModes: (next.customModes ?? []).map((m) => (m.id === modeId ? { ...m, label } : m)),
      };
    }
    onChange(next);
    saveImageSettings(next);
    setEditingPromptModeId((cur) => (cur === modeId ? null : cur));
    setDraftPrompts((prev) => {
      const copy = { ...prev };
      delete copy[modeId];
      return copy;
    });
    setDraftLabels((prev) => {
      const copy = { ...prev };
      delete copy[modeId];
      return copy;
    });
    setDraftRefHintRows((prev) => {
      const copy = { ...prev };
      delete copy[modeId];
      return copy;
    });
  }

  function handleEditPrompt(modeId: string) {
    setDraftPrompts((prev) => {
      const copy = { ...prev };
      if (editingPromptModeId !== null && editingPromptModeId !== modeId) {
        delete copy[editingPromptModeId];
      }
      copy[modeId] = value.prompts[modeId] ?? "";
      return copy;
    });
    setDraftRefHintRows((prev) => {
      const copy = { ...prev };
      if (editingPromptModeId !== null && editingPromptModeId !== modeId) {
        delete copy[editingPromptModeId];
      }
      copy[modeId] = refSlotHintsStoredToDraftRows(value.refSlotHintsByMode[modeId]);
      return copy;
    });
    if (modeId.startsWith("custom_")) {
      setDraftLabels((prev) => ({
        ...prev,
        [modeId]: value.customModes?.find((m) => m.id === modeId)?.label ?? "",
      }));
    }
    setEditingPromptModeId(modeId);
  }

  function handleAddCustomMode() {
    const id = newCustomImageModeId();
    const next: ImageWorkspaceSettings = {
      ...value,
      customModes: [...(value.customModes ?? []), { id, label: `自定义模式 ${(value.customModes?.length ?? 0) + 1}` }],
      prompts: { ...value.prompts, [id]: "" },
    };
    onChange(next);
    saveImageSettings(next);
    handleEditPrompt(id);
  }

  function handleDeleteCustomMode(modeId: string) {
    if (!modeId.startsWith("custom_")) return;
    const restPrompts = { ...value.prompts };
    delete restPrompts[modeId];
    const restHints = { ...value.refSlotHintsByMode };
    delete restHints[modeId];
    const next: ImageWorkspaceSettings = {
      ...value,
      customModes: (value.customModes ?? []).filter((m) => m.id !== modeId),
      prompts: restPrompts,
      refSlotHintsByMode: restHints,
    };
    onChange(next);
    saveImageSettings(next);
    setEditingPromptModeId((cur) => (cur === modeId ? null : cur));
    setDraftPrompts((prev) => {
      const copy = { ...prev };
      delete copy[modeId];
      return copy;
    });
    setDraftLabels((prev) => {
      const copy = { ...prev };
      delete copy[modeId];
      return copy;
    });
    setDraftRefHintRows((prev) => {
      const copy = { ...prev };
      delete copy[modeId];
      return copy;
    });
  }

  function handleDeletePromptRow(mode: ModePromptRow) {
    if (mode.isCustom) {
      handleDeleteCustomMode(mode.id);
      return;
    }
    if (
      !window.confirm(
        `「${mode.label}」将恢复为内置默认提示词，并清空该模式的参考图槽说明（当前模版修改会丢失），确定？`,
      )
    ) {
      return;
    }
    const defaultPrompt = defaultImageModePrompt(mode.id as ImageModeId);
    const restHints = { ...value.refSlotHintsByMode };
    delete restHints[mode.id];
    const next: ImageWorkspaceSettings = {
      ...value,
      prompts: { ...value.prompts, [mode.id]: defaultPrompt },
      refSlotHintsByMode: restHints,
    };
    onChange(next);
    saveImageSettings(next);
    setEditingPromptModeId((cur) => (cur === mode.id ? null : cur));
    setDraftPrompts((prev) => {
      const copy = { ...prev };
      delete copy[mode.id];
      return copy;
    });
    setDraftRefHintRows((prev) => {
      const copy = { ...prev };
      delete copy[mode.id];
      return copy;
    });
  }

  function handleAddRefHintRow(modeId: string) {
    setDraftRefHintRows((prev) => {
      const cur = [...(prev[modeId] ?? refSlotHintsStoredToDraftRows(value.refSlotHintsByMode[modeId]))];
      if (cur.length >= IMAGE_REF_SLOT_COUNT) return prev;
      return { ...prev, [modeId]: [...cur, ""] };
    });
  }

  function handleRemoveRefHintRow(modeId: string, index: number) {
    setDraftRefHintRows((prev) => {
      const cur = [...(prev[modeId] ?? refSlotHintsStoredToDraftRows(value.refSlotHintsByMode[modeId]))];
      if (cur.length <= 1) return prev;
      cur.splice(index, 1);
      return { ...prev, [modeId]: cur };
    });
  }

  function handleChangeRefHintRow(modeId: string, index: number, text: string) {
    setDraftRefHintRows((prev) => {
      const cur = [...(prev[modeId] ?? refSlotHintsStoredToDraftRows(value.refSlotHintsByMode[modeId]))];
      cur[index] = text;
      return { ...prev, [modeId]: cur };
    });
  }

  return (
    <section className={styles.panel}>
      <div className={shellStyles.card}>
        <div className={shellStyles.cardHead}>
          <div>
            <h2 className={shellStyles.cardTitle}>生图模式 · 固定提示词</h2>
            <p className={shellStyles.cardSubtitle}>
              3 列宫格对应作图页各模式（内置 + 你添加的自定义模式）。默认只读；点「编辑」或点击模版文本框进入编辑，「保存」后写入本机。模版中每出现一处{" "}
              <code className={shellStyles.mono}>{"{{…}}"}</code>{" "}
              占位符，作图页会对应多一栏输入（从左到右依次填入）；输入框内的灰色说明文字取自对应占位符「括号里的内容」，请在{" "}
              <code className={shellStyles.mono}>{"{{此处写提示}}"}</code>{" "}
              中写好管理者面向用户的说明。
              <strong className={styles.promptIntroStrong}>
                下方「参考图槽」按「图1」「图2」逐栏填写说明：每栏一个小输入框；在最后一栏输入框右侧点「+」可增加一栏（最多 {IMAGE_REF_SLOT_COUNT}{" "}
                栏）。未填的槽在作图页仅显示「图n」。不再尝试从正文自动识别。
              </strong>
              超过 6 处占位时窄屏可能较挤。每张卡片均有「删除」：自定义模式为移除该模式；内置模式为恢复默认模版（含清空该模式参考图说明）。顶部「保存」会并入正在编辑中的草稿。
            </p>
            <div className={styles.promptIntroActions}>
              <button type="button" className={shellStyles.buttonSubtle} onClick={handleAddCustomMode}>
                添加自定义模式
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.promptModeGrid}>
        {allRows.map((mode) => {
          const isEditing = editingPromptModeId === mode.id;
          const savedText = value.prompts[mode.id] ?? "";
          const textareaValue = isEditing ? (draftPrompts[mode.id] ?? savedText) : savedText;
          const occCount = extractPromptPlaceholderOccurrences(savedText).length;
          const refRowsForMode = isEditing
            ? (draftRefHintRows[mode.id] ?? refSlotHintsStoredToDraftRows(value.refSlotHintsByMode[mode.id]))
            : refSlotHintsStoredToDraftRows(value.refSlotHintsByMode[mode.id]);

          return (
            <article key={mode.id} className={[shellStyles.card, styles.promptModeCard].join(" ")}>
              <header className={[shellStyles.cardHead, styles.promptModeCardHead].join(" ")}>
                {mode.isCustom && isEditing ? (
                  <label className={styles.promptModeLabelEdit}>
                    <span className={styles.visuallyHidden}>模式名称</span>
                    <input
                      className={[shellStyles.input, shellStyles.inputCompact].join(" ")}
                      value={draftLabels[mode.id] ?? mode.label}
                      onChange={(e) =>
                        setDraftLabels((prev) => ({ ...prev, [mode.id]: e.target.value }))
                      }
                      aria-label="自定义模式名称"
                    />
                  </label>
                ) : (
                  <h3 className={styles.promptModeCardTitle}>{mode.label}</h3>
                )}
                <div className={styles.promptModeCardActions}>
                  <button
                    type="button"
                    className={shellStyles.buttonSubtle}
                    onClick={() => handleDeletePromptRow(mode)}
                    aria-label={mode.isCustom ? `删除自定义模式 ${mode.label}` : `恢复 ${mode.label} 默认提示词`}
                  >
                    删除
                  </button>
                  <button
                    type="button"
                    className={shellStyles.buttonSubtle}
                    onClick={() => (isEditing ? handleSavePrompt(mode.id) : handleEditPrompt(mode.id))}
                  >
                    {isEditing ? "保存" : "编辑"}
                  </button>
                </div>
              </header>
              {occCount > 6 ? (
                <p className={styles.promptOccWarn}>当前模版含 {occCount} 处占位符，作图页将显示 {occCount} 栏输入。</p>
              ) : null}
              <textarea
                className={[
                  shellStyles.textarea,
                  shellStyles.mono,
                  styles.promptModeTextarea,
                  !isEditing ? styles.promptModeTextareaReadOnly : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                value={textareaValue}
                readOnly={!isEditing}
                spellCheck={false}
                aria-readonly={!isEditing}
                onClick={() => {
                  if (!isEditing) handleEditPrompt(mode.id);
                }}
                onFocus={() => {
                  if (!isEditing) handleEditPrompt(mode.id);
                }}
                onChange={(e) => {
                  if (!isEditing) return;
                  setDraftPrompts((prev) => ({ ...prev, [mode.id]: e.target.value }));
                }}
              />
              <div className={styles.promptModeRefHintsWrap}>
                <span className={styles.promptModeRefHintsLabel}>
                  参考图槽说明（每栏对应作图页「图1」「图2」…，最多 {IMAGE_REF_SLOT_COUNT} 栏）
                </span>
                <div className={styles.promptModeRefHintsList}>
                  {refRowsForMode.map((hintText, idx) => (
                    <div key={idx} className={styles.promptModeRefHintRow}>
                      <span className={styles.promptModeRefHintIdx}>图{idx + 1}</span>
                      <input
                        type="text"
                        className={[
                          shellStyles.input,
                          styles.promptModeRefHintInput,
                          !isEditing ? styles.promptModeTextareaReadOnly : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        value={hintText}
                        readOnly={!isEditing}
                        placeholder={idx === 0 ? "例如：面部参考" : "可选说明"}
                        spellCheck={false}
                        aria-label={`参考图槽图${idx + 1}说明`}
                        onClick={() => {
                          if (!isEditing) handleEditPrompt(mode.id);
                        }}
                        onFocus={() => {
                          if (!isEditing) handleEditPrompt(mode.id);
                        }}
                        onChange={(e) => {
                          if (!isEditing) return;
                          handleChangeRefHintRow(mode.id, idx, e.target.value);
                        }}
                      />
                      {isEditing &&
                      idx === refRowsForMode.length - 1 &&
                      refRowsForMode.length < IMAGE_REF_SLOT_COUNT ? (
                        <button
                          type="button"
                          className={[shellStyles.buttonSubtle, styles.promptModeRefHintPlusBtn].join(" ")}
                          onClick={() => handleAddRefHintRow(mode.id)}
                          aria-label="添加一栏参考图槽说明"
                        >
                          +
                        </button>
                      ) : null}
                      {isEditing && refRowsForMode.length > 1 ? (
                        <button
                          type="button"
                          className={[shellStyles.buttonSubtle, styles.promptModeRefHintRowBtn].join(" ")}
                          onClick={() => handleRemoveRefHintRow(mode.id, idx)}
                          aria-label={`移除图${idx + 1}说明栏`}
                        >
                          移除
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ImageApiPanel({
  value,
  onChange,
}: {
  value: ImageWorkspaceSettings;
  onChange: (next: ImageWorkspaceSettings) => void;
}) {
  return (
    <section className={styles.panel}>
      {IMAGE_MODEL_ORDER.map((id) => {
        const model = value.models[id];
        return (
          <div key={id} className={shellStyles.card}>
            <div className={shellStyles.cardHead}>
              <div>
                <h2 className={shellStyles.cardTitle}>{model.label}</h2>
                <p className={shellStyles.cardSubtitle}>
                  {model.provider === "gpt-image" ? "GPT Image 请求格式" : "Nano Banana 请求格式"}
                </p>
              </div>
            </div>

            <div className={shellStyles.row}>
              <label className={[shellStyles.field, shellStyles.rowFull].join(" ")}>
                <span className={shellStyles.fieldLabel}>Base URL / Endpoint</span>
                <input
                  className={shellStyles.input}
                  value={model.endpointUrl}
                  placeholder="https://.../v1/images/generations"
                  onChange={(e) =>
                    onChange({
                      ...value,
                      models: {
                        ...value.models,
                        [id]: { ...value.models[id], endpointUrl: e.target.value },
                      },
                    })
                  }
                />
              </label>

              <label className={shellStyles.field}>
                <span className={shellStyles.fieldLabel}>API Key</span>
                <input
                  type="password"
                  className={[shellStyles.input, shellStyles.mono].join(" ")}
                  value={model.apiKey}
                  placeholder="sk-..."
                  onChange={(e) =>
                    onChange({
                      ...value,
                      models: {
                        ...value.models,
                        [id]: { ...value.models[id], apiKey: e.target.value },
                      },
                    })
                  }
                />
              </label>

              <label className={shellStyles.field}>
                <span className={shellStyles.fieldLabel}>模型名</span>
                <input
                  className={[shellStyles.input, shellStyles.mono].join(" ")}
                  value={model.modelName}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      models: {
                        ...value.models,
                        [id]: { ...value.models[id], modelName: e.target.value },
                      },
                    })
                  }
                />
              </label>
            </div>
          </div>
        );
      })}
    </section>
  );
}
