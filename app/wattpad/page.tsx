
"use client";

import Link from "next/link";
import ApiSettingsToolbarButton from "@/components/ApiSettingsToolbarButton";
import { useCallback, useEffect, useMemo, useState, useRef, type ChangeEvent } from "react";

type Story = {
  id?: string | number | null;
  title: string;
  author: string;
  description: string;
  readCount: number;
  voteCount: number;
  commentCount: number;
  numParts: number;
  completed: boolean;
  mature: boolean;
  isPaywalled: boolean;
  url: string;
  tags: string[];
  lastPublishedPart?: string | null;
};

type SearchPayload = {
  keyword: string;
  total: number;
  returned: number;
  stories: Story[];
};

/** 与 Wattpad 搜索 API 分页请求条数一致，固定即可 */
const WATTPAD_SEARCH_PAGE_SIZE = 50;

function shorten(text: string, maxLen: number) {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + "…";
}

function formatNumber(value: number | null | undefined) {
  return `${Number(value || 0).toLocaleString("en-US")}`;
}

function typeText(story: Story) {
  return story.isPaywalled ? "付费" : "免费";
}

function statusText(story: Story) {
  return story.completed ? "已完结" : "连载中";
}

function maturityText(story: Story) {
  return story.mature ? "成熟内容" : "普通";
}

function localizeLogLine(line: string) {
  if (!line) return line;
  const direct: Record<string, string> = {
    "JSON: ": "JSON 文件：",
    "CSV: ": "CSV 文件：",
    "Metadata: ": "元数据：",
    "English HTML: ": "英文 HTML：",
    "English DOCX: ": "英文 DOCX：",
    "Chinese HTML: ": "中文 HTML：",
    "Chinese DOCX: ": "中文 DOCX：",
    "ZIP: ": "ZIP 压缩包：",
  };
  for (const [k, v] of Object.entries(direct)) {
    if (line.startsWith(k)) return v + line.slice(k.length);
  }
  return line;
}

function storyFromUnknown(raw: unknown): Story {
  const s = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const tags = Array.isArray(s.tags) ? (s.tags as unknown[]).map(String) : [];
  return {
    id: s.id as string | number | undefined,
    title: String(s.title ?? ""),
    author: String(s.author ?? ""),
    description: String(s.description ?? ""),
    readCount: Number(s.readCount ?? 0),
    voteCount: Number(s.voteCount ?? 0),
    commentCount: Number(s.commentCount ?? 0),
    numParts: Number(s.numParts ?? 0),
    completed: Boolean(s.completed),
    mature: Boolean(s.mature),
    isPaywalled: Boolean(s.isPaywalled),
    url: String(s.url ?? ""),
    tags,
    lastPublishedPart: (s.lastPublishedPart as string) ?? null,
  };
}

