"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { normalizeLlmSettings } from "@/lib/llm-models";
import { normalizeModel } from "@/lib/model-presets";
import type { Settings } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/types";
import {
  DEFAULT_IMAGE_SETTINGS,
  IMAGE_MODEL_ORDER,
  type ImageModelId,
  type ImageWorkspaceSettings,
} from "@/lib/image-workspace";
import {
  DEFAULT_VIDEO_SETTINGS,
  VIDEO_MODE_LABELS,
  VIDEO_MODEL_ORDER,
  getVideoModelDefinition,
  type VideoModelId,
  type VideoWorkspaceSettings,
} from "@/lib/video-workspace";
import { useApiSettings } from "@/components/ApiSettingsProvider";
import { saveWorkspaceSnapshot, testWorkspaceApiConnection } from "@/lib/workspace-api";
import type { PersonalApiModule, PersonalApiTestResult } from "@/lib/personal-api-test";
import shellStyles from "../shared/shell.module.css";
import styles from "./settings-page.module.css";

type Tab = "llmApi" | "imageApi" | "videoApi";
type TestResults = Record<string, PersonalApiTestResult>;

const settingsCardClass = [shellStyles.card, styles.floatCard].join(" ");

function tabModule(tab: Tab): PersonalApiModule {
  if (tab === "imageApi") return "image";
  if (tab === "videoApi") return "video";
  return "llm";
}

function moduleLabel(module: PersonalApiModule): string {
  if (module === "image") return "图片";
  if (module === "video") return "视频";
  return "LLM";
}

function resultKey(module: PersonalApiModule, modelId: string): string {
  return `${module}:${modelId}`;
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
  const [testingKey, setTestingKey] = useState("");
  const [testResults, setTestResults] = useState<TestResults>({});

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
        ...(tab === "llmApi" ? { llm: normalizedLlm } : {}),
        ...(tab === "imageApi" ? { imageWorkspace: imageSettings } : {}),
        ...(tab === "videoApi" ? { videoWorkspace: videoSettings } : {}),
        apiUsageMode: nextApiUsageMode,
      });
      await refreshWorkspace();
      setSavedMessage(`已保存个人${moduleLabel(tabModule(tab))}设置，并切换为个人配置`);
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

  async function runConnectionTest(module: PersonalApiModule, modelId: string) {
    const key = resultKey(module, modelId);
    setTestingKey(key);
    try {
      const result = await testWorkspaceApiConnection({ module, modelId });
      setTestResults((current) => ({ ...current, [key]: result }));
    } catch (error) {
      setTestResults((current) => ({
        ...current,
        [key]: {
          ok: false,
          code: "TEST_CONNECTION_FAILED",
          module,
          modelId,
          stage: "upstream_submit",
          message: error instanceof Error ? error.message : "测试连接失败",
        },
      }));
    } finally {
      setTestingKey("");
    }
  }

  const createAction =
    tab === "llmApi"
      ? { label: "新建模型", onClick: addLlmModel }
      : null;
  const currentModule = tabModule(tab);
  const currentMode = apiUsageMode[currentModule];

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
            <div className={[settingsCardClass, styles.apiModeNotice].join(" ")}>
              <span>{moduleLabel(currentModule)}当前使用：{currentMode === "user" ? "个人配置" : "公共配置"}</span>
              <span>保存本页后会自动切换为个人配置；测试连接只测试已保存的个人配置。</span>
            </div>
            {tab === "llmApi" ? (
              <LlmApiPanel
                value={llmSettings}
                onChange={setLlmSettings}
                onTest={(modelId) => void runConnectionTest("llm", modelId)}
                testingKey={testingKey}
                testResults={testResults}
              />
            ) : null}
            {tab === "imageApi" ? (
              <ImageApiPanel
                value={imageSettings}
                onChange={setImageSettings}
                onTest={(modelId) => void runConnectionTest("image", modelId)}
                testingKey={testingKey}
                testResults={testResults}
              />
            ) : null}
            {tab === "videoApi" ? (
              <VideoApiPanel
                value={videoSettings}
                onChange={setVideoSettings}
                onTest={(modelId) => void runConnectionTest("video", modelId)}
                testingKey={testingKey}
                testResults={testResults}
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
  onTest,
  testingKey,
  testResults,
}: {
  value: Settings;
  onChange: (next: Settings) => void;
  onTest: (modelId: string) => void;
  testingKey: string;
  testResults: TestResults;
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
              <button type="button" className={styles.setDefaultBtn} onClick={() => onTest(model.id)} disabled={testingKey === resultKey("llm", model.id)}>
                {testingKey === resultKey("llm", model.id) ? "测试中" : "测试连接"}
              </button>
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
          <ApiTestResultView result={testResults[resultKey("llm", model.id)]} />
        </div>
      ))}
    </section>
  );
}

