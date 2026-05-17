"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { REMARK_PLUGINS_GFM } from "@/lib/markdown-remark-plugins";
import shellStyles from "@/app/shared/shell.module.css";
import styles from "./artifact-slot-editor.module.css";

interface Props {
  label: string;
  /** 当前已保存的正文（无则为空串） */
  value: string;
  placeholder?: string;
  optional?: boolean;
  /** 提交纯文本；空串表示正文为空（条目仍保留，删除请用槽位「移除」） */
  onCommit: (markdown: string) => void;
  rows?: number;
  compact?: boolean;
  /** 内容区高度（预览与编辑共用，如长文槽位 min-h） */
  textareaClassName?: string;
  /** 提供时在与「编辑」同一行右侧显示红色「移除」按钮（样式与编辑一致） */
  onRemove?: () => void;
  /** 移除按钮文案，默认「移除」 */
  removeLabel?: string;
}

const DEBOUNCE_MS = 550;

const previewProse =
  "prose prose-xs prose-invert max-w-none text-[11px] leading-relaxed prose-p:my-0.5 prose-headings:my-1 prose-headings:text-xs prose-li:my-0 prose-table:text-[11px] prose-th:px-2 prose-th:py-1 prose-td:px-2 prose-td:py-1 prose-pre:bg-zinc-950 prose-pre:text-[10px] prose-pre:border prose-pre:border-zinc-700";

export default function ArtifactSlotEditor({
  label,
  value,
  placeholder,
  optional,
  onCommit,
  rows = 6,
  compact,
  textareaClassName,
  onRemove,
  removeLabel = "移除",
}: Props) {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSent = useRef(value);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setDraft(value);
    lastSent.current = value;
  }, [value]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (editing) {
      textareaRef.current?.focus();
    }
  }, [editing]);

  function scheduleCommit(next: string) {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (next === lastSent.current) return;
      lastSent.current = next;
      onCommit(next);
    }, DEBOUNCE_MS);
  }

  function flush() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (draft !== lastSent.current) {
      lastSent.current = draft;
      onCommit(draft);
    }
  }

  function handleDone() {
    flush();
    setEditing(false);
  }

  const shellCls = [styles.shell, compact ? styles.shellCompact : ""]
    .filter(Boolean)
    .join(" ");
  const contentShellCls = [styles.contentShell, textareaClassName ?? ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={shellCls}>
      <div className={styles.head}>
        <span className={[styles.label, compact ? styles.labelCompact : ""].join(" ")}>
          {label}
        </span>
        <div className={styles.headActions}>
          {optional ? <span className={styles.optionalTag}>可选</span> : null}
          <button
            type="button"
            onClick={() => (editing ? handleDone() : setEditing(true))}
            className={[shellStyles.button, shellStyles.buttonSubtle, styles.miniButton].join(" ")}
          >
            {editing ? "完成" : "编辑"}
          </button>
          {onRemove ? (
            <button
              type="button"
              onClick={onRemove}
              className={[styles.miniButton, styles.removeButton].join(" ")}
            >
              {removeLabel}
            </button>
          ) : null}
        </div>
      </div>
      <div className={styles.body}>
        {editing ? (
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => {
              const v = e.target.value;
              setDraft(v);
              scheduleCommit(v);
            }}
            onBlur={flush}
            placeholder={placeholder ?? "（空）Markdown 正文；关闭「完成」前会自动保存"}
            rows={compact ? Math.min(rows, 5) : rows}
            className={[shellStyles.textarea, shellStyles.mono, contentShellCls].join(" ")}
            style={{ width: "100%", resize: "vertical", fontSize: 11 }}
          />
        ) : (
          <div className={[styles.preview, contentShellCls].join(" ")}>
            {draft.trim() ? (
              <div className={previewProse}>
                <ReactMarkdown remarkPlugins={REMARK_PLUGINS_GFM}>{draft}</ReactMarkdown>
              </div>
            ) : (
              <p className={styles.emptyText}>
                （空）点击「编辑」填写；正文为 Markdown，可从左侧复制助手输出后粘贴编辑
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
