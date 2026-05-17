"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import shellStyles from "../shared/shell.module.css";
import styles from "./settings-page.module.css";
import type { Settings } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/types";
import { MODEL_QUICK_OPTIONS, normalizeModel } from "@/lib/model-presets";
import { SETTINGS_STORAGE_KEY, loadSettings as loadScriptSettings } from "@/components/SettingsDialog";
import {
  DEFAULT_IMAGE_SETTINGS,
  IMAGE_MODEL_ORDER,
  REAL_CHARACTER_ASSET_PROMPT,
  type ImageWorkspaceSettings,
} from "@/lib/image-workspace";
import { loadImageSettings, saveImageSettings } from "@/lib/image-storage";

type Tab = "scriptApi" | "imagePrompts" | "imageApi";

const TAB_DEFS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: "scriptApi", label: "编剧 API" },
  { id: "imagePrompts", label: "生图 提示词" },
  { id: "imageApi", label: "生图 API" },
];

function saveScriptSettings(s: Settings) {
  const next = { ...s, model: normalizeModel(s.model) };
  if (typeof window !== "undefined") {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
  }
  return next;
}

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("scriptApi");
  const [scriptSettings, setScriptSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [imageSettings, setImageSettings] = useState<ImageWorkspaceSettings>(DEFAULT_IMAGE_SETTINGS);
  const [savedMessage, setSavedMessage] = useState("");

  useEffect(() => {
    setScriptSettings(loadScriptSettings());
    setImageSettings(loadImageSettings());
  }, []);

  function saveAll() {
    saveScriptSettings(scriptSettings);
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

          {tab === "scriptApi" ? (
            <ScriptApiPanel value={scriptSettings} onChange={setScriptSettings} />
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

function ScriptApiPanel({
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
            <h2 className={shellStyles.cardTitle}>编剧 API（剧本 Agent）</h2>
            <p className={shellStyles.cardSubtitle}>对应原「API 设置」弹窗。空着保存即恢复默认网关。</p>
          </div>
          <button
            type="button"
            className={shellStyles.buttonSubtle}
            onClick={() =>
              onChange({
                ...DEFAULT_SETTINGS,
                model: normalizeModel(DEFAULT_SETTINGS.model),
              })
            }
          >
            恢复默认
          </button>
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
            <select
              className={shellStyles.select}
              value={normalizeModel(value.model)}
              onChange={(e) => onChange({ ...value, model: e.target.value })}
            >
              {MODEL_QUICK_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
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
  return (
    <section className={styles.panel}>
      <div className={shellStyles.card}>
        <div className={shellStyles.cardHead}>
          <div>
            <h2 className={shellStyles.cardTitle}>真实角色资产 · 固定提示词</h2>
            <p className={shellStyles.cardSubtitle}>
              保留 <code className={shellStyles.mono}>{"{{用户输入}}"}</code> 占位符；生成时会替换为输入框中的角色设定。
              「自由模式」不走该模版，仅发送输入框全文。
            </p>
          </div>
          <button
            type="button"
            className={shellStyles.buttonSubtle}
            onClick={() =>
              onChange({
                ...value,
                prompts: { ...value.prompts, "real-character-asset": REAL_CHARACTER_ASSET_PROMPT },
              })
            }
          >
            恢复默认提示词
          </button>
        </div>

        <textarea
          className={[shellStyles.textarea, shellStyles.mono, styles.promptArea].join(" ")}
          value={value.prompts["real-character-asset"]}
          onChange={(e) =>
            onChange({
              ...value,
              prompts: { ...value.prompts, "real-character-asset": e.target.value },
            })
          }
        />
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
