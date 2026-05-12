"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { REMARK_PLUGINS_GFM } from "@/lib/markdown-remark-plugins";

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

  const contentShell = `rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 ${textareaClassName ?? ""}`;

  return (
    <div
      className={`rounded-lg border border-zinc-800/60 bg-zinc-900/40 ${
        compact ? "text-[11px]" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-1.5">
        <span className={`min-w-0 font-medium text-zinc-300 ${compact ? "text-[11px]" : "text-xs"}`}>
          {label}
        </span>
        <div className="flex shrink-0 items-center gap-1.5">
          {optional ? <span className="text-[9px] text-zinc-600">可选</span> : null}
          <button
            type="button"
            onClick={() => (editing ? handleDone() : setEditing(true))}
            className="rounded border border-zinc-600/80 px-1.5 py-0.5 text-[9px] font-medium text-zinc-400 transition hover:border-indigo-500/60 hover:bg-zinc-800/80 hover:text-zinc-100"
          >
            {editing ? "完成" : "编辑"}
          </button>
          {onRemove ? (
            <button
              type="button"
              onClick={onRemove}
              className="rounded border border-rose-600/80 px-1.5 py-0.5 text-[9px] font-medium text-rose-400 transition hover:border-rose-500/60 hover:bg-rose-950/50 hover:text-rose-100"
            >
              {removeLabel}
            </button>
          ) : null}
        </div>
      </div>
      <div className="border-t border-zinc-800/40 px-3 py-2">
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
            className={`w-full resize-y font-mono text-[11px] leading-relaxed text-zinc-200 placeholder:text-zinc-600 focus:border-indigo-600/60 focus:outline-none focus:ring-1 focus:ring-indigo-600/40 ${contentShell}`}
          />
        ) : (
          <div className={`overflow-y-auto ${contentShell}`}>
            {draft.trim() ? (
              <div className="max-w-full overflow-x-auto">
                <div className={previewProse}>
                  <ReactMarkdown remarkPlugins={REMARK_PLUGINS_GFM}>{draft}</ReactMarkdown>
                </div>
              </div>
            ) : (
              <p className="text-[11px] leading-relaxed text-zinc-600">
                （空）点击「编辑」填写；正文为 Markdown，可从左侧复制助手输出后粘贴编辑
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
