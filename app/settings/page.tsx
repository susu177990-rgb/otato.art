"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { API_KEY_MASK_PLACEHOLDER, isApiKeyConfiguredPlaceholder } from "@/lib/api-key-redaction";
import { normalizeLlmSettings } from "@/lib/llm-models";
import { normalizeModel } from "@/lib/model-presets";
import type { Settings } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/types";
import {
  DEFAULT_IMAGE_SETTINGS,
  IMAGE_MODEL_ORDER,
  type ImageWorkspaceSettings,
} from "@/lib/image-workspace";
import {
  DEFAULT_VIDEO_SETTINGS,
  VIDEO_MODE_LABELS,
  VIDEO_MODEL_ORDER,
  getVideoModelDefinition,
  type VideoWorkspaceSettings,
} from "@/lib/video-workspace";
import { useApiSettings } from "@/components/ApiSettingsProvider";
import { saveWorkspaceSnapshot } from "@/lib/workspace-api";
import shellStyles from "../shared/shell.module.css";
import styles from "./settings-page.module.css";

type Tab = "llmApi" | "imageApi" | "videoApi";

const settingsCardClass = [shellStyles.card, styles.floatCard].join(" ");

function apiKeyInputValue(value: string): string {
  return isApiKeyConfiguredPlaceholder(value) ? "" : value;
}

function apiKeyPlaceholder(value: string, fallback = "sk-..."): string {
  return isApiKeyConfiguredPlaceholder(value) ? API_KEY_MASK_PLACEHOLDER : fallback;
}

function nextLlmModelId(models: Settings["models"]): string {
  let index = Object.keys(models).length + 1;
  let id = `llm-${index}`;
  while (models[id]) {
    index += 1;
    id = `llm-${index}`;
  }
  return id;
}

function SettingsPageInner() {
  const {
    settings: loadedLlm,
    imageWorkspace: loadedImage,
    videoWorkspace: loadedVideo,
    apiUsageMode,
    workspaceReady,
    refreshWorkspace,
  } = useApiSettings();
  const [tab, setTab] = useState<Tab>("llmApi");
  const [llmSettings, setLlmSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [imageSettings, setImageSettings] = useState<ImageWorkspaceSettings>(DEFAULT_IMAGE_SETTINGS);
  const [videoSettings, setVideoSettings] = useState<VideoWorkspaceSettings>(DEFAULT_VIDEO_SETTINGS);
  const [savedMessage, setSavedMessage] = useState("");

  useEffect(() => {
    if (!workspaceReady) return;
    setLlmSettings(loadedLlm);
    setImageSettings(loadedImage);
    setVideoSettings(loadedVideo);
  }, [workspaceReady, loadedLlm, loadedImage, loadedVideo]);

  async function saveAll() {
    const normalizedLlm = normalizeLlmSettings(llmSettings);
    const nextApiUsageMode = {
      ...apiUsageMode,
      ...(tab === "llmApi" ? { llm: "user" as const } : {}),
      ...(tab === "imageApi" ? { image: "user" as const } : {}),
      ...(tab === "videoApi" ? { video: "user" as const } : {}),
    };
    setLlmSettings(normalizedLlm);
    try {
      await saveWorkspaceSnapshot({
        llm: normalizedLlm,
        imageWorkspace: imageSettings,
        videoWorkspace: videoSettings,
        apiUsageMode: nextApiUsageMode,
      });
      await refreshWorkspace();
      setSavedMessage("已保存个人设置");
    } catch (error) {
      setSavedMessage(error instanceof Error ? error.message : "保存失败");
    }
    window.setTimeout(() => setSavedMessage(""), 1400);
  }

  function addLlmModel() {
    setLlmSettings((current) => {
      const id = nextLlmModelId(current.models);
      return {
        ...current,
        models: {
          ...current.models,
          [id]: {
            id,
            label: "新模型",
            modelName: "",
            enabled: true,
            apiUrl: "",
            apiKey: "",
          },
        },
      };
    });
  }

  function addImageModel() {
    setSavedMessage("新建图片模型待配置");
    window.setTimeout(() => setSavedMessage(""), 1400);
  }

  function addVideoModel() {
    setSavedMessage("新建视频模型待配置");
    window.setTimeout(() => setSavedMessage(""), 1400);
  }

  const createAction =
    tab === "llmApi"
      ? { label: "新建模型", onClick: addLlmModel }
      : tab === "imageApi"
        ? { label: "新建图片模型", onClick: addImageModel }
        : { label: "新建视频模型", onClick: addVideoModel };

  return (
    <main className={[shellStyles.page, styles.settingsPage].join(" ")}>
      <header className={shellStyles.topbar}>
        <nav className={shellStyles.topbarLeft} aria-label="个人设置分类">
          <Link href="/" className={shellStyles.navLink}>返回首页</Link>
          <button type="button" onClick={() => setTab("llmApi")} className={[shellStyles.navLink, tab === "llmApi" ? shellStyles.navLinkActive : ""].filter(Boolean).join(" ")}>LLM</button>
          <button type="button" onClick={() => setTab("imageApi")} className={[shellStyles.navLink, tab === "imageApi" ? shellStyles.navLinkActive : ""].filter(Boolean).join(" ")}>图片</button>
          <button type="button" onClick={() => setTab("videoApi")} className={[shellStyles.navLink, tab === "videoApi" ? shellStyles.navLinkActive : ""].filter(Boolean).join(" ")}>视频</button>
        </nav>
        <div className={shellStyles.topnav}>
          {savedMessage ? <span className={styles.savedHint}>{savedMessage}</span> : null}
          {createAction ? (
            <button type="button" onClick={createAction.onClick} className={[shellStyles.navLink, styles.saveButton].join(" ")}>
              {createAction.label}
            </button>
          ) : null}
          <button type="button" onClick={saveAll} className={[shellStyles.navLink, styles.saveButton].join(" ")}>保存</button>
        </div>
      </header>

      <div className={styles.settingsBody}>
        <div className={styles.settingsWorkspace}>
          <section className={styles.settingsContent}>
            {tab === "llmApi" ? (
              <LlmApiPanel
                value={llmSettings}
                onChange={setLlmSettings}
              />
            ) : null}
            {tab === "imageApi" ? (
              <ImageApiPanel
                value={imageSettings}
                onChange={setImageSettings}
              />
            ) : null}
            {tab === "videoApi" ? (
              <VideoApiPanel
                value={videoSettings}
                onChange={setVideoSettings}
              />
            ) : null}
          </section>
        </div>
      </div>
    </main>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className={shellStyles.empty}>加载中…</div>}>
      <SettingsPageInner />
    </Suspense>
  );
}