function ImageApiPanel({
  value,
  onChange,
  onTest,
  testingKey,
  testResults,
}: {
  value: ImageWorkspaceSettings;
  onChange: (next: ImageWorkspaceSettings) => void;
  onTest: (modelId: ImageModelId) => void;
  testingKey: string;
  testResults: TestResults;
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
              <div className={styles.llmModelCardTopRight}>
                <button type="button" className={styles.setDefaultBtn} onClick={() => onTest(id)} disabled={testingKey === resultKey("image", id)}>
                  {testingKey === resultKey("image", id) ? "测试中" : "测试连接"}
                </button>
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
            <ApiTestResultView result={testResults[resultKey("image", id)]} />
          </div>
        );
      })}
    </section>
  );
}

function VideoApiPanel({
  value,
  onChange,
  onTest,
  testingKey,
  testResults,
}: {
  value: VideoWorkspaceSettings;
  onChange: (next: VideoWorkspaceSettings) => void;
  onTest: (modelId: VideoModelId) => void;
  testingKey: string;
  testResults: TestResults;
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
                <button type="button" className={styles.setDefaultBtn} onClick={() => onTest(id)} disabled={testingKey === resultKey("video", id)}>
                  {testingKey === resultKey("video", id) ? "测试中" : "测试连接"}
                </button>
                <label className={styles.toggleSwitch} title={model.enabled ? "已启用" : "已停用"}>
                  <input type="checkbox" className={styles.toggleSwitchInput} checked={model.enabled} onChange={(e) => onChange({ ...value, models: { ...value.models, [id]: { ...value.models[id], enabled: e.target.checked } } })} />
                  <span className={styles.toggleSwitchSlider} />
                </label>
              </div>
            </div>
            <div className={styles.llmModelCardFieldsCompact}>
              <div className={styles.llmModelCardRow}>
                <Field label="Base URL" mono value={model.baseUrl} onChange={(baseUrl) => onChange({ ...value, models: { ...value.models, [id]: { ...value.models[id], baseUrl } } })} placeholder="留空，后续填写" />
                <ApiKeyField value={model.apiKey} onChange={(apiKey) => onChange({ ...value, models: { ...value.models, [id]: { ...value.models[id], apiKey } } })} />
              </div>
              <div className={styles.llmModelCardRow}>
                <Field label="显示名" value={model.label} onChange={(label) => onChange({ ...value, models: { ...value.models, [id]: { ...value.models[id], label } } })} />
                <Field label="API Model Name" mono value={model.apiModelName} onChange={(apiModelName) => onChange({ ...value, models: { ...value.models, [id]: { ...value.models[id], apiModelName } } })} />
              </div>
            </div>
            <ApiTestResultView result={testResults[resultKey("video", id)]} />
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

function ApiKeyField({ value, onChange, fallback = "sk-..." }: { value: string; onChange: (value: string) => void; fallback?: string }) {
  return (
    <label className={shellStyles.field}>
      <span className={shellStyles.fieldLabel}>API Key</span>
      <input type="password" className={[shellStyles.input, shellStyles.inputCompact, shellStyles.mono].join(" ")} value={value} placeholder={fallback} onChange={(e) => onChange(e.target.value)} autoComplete="off" />
    </label>
  );
}

function ApiTestResultView({ result }: { result?: PersonalApiTestResult }) {
  if (!result) return null;
  return (
    <div className={[styles.apiTestResult, result.ok ? styles.apiTestResultOk : styles.apiTestResultError].join(" ")}>
      <span>{result.message}</span>
      <code>{[result.code, result.stage, result.safeEndpoint].filter(Boolean).join(" · ")}</code>
    </div>
  );
}
