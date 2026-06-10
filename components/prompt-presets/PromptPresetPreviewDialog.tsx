"use client";

import { useState } from "react";
import styles from "./prompt-preset-preview.module.css";

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
}

export function PromptPresetPreviewDialog({
  eyebrow = "预设提示词",
  title,
  prompt,
  onClose,
}: {
  eyebrow?: string;
  title: string;
  prompt: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const text = prompt || "（当前提示词为空）";

  return (
    <div className={styles.root} role="dialog" aria-modal="true" aria-label="查看提示词">
      <button type="button" className={styles.backdrop} onClick={onClose} aria-label="关闭提示词窗口" />
      <section className={styles.panel}>
        <header className={styles.head}>
          <div>
            <p className={styles.eyebrow}>{eyebrow}</p>
            <h2 className={styles.title}>{title}</h2>
          </div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="关闭">
            ×
          </button>
        </header>
        <pre className={styles.body}>{text}</pre>
        <footer className={styles.actions}>
          <button
            type="button"
            className={styles.copy}
            onClick={() => {
              void copyText(text).then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1400);
              });
            }}
          >
            {copied ? "已复制" : "复制全部"}
          </button>
        </footer>
      </section>
    </div>
  );
}