export default function WattpadPage() {
  const [keyword, setKeyword] = useState("");
  const [maxResults, setMaxResults] = useState(20);
  const [includeMature, setIncludeMature] = useState(false);
  const [includePaywalled, setIncludePaywalled] = useState(false);

  const [payload, setPayload] = useState<SearchPayload | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [statusLine, setStatusLine] = useState("");

  const [exportOpen, setExportOpen] = useState(false);
  /** 预览区「中文简介」：仅译简介，与导出勾选无关 */
  const [zhIntro, setZhIntro] = useState("");
  const [zhIntroBusy, setZhIntroBusy] = useState(false);
  const [zhIntroErr, setZhIntroErr] = useState<string | null>(null);
  const cookieRef = useRef<HTMLInputElement>(null);
  const [cookieName, setCookieName] = useState("");

  const appendLog = useCallback((line: string) => {
    setLogLines((prev) => [...prev, localizeLogLine(line)]);
  }, []);

  const stories = payload?.stories ?? [];

  const previewStory = useMemo(() => {
    if (!stories.length) return null;
    const indices = [...selected].sort((a, b) => a - b);
    const idx = indices.length ? indices[0] : 0;
    return stories[idx] ?? null;
  }, [stories, selected]);

  useEffect(() => {
    if (!previewStory) {
      setZhIntro("");
      setZhIntroErr(null);
      setZhIntroBusy(false);
      return;
    }
    const desc = previewStory.description?.trim() ?? "";
    if (!desc) {
      setZhIntro("");
      setZhIntroErr(null);
      setZhIntroBusy(false);
      return;
    }
    setZhIntro("");
    setZhIntroErr(null);
    const ac = new AbortController();
    const tid = window.setTimeout(() => {
      void (async () => {
        setZhIntroBusy(true);
        setZhIntroErr(null);
        try {
          const res = await fetch("/api/wattpad/translate-synopsis", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: desc }),
            signal: ac.signal,
          });
          const raw = await res.text();
          if (!res.ok) {
            let msg = raw.slice(0, 400);
            try {
              const j = JSON.parse(raw) as { detail?: unknown; error?: string };
              if (j.error) msg = j.error;
              else if (typeof j.detail === "string") msg = j.detail;
            } catch {
              /* keep slice */
            }
            if (!ac.signal.aborted) {
              setZhIntro("");
              setZhIntroErr(msg || "翻译失败");
            }
            return;
          }
          const data = JSON.parse(raw) as { translated?: string };
          if (!ac.signal.aborted) {
            setZhIntro(typeof data.translated === "string" ? data.translated : "");
          }
        } catch (e) {
          if (e instanceof DOMException && e.name === "AbortError") return;
          if (!ac.signal.aborted) {
            setZhIntro("");
            setZhIntroErr(e instanceof Error ? e.message : String(e));
          }
        } finally {
          if (!ac.signal.aborted) setZhIntroBusy(false);
        }
      })();
    }, 400);
    return () => {
      window.clearTimeout(tid);
      ac.abort();
    };
  }, [previewStory?.url, previewStory?.description]);

  const toggleRow = (index: number, ev: ChangeEvent<HTMLInputElement>) => {
    ev.stopPropagation();
    const checked = ev.target.checked;
    setSelected(checked ? new Set([index]) : new Set());
  };

  function handleTableRowClick(index: number) {
    setSelected((prev) => {
      if (prev.size === 1 && prev.has(index)) return new Set();
      return new Set([index]);
    });
  }

  const copyUrls = async () => {
    const ordered = [...selected].sort((a, b) => a - b);
    const urls = ordered.map((i) => stories[i]?.url).filter(Boolean).join("\n");
    if (!urls) return;
    await navigator.clipboard.writeText(urls);
    appendLog("已复制选中作品链接到剪贴板");
  };

  const runSearch = async () => {
    const kw = keyword.trim();
    if (!kw) return;
    setBusy(true);
    setStatusLine("");
    try {
      const res = await fetch("/api/wattpad/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword: kw,
          maxResults,
          pageSize: WATTPAD_SEARCH_PAGE_SIZE,
          includeMature,
          includePaywalled,
        }),
        signal: AbortSignal.timeout(130_000),
      });
      const text = await res.text();
      if (!res.ok) {
        try {
          const err = JSON.parse(text) as { error?: string; code?: string; hint?: string };
          appendLog(
            `搜索失败：${err.error || text}${err.code ? `（${err.code}）` : ""}${err.hint ? ` — ${err.hint}` : ""}`
          );
        } catch {
          appendLog(`搜索失败：${text.slice(0, 500)}`);
        }
        return;
      }
      const raw = JSON.parse(text) as Record<string, unknown>;
      const list = Array.isArray(raw.stories) ? raw.stories.map(storyFromUnknown) : [];
      const nextPayload: SearchPayload = {
        keyword: String(raw.keyword ?? kw),
        total: Number(raw.total ?? 0),
        returned: Number(raw.returned ?? list.length),
        stories: list,
      };
      setPayload(nextPayload);
      const sel = new Set<number>();
      if (list.length) sel.add(0);
      setSelected(sel);
      setStatusLine(`${nextPayload.returned}/${nextPayload.total}`);
      appendLog(`关键词：${kw}`);
      appendLog(`匹配总数：${formatNumber(nextPayload.total)}`);
      appendLog(`当前返回：${formatNumber(nextPayload.returned)}`);
    } catch (e) {
      const dom = e instanceof DOMException ? e : null;
      const timedOut =
        dom?.name === "TimeoutError" ||
        dom?.name === "AbortError" ||
        (e instanceof Error && /aborted|timeout/i.test(e.message));
      if (timedOut) {
        appendLog("搜索超时或中断（约 130 秒）：请检查 Wattpad API / 网络，或重启 API 后再试");
      } else {
        appendLog(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setBusy(false);
    }
  };

  const openExport = () => {
    const ordered = [...selected].sort((a, b) => a - b);
    const chosen = ordered.map((i) => stories[i]).filter(Boolean);
    if (!chosen.length) return;
    setExportOpen(true);
    setCookieName("");
    if (cookieRef.current) cookieRef.current.value = "";
  };

  const appendDecodedExportLog = (logB64: string | null) => {
    if (!logB64) return;
    try {
      const bin = atob(logB64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const logText = new TextDecoder("utf-8").decode(bytes);
      logText.split("\n").forEach((l) => l && appendLog(localizeLogLine(l)));
    } catch {
      appendLog("(日志解码失败)");
    }
  };

  const runExport = async () => {
    const ordered = [...selected].sort((a, b) => a - b);
    const chosen = ordered.map((i) => stories[i]).filter(Boolean);
    if (!chosen.length) return;
    const anyPaywalled = chosen.some((s) => s.isPaywalled);
    const file = cookieRef.current?.files?.[0];
    if (anyPaywalled && (!file || file.size === 0)) {
      appendLog("导出失败：含付费作品时需上传 Cookie 文件");
      return;
    }
    setExportBusy(true);
    setExportOpen(false);
    appendLog(`开始导出（${chosen.length} 本，逐本请求）…`);
    try {
      let ok = 0;
      for (let i = 0; i < chosen.length; i++) {
        const story = chosen[i];
        appendLog(`── 第 ${i + 1}/${chosen.length} 本 ──`);
        const fd = new FormData();
        fd.append(
          "payload",
          JSON.stringify({
            story,
            keyword: keyword.trim() || "batch",
          })
        );
        if (file && file.size > 0) fd.append("cookies", file);
        const res = await fetch("/api/wattpad/export-markdown-one", { method: "POST", body: fd });
        appendDecodedExportLog(res.headers.get("x-wattpad-log-b64"));
        if (!res.ok) {
          const t = await res.text();
          appendLog(`导出失败（第 ${i + 1} 本）：${t.slice(0, 800)}`);
          break;
        }
        const one = (await res.json()) as { filename?: string; content?: string };
        const raw = (one.filename?.trim() || "story.txt").replace(/[/\\]/g, "-");
        const low = raw.toLowerCase();
        const name = low.endsWith(".txt")
          ? raw
          : low.endsWith(".md")
            ? `${raw.slice(0, -3)}.txt`
            : `${raw}.txt`;
        const blob = new Blob([one.content ?? ""], { type: "text/plain;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = name;
        a.click();
        URL.revokeObjectURL(a.href);
        ok += 1;
        if (i < chosen.length - 1) {
          await new Promise((r) => setTimeout(r, 500));
        }
      }
      appendLog(`导出结束：成功 ${ok}/${chosen.length} 本`);
      setStatusLine(ok === chosen.length ? `${ok} 个 .txt` : `${ok}/${chosen.length} 本`);
    } catch (e) {
      appendLog(e instanceof Error ? e.message : String(e));
    } finally {
      setExportBusy(false);
    }
  };

  const clearLog = () => setLogLines([]);

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-zinc-950 text-zinc-200">
      <header className="shrink-0 border-b border-zinc-800 bg-indigo-950/40 px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-zinc-50">扒网文</h1>
            <p className="text-[11px] text-zinc-400">Wattpad 搜索与批量导出（请遵守版权与平台条款）</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <ApiSettingsToolbarButton />
            <Link
              href="/"
              className="rounded-lg border border-zinc-600/80 px-3 py-1.5 text-xs text-zinc-300 transition hover:border-zinc-500 hover:bg-zinc-900/60"
            >
              ← 模式选择
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col gap-3 overflow-hidden px-4 py-4 sm:px-6">
        <div className="shrink-0 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 sm:p-4">
          <form
            className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              if (!busy) void runSearch();
            }}
          >
            <label className="block text-xs text-zinc-500">
              关键词
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                placeholder="输入英文或中文关键词"
                enterKeyHint="search"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-indigo-500 disabled:opacity-50"
            >
              {busy ? "搜索中…" : "搜索"}
            </button>
          </form>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-zinc-400">
            <label className="inline-flex items-center gap-1">
              最多
              <input
                type="number"
                min={1}
                max={200}
                value={maxResults}
                onChange={(e) => setMaxResults(Number(e.target.value) || 20)}
                className="w-16 rounded border border-zinc-700 bg-zinc-950 px-1 py-0.5 text-zinc-200"
              />
            </label>
            <label className="inline-flex items-center gap-1.5">
              <input type="checkbox" checked={includeMature} onChange={(e) => setIncludeMature(e.target.checked)} />
              成熟
            </label>
            <label className="inline-flex items-center gap-1.5">
              <input type="checkbox" checked={includePaywalled} onChange={(e) => setIncludePaywalled(e.target.checked)} />
              付费
            </label>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
          <div className="grid min-h-0 flex-[3] gap-3 overflow-hidden lg:grid-cols-[3fr_2fr]">
          <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/30">
            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
              <table className="w-full min-w-0 table-fixed border-collapse text-left text-xs">
                <thead className="sticky top-0 z-10 bg-zinc-800/95 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                  <tr>
                    <th className="w-10 px-1 py-2 text-center font-normal normal-case text-zinc-500">选</th>
                    <th className="w-10 px-1 py-2">#</th>
                    <th className="min-w-0 px-2 py-2">标题</th>
                    <th className="min-w-0 px-2 py-2">作者</th>
                    <th className="w-24 px-2 py-2 text-right">阅读</th>
                    <th className="w-20 px-2 py-2 text-right">票</th>
                    <th className="w-14 px-2 py-2 text-center">章</th>
                    <th className="w-14 px-2 py-2 text-center">类</th>
                  </tr>
                </thead>
                <tbody className="text-zinc-200">
                  {stories.map((story, i) => (
                    <tr
                      key={`${story.id ?? i}-${i}`}
                      className={`border-t border-zinc-800/80 ${selected.has(i) ? "bg-indigo-950/35" : "hover:bg-zinc-800/40"} cursor-pointer`}
                      onClick={() => handleTableRowClick(i)}
                    >
                      <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={selected.has(i)} onChange={(e) => toggleRow(i, e)} />
                      </td>
                      <td className="px-1 py-2 text-center text-zinc-500">{i + 1}</td>
                      <td className="min-w-0 truncate px-2 py-2 font-medium text-zinc-100" title={story.title}>
                        {shorten(story.title, 42)}
                      </td>
                      <td className="min-w-0 truncate px-2 py-2 text-zinc-400" title={story.author}>
                        {shorten(story.author, 18)}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums text-zinc-400">{formatNumber(story.readCount)}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums text-zinc-400">{formatNumber(story.voteCount)}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-center tabular-nums text-zinc-400">{formatNumber(story.numParts)}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-center text-zinc-400">{typeText(story)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {stories.length === 0 && (
                <p className="p-6 text-center text-xs text-zinc-600">暂无结果，输入关键词后点击「搜索」</p>
              )}
            </div>
            <div className="flex shrink-0 flex-wrap gap-2 border-t border-zinc-800 p-2">
              <button
                type="button"
                disabled={exportBusy || busy || !stories.length || selected.size === 0}
                onClick={() => openExport()}
                className="flex-1 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
              >
                导出
              </button>
              <button
                type="button"
                disabled={selected.size === 0}
                onClick={() => void copyUrls()}
                className="rounded-lg border border-zinc-600 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
              >
                复制链接
              </button>
            </div>
          </div>

          <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/20 p-3">
            <h2 className="shrink-0 text-xs font-semibold text-zinc-300">预览</h2>
            <div className="mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain text-xs leading-relaxed text-zinc-400">
              {!previewStory ? (
                <span className="text-zinc-600">—</span>
              ) : (
                <>
                  <p className="text-sm font-semibold text-zinc-100">{previewStory.title}</p>
                  <p className="mt-1 text-zinc-500">作者：{previewStory.author}</p>
                  <dl className="mt-3 space-y-1">
                    <div>
                      <dt className="inline text-amber-700/90">阅读</dt>
                      <dd className="inline text-zinc-300">：{formatNumber(previewStory.readCount)}</dd>
                    </div>
                    <div>
                      <dt className="inline text-amber-700/90">投票</dt>
                      <dd className="inline text-zinc-300">：{formatNumber(previewStory.voteCount)}</dd>
                    </div>
                    <div>
                      <dt className="inline text-amber-700/90">评论</dt>
                      <dd className="inline text-zinc-300">：{formatNumber(previewStory.commentCount)}</dd>
                    </div>
                    <div>
                      <dt className="inline text-amber-700/90">章节</dt>
                      <dd className="inline text-zinc-300">：{formatNumber(previewStory.numParts)}</dd>
                    </div>
                    <div>
                      <dt className="inline text-amber-700/90">状态</dt>
                      <dd className="inline text-zinc-300">：{statusText(previewStory)}</dd>
                    </div>
                    <div>
                      <dt className="inline text-amber-700/90">类型</dt>
                      <dd className="inline text-zinc-300">：{typeText(previewStory)}</dd>
                    </div>
                    <div>
                      <dt className="inline text-amber-700/90">级别</dt>
                      <dd className="inline text-zinc-300">：{maturityText(previewStory)}</dd>
                    </div>
                    <div>
                      <dt className="inline text-amber-700/90">更新</dt>
                      <dd className="inline text-zinc-300">：{previewStory.lastPublishedPart || "—"}</dd>
                    </div>
                    <div>
                      <dt className="inline text-amber-700/90">链接</dt>
                      <dd className="inline break-all text-indigo-400/90">{previewStory.url}</dd>
                    </div>
                    <div>
                      <dt className="inline text-amber-700/90">标签</dt>
                      <dd className="inline text-zinc-300">：{previewStory.tags.length ? previewStory.tags.join("、") : "—"}</dd>
                    </div>
                  </dl>
                  <p className="mt-3 text-amber-700/90">简介</p>
                  <p className="text-zinc-300">{previewStory.description || "—"}</p>
                  <p className="mt-4 text-amber-700/90">中文简介</p>
                  <p className="text-[10px] text-zinc-600">机器翻译，仅供参考</p>
                  {!previewStory.description?.trim() ? (
                    <p className="mt-1 text-zinc-500">—</p>
                  ) : zhIntroBusy ? (
                    <p className="mt-1 text-zinc-500">翻译中…</p>
                  ) : zhIntroErr ? (
                    <p className="mt-1 text-rose-400/90">{zhIntroErr}</p>
                  ) : (
                    <p className="mt-1 whitespace-pre-wrap text-zinc-300">{zhIntro || "—"}</p>
                  )}
                </>
              )}
            </div>
          </div>
          </div>

          <div className="flex min-h-0 flex-[2] flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/80">
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-800 px-3 py-2">
              <div className="min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 text-xs text-zinc-400">
                {statusLine || " "}
              </div>
              <button type="button" onClick={clearLog} className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800">
                清空
              </button>
            </div>
            <div className="mx-3 mb-3 min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain rounded-lg border border-zinc-800 bg-[#0c1219] px-3 py-2 font-mono text-[11px] leading-relaxed text-sky-100/90">
              {logLines.length === 0 ? (
                <span className="text-zinc-600">日志输出…</span>
              ) : (
                logLines.map((line, i) => (
                  <div key={i} className="whitespace-pre-wrap break-all">
                    {line}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {exportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog">
          <div className="w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900 p-4 shadow-xl">
            <p className="text-lg font-semibold text-zinc-100">{[...selected].filter((i) => stories[i]).length}</p>
            <p className="mt-1 text-xs text-zinc-500">
              将逐本请求并下载为 .txt（正文与原先 Markdown 导出一致，仅扩展名与 MIME 为文本文件）
            </p>
            <ul className="mt-3 max-h-40 overflow-y-auto rounded border border-zinc-800 bg-zinc-950/80 p-2 text-xs text-zinc-300">
              {[...selected]
                .sort((a, b) => a - b)
                .map((i) => stories[i])
                .filter(Boolean)
                .map((s, idx) => (
                  <li key={idx}>
                    {idx + 1}. {s.title}
                  </li>
                ))}
            </ul>
            {[...selected].some((i) => stories[i]?.isPaywalled) && (
              <div className="mt-3">
                <p className="text-[11px] text-amber-400/95">选中含付费作品：请上传作者本人账号导出的 Cookie 文件</p>
                <input
                  ref={cookieRef}
                  type="file"
                  accept=".txt,.json"
                  className="mt-2 w-full text-xs text-zinc-400"
                  onChange={(e) => setCookieName(e.target.files?.[0]?.name ?? "")}
                />
                {cookieName ? <p className="mt-1 text-[10px] text-zinc-500">{cookieName}</p> : null}
              </div>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setExportOpen(false)} className="rounded-lg border border-zinc-600 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800">
                取消
              </button>
              <button
                type="button"
                disabled={exportBusy}
                onClick={() => void runExport()}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
