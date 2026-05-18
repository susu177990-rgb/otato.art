"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import shellStyles from "../shared/shell.module.css";
import styles from "./settings-page.module.css";
import type { Settings } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/types";
import { normalizeModel } from "@/lib/model-presets";
import { SETTINGS_STORAGE_KEY, loadSettings as loadLlmSettings } from "@/components/SettingsDialog";
import {
  DEFAULT_IMAGE_SETTINGS,
  IMAGE_MODEL_ORDER,
  IMAGE_MODES,
  type ImageWorkspaceSettings,
} from "@/lib/image-workspace";
import { loadImageSettings, saveImageSettings } from "@/lib/image-storage";

type Tab = "llmApi" | "imagePrompts" | "imageApi";

const TAB_DEFS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: "llmApi", label: "LLM API" },
  { id: "imagePrompts", label: "生图 提示词" },
  { id: "imageApi", label: "生图 API" },
];

function persistLlmSettings(s: Settings) {
  const next = { ...s, model: normalizeModel(s.model) };
  if (typeof window !== "undefined") {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
  }
  return next;
}

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("llmApi");
  const [llmSettings, setLlmSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [imageSettings, setImageSettings] = useState<ImageWorkspaceSettings>(DEFAULT_IMAGE_SETTINGS);
  const [savedMessage, setSavedMessage] = useState("");

  useEffect(() => {
    setLlmSettings(loadLlmSettings());
    setImageSettings(loadImageSettings());
  }, []);

  function saveAll() {
    persistLlmSettings(llmSettings);
    saveImageSettings(imageSettings);
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
            <ImagePromptsPanel value={imageSettings} onChange={setImageSettings} />
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

function ImagePromptsPanel({
  value,
  onChange,
}: {
  value: ImageWorkspaceSettings;
  onChange: (next: ImageWorkspaceSettings) => void;
}) {
  const templateModes = IMAGE_MODES.filter((m) => m.id !== "free");

  return (
    <section className={styles.panel}>
      <div className={shellStyles.card}>
        <div className={shellStyles.cardHead}>
          <div>
            <h2 className={shellStyles.cardTitle}>生图模式 · 固定提示词</h2>
            <p className={shellStyles.cardSubtitle}>
              下列每种模版对应作图页左侧的一个模式。请保留占位符（如{" "}
              <code className={shellStyles.mono}>{"{{用户输入}}"}</code>、
              <code className={shellStyles.mono}>{"{{用户输入分镜脚本}}"}</code>、
              <code className={shellStyles.mono}>{"{{用户输入绘画风格}}"}</code>
              与
              <code className={shellStyles.mono}>{"{{用户输入分镜剧本}}"}</code>
              ）；双占位符模式（如动漫分镜）在作图页为左右两个框，说明写在框内灰色提示文字里。「自由模式」不使用模版，此处无可编辑项。
            </p>
          </div>
        </div>
      </div>

      {templateModes.map((mode) => (
        <div key={mode.id} className={shellStyles.card}>
          <div className={shellStyles.cardHead}>
            <div>
              <h2 className={shellStyles.cardTitle}>{mode.label}</h2>
              <p className={shellStyles.cardSubtitle}>保存后对作图页该模式生效。</p>
            </div>
          </div>

          <textarea
            className={[shellStyles.textarea, shellStyles.mono, styles.promptArea].join(" ")}
            value={value.prompts[mode.id] ?? ""}
            onChange={(e) =>
              onChange({
                ...value,
                prompts: { ...value.prompts, [mode.id]: e.target.value },
              })
            }
          />
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