function LlmApiPanel({
  value,
  onChange,
}: {
  value: Settings;
  onChange: (next: Settings) => void;
}) {
  const modelList = Object.values(value.models);

  return (
    <section className={[styles.panel, styles.apiCardGrid, styles.modelApiGrid].join(" ")}>
      {modelList.map((model) => (
        <div key={model.id} className={[settingsCardClass, styles.llmModelCard].join(" ")}>
          <div className={styles.llmModelCardTopBar}>
            <div className={styles.llmModelCardTopLeft}>
              {model.id === value.defaultModelId ? <span className={styles.defaultBadge}>默认模型</span> : (
                <button type="button" className={styles.setDefaultBtn} onClick={() => onChange({ ...value, defaultModelId: model.id })}>设为默认</button>
              )}
            </div>
            <div className={styles.llmModelCardTopRight}>
              <label className={styles.toggleSwitch} title={model.enabled ? "已启用" : "已停用"}>
                <input type="checkbox" className={styles.toggleSwitchInput} checked={model.enabled} onChange={(e) => onChange({ ...value, models: { ...value.models, [model.id]: { ...model, enabled: e.target.checked } } })} />
                <span className={styles.toggleSwitchSlider} />
              </label>
              {model.id !== value.defaultModelId ? (
                <button type="button" className={styles.deleteModelBtn} onClick={() => { const next = { ...value.models }; delete next[model.id]; onChange({ ...value, models: next }); }} title="删除">删除</button>
              ) : null}
            </div>
          </div>
          <div className={styles.llmModelCardFieldsCompact}>
            <div className={styles.llmModelCardRow}>
              <Field label="API URL" value={model.apiUrl} onChange={(apiUrl) => onChange({ ...value, models: { ...value.models, [model.id]: { ...model, apiUrl } } })} placeholder="https://.../v1/chat/completions" />
              <ApiKeyField value={model.apiKey} onChange={(apiKey) => onChange({ ...value, models: { ...value.models, [model.id]: { ...model, apiKey } } })} />
            </div>
            <div className={styles.llmModelCardRow}>
              <Field label="显示名" value={model.label} onChange={(label) => onChange({ ...value, models: { ...value.models, [model.id]: { ...model, label } } })} />
              <Field label="模型 ID" mono value={model.modelName} onChange={(modelName) => onChange({ ...value, models: { ...value.models, [model.id]: { ...model, modelName: normalizeModel(modelName) } } })} />
            </div>
          </div>
        </div>
      ))}
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
    <section className={[styles.panel, styles.apiCardGrid].join(" ")}>
      {IMAGE_MODEL_ORDER.map((id) => {
        const model = value.models[id];
        return (
          <div key={id} className={[settingsCardClass, styles.llmModelCard].join(" ")}>
            <div className={styles.llmModelCardTopBar}>
              <div className={styles.llmModelCardTopLeft}>
                <h2 className={shellStyles.cardTitle} style={{ fontSize: 15 }}>{model.label}</h2>
                <span style={{ marginLeft: 12, fontSize: 12, color: "var(--settings-muted)" }}>{model.provider === "gpt-image" ? "GPT Image 请求格式" : "Nano Banana 请求格式"}</span>
              </div>
            </div>
            <div className={styles.llmModelCardFieldsCompact}>
              <div className={styles.llmModelCardRow}>
                <Field label="Base URL / Endpoint" value={model.endpointUrl} onChange={(endpointUrl) => onChange({ ...value, models: { ...value.models, [id]: { ...value.models[id], endpointUrl } } })} placeholder="https://.../v1/images/generations" />
                <ApiKeyField value={model.apiKey} onChange={(apiKey) => onChange({ ...value, models: { ...value.models, [id]: { ...value.models[id], apiKey } } })} />
              </div>
              <div className={styles.llmModelCardRow}>
                <Field label="显示名" value={model.label} onChange={(label) => onChange({ ...value, models: { ...value.models, [id]: { ...value.models[id], label } } })} />
                <Field label="模型名" mono value={model.modelName} onChange={(modelName) => onChange({ ...value, models: { ...value.models, [id]: { ...value.models[id], modelName } } })} />
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}

function VideoApiPanel({
  value,
  onChange,
}: {
  value: VideoWorkspaceSettings;
  onChange: (next: VideoWorkspaceSettings) => void;
}) {
  return (
    <section className={[styles.panel, styles.apiCardGrid, styles.modelApiGrid].join(" ")}>
      {VIDEO_MODEL_ORDER.map((id) => {
        const model = value.models[id];
        const definition = getVideoModelDefinition(id);
        return (
          <div key={id} className={[settingsCardClass, styles.llmModelCard].join(" ")}>
            <div className={styles.llmModelCardTopBar}>
              <div className={styles.llmModelCardTopLeft}>
                <h2 className={shellStyles.cardTitle} style={{ fontSize: 15 }}>{model.label}</h2>
                <span style={{ marginLeft: 12, fontSize: 12, color: "var(--settings-muted)" }}>{definition.provider} · {definition.capabilities.supportedModes.map((modeId) => VIDEO_MODE_LABELS[modeId]).join(" / ")}</span>
              </div>
              <div className={styles.llmModelCardTopRight}>
                <label className={styles.toggleSwitch} title={model.enabled ? "已启用" : "已停用"}>
                  <input type="checkbox" className={styles.toggleSwitchInput} checked={model.enabled} onChange={(e) => onChange({ ...value, models: { ...value.models, [id]: { ...value.models[id], enabled: e.target.checked } } })} />
                  <span className={styles.toggleSwitchSlider} />
                </label>
              </div>
            </div>
            <div className={styles.llmModelCardFieldsCompact}>
              <div className={styles.llmModelCardRow}>
                <Field label="Base URL" mono value={model.baseUrl} onChange={(baseUrl) => onChange({ ...value, models: { ...value.models, [id]: { ...value.models[id], baseUrl } } })} placeholder="留空，后续填写" />
                <ApiKeyField value={model.apiKey} onChange={(apiKey) => onChange({ ...value, models: { ...value.models, [id]: { ...value.models[id], apiKey } } })} fallback="留空，后续填写" />
              </div>
              <div className={styles.llmModelCardRow}>
                <Field label="显示名" value={model.label} onChange={(label) => onChange({ ...value, models: { ...value.models, [id]: { ...value.models[id], label } } })} />
                <Field label="API Model Name" mono value={model.apiModelName} onChange={(apiModelName) => onChange({ ...value, models: { ...value.models, [id]: { ...value.models[id], apiModelName } } })} />
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}

function Field({ label, value, onChange, placeholder, mono }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; mono?: boolean }) {
  return (
    <label className={shellStyles.field}>
      <span className={shellStyles.fieldLabel}>{label}</span>
      <input className={[shellStyles.input, shellStyles.inputCompact, mono ? shellStyles.mono : ""].filter(Boolean).join(" ")} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} spellCheck={false} autoComplete="off" />
    </label>
  );
}

function ApiKeyField({ value, onChange, fallback }: { value: string; onChange: (value: string) => void; fallback?: string }) {
  return (
    <label className={shellStyles.field}>
      <span className={shellStyles.fieldLabel}>API Key</span>
      <input type="password" className={[shellStyles.input, shellStyles.inputCompact, shellStyles.mono].join(" ")} value={apiKeyInputValue(value)} placeholder={apiKeyPlaceholder(value, fallback)} onChange={(e) => onChange(e.target.value)} autoComplete="off" />
    </label>
  );
}
