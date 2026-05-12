"use client";

import ReactMarkdown from "react-markdown";
import { REMARK_PLUGINS_GFM } from "@/lib/markdown-remark-plugins";
import type { Artifact } from "@/lib/types";

interface Props {
  artifact: Artifact;
  compact?: boolean;
}

export default function ArtifactCard({ artifact, compact }: Props) {
  const time = new Date(artifact.updatedAt).toLocaleString("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/40">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5">
        <span className={`font-medium text-zinc-300 ${compact ? "text-[11px]" : "text-xs"}`}>
          {artifact.label}
        </span>
        <span className="text-[9px] text-zinc-600">{time}</span>
      </div>

      {/* Scrollable content */}
      <div
        className={`overflow-y-auto border-t border-zinc-800/40 px-3 py-2 ${
          compact ? "max-h-36" : "max-h-48"
        }`}
      >
        <div className="max-w-full overflow-x-auto">
          <div className="prose prose-xs prose-invert max-w-none text-[11px] leading-relaxed prose-p:my-0.5 prose-headings:my-1 prose-headings:text-xs prose-li:my-0 prose-table:text-[11px] prose-th:px-2 prose-th:py-1 prose-td:px-2 prose-td:py-1 prose-pre:bg-zinc-950 prose-pre:text-[10px]">
            <ReactMarkdown remarkPlugins={REMARK_PLUGINS_GFM}>{artifact.content}</ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  );
}
