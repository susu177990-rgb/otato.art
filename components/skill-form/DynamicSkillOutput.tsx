"use client";

import { useCallback, useState } from "react";
import shellStyles from "@/app/shared/shell.module.css";
import { ChatMarkdown } from "@/components/chat/ChatMarkdown";
import { MarkdownOutputViewer } from "@/components/skill-form/widgets/MarkdownOutputViewer";
import type { SkillFormRunResult, SkillJsonSchema } from "@/lib/chat/types";
import styles from "./skill-form.module.css";

type OutputProperty = {
  title?: string;
  ui_component?: string;
};

const DEFAULT_OUTPUT_ORDER = [
  "master_prompt_markdown",
  "master_prompt",
  "confirmation_action",
  "generated_image_url",
  "image_error",
  "error",
];

const OUTPUT_VALUE_ALIASES: Record<string, (result: SkillFormRunResult) => string | undefined> = {
  master_prompt_markdown: (result) => result.master_prompt_markdown ?? result.master_prompt,
  master_prompt: (result) => result.master_prompt ?? result.master_prompt_markdown,
  generated_image_url: (result) => result.generated_image_url,
  image_error: (result) => result.error,
  error: (result) => result.error,
};

function readOutputString(result: SkillFormRunResult, key: string): string | undefined {
  const resolver = OUTPUT_VALUE_ALIASES[key];
  const value = resolver ? resolver(result) : result[key as keyof SkillFormRunResult];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function ImageViewer({ url, title }: { url: string; title?: string }) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = useCallback(async () => {
    setDownloading(true);
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const ext = blob.type.includes("png") ? "png" : blob.type.includes("webp") ? "webp" : "jpg";
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `generated-${Date.now()}.${ext}`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(objectUrl);
    } catch {
      // 静默失败：降级为在新标签页打开
      window.open(url, "_blank", "noopener,noreferrer");
    } finally {
      setDownloading(false);
    }
  }, [url]);

  return (
    <section className={styles.outputBlock}>
      {title ? <h4 className={styles.outputBlockTitle}>{title}</h4> : null}
      <a href={url} target="_blank" rel="noopener noreferrer" className={styles.imageLink}>
        <img src={url} alt={title || "生成结果"} className={styles.outputImage} />
      </a>
      <button
        type="button"
        className={[shellStyles.dockTextLink, styles.downloadLink].join(" ")}
        onClick={() => void handleDownload()}
        disabled={downloading}
      >
        {downloading ? "下载中…" : "下载图片"}
      </button>
    </section>
  );
}

export function DynamicSkillOutput({
  outputSchema,
  result,
  emptyHint,
  onAction,
  actionLoading,
}: {
  outputSchema?: SkillJsonSchema | null;
  result: SkillFormRunResult | null;
  emptyHint?: string;
  onAction?: () => void;
  actionLoading?: boolean;
}) {
  if (!result) {
    return (
      <div className={styles.outputEmpty}>
        {emptyHint ? <ChatMarkdown markdown={emptyHint} variant="guide" /> : <p>填写表单并提交后，结果将显示在这里。</p>}
      </div>
    );
  }

  const properties = (outputSchema?.properties ?? {}) as Record<string, OutputProperty>;
  const outputKeys = Array.from(new Set([...DEFAULT_OUTPUT_ORDER, ...Object.keys(properties)]));

  return (
    <div className={styles.outputWrap}>
      {outputKeys.map((key) => {
        const prop = properties[key] ?? {};
        const title =
          prop.title ||
          (key === "confirmation_action"
            ? "确认生图操作"
            : key === "generated_image_url"
              ? "故事板图片输出"
              : key === "master_prompt_markdown" || key === "master_prompt"
                ? "Prompt 输出"
                : key);
        if (prop.ui_component === "action_button") {
          if (!result.confirmation_action || result.generated_image_url || !onAction) return null;
          return (
            <section key={key} className={styles.outputBlock}>
              <button
                type="button"
                className={[shellStyles.button, shellStyles.buttonPrimary].join(" ")}
                onClick={onAction}
                disabled={actionLoading}
              >
                {actionLoading ? "生图中…" : result.confirmation_action.label || title}
              </button>
            </section>
          );
        }
        if (key === "confirmation_action") {
          if (!result.confirmation_action || result.generated_image_url || !onAction) return null;
          return (
            <section key={key} className={styles.outputBlock}>
              <button
                type="button"
                className={[shellStyles.button, shellStyles.buttonPrimary].join(" ")}
                onClick={onAction}
                disabled={actionLoading}
              >
                {actionLoading ? "生图中…" : result.confirmation_action.label || "确认生图"}
              </button>
            </section>
          );
        }

        const value = readOutputString(result, key);
        if (!value) return null;
        if (key === "master_prompt" && readOutputString(result, "master_prompt_markdown")) return null;

        if (prop.ui_component === "markdown_viewer") {
          return <MarkdownOutputViewer key={key} title={title} value={value} />;
        }
        if (key === "master_prompt_markdown" || key === "master_prompt") {
          return <MarkdownOutputViewer key={key} title={title} value={value} />;
        }

        if (prop.ui_component === "image_viewer") {
          return <ImageViewer key={key} url={value} title={title} />;
        }
        if (key === "generated_image_url") {
          return <ImageViewer key={key} url={value} title={title} />;
        }

        return (
          <section key={key} className={styles.outputBlock}>
            <h4 className={styles.outputBlockTitle}>{title}</h4>
            <pre className={styles.rawOutput}>{value}</pre>
          </section>
        );
      })}
    </div>
  );
}
