"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useRef, type ChangeEvent } from "react";
import shellStyles from "../shared/shell.module.css";
import styles from "./wattpad-page.module.css";

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
  const [zhIntro, setZhIntro] = useState("");
  const [zhIntroBusy, setZhIntroBusy] = useState(false);
  const [zhIntroErr, setZhIntroErr] = useState<string | null>(null);
  const cookieRef = useRef<HTMLInputElement>(null);
  const [cookieName, setCookieName] = useState("");

  const appendLog = useCallback((line: string) => {
    setLogLines((prev) => [...prev, localizeLogLine(line)]);
  }, []);

  const stories = useMemo(() => payload?.stories ?? [], [payload?.stories]);

  const previewStory = useMemo(() => {
    if (!stories.length) return null;
    const indices = [...selected].sort((a, b) => a - b);
    const idx = indices.length ? indices[0] : 0;
    return stories[idx] ?? null;
  }, [stories, selected]);
  const previewStoryDescription = previewStory?.description?.trim() ?? "";

  useEffect(() => {
    if (!previewStory) {
      setZhIntro("");
      setZhIntroErr(null);
      setZhIntroBusy(false);
      return;
    }
    if (!previewStoryDescription) {
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
            body: JSON.stringify({ text: previewStoryDescription }),
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
  }, [previewStory, previewStoryDescription]);

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
    <main className={shellStyles.page}>
      <header className={shellStyles.topbar}>
        <div className={shellStyles.topbarLeft}>
          <Link href="/" className={[shellStyles.plainDockText, shellStyles.dockTextLink].join(" ")}>
            返回首页
          </Link>
          <div className={shellStyles.topbarTagline}>
            <p className={shellStyles.plainDockText}>扒网文 · Wattpad 搜索与导出</p>
          </div>
        </div>
      </header>

      <div className={styles.body}>
        <form
          className={[shellStyles.card, styles.searchCard].join(" ")}
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy) void runSearch();
          }}
        >
          <label className={shellStyles.field}>
            <span className={shellStyles.fieldLabel}>关键词</span>
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className={shellStyles.input}
              placeholder="输入英文或中文关键词"
              enterKeyHint="search"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className={[shellStyles.button, shellStyles.buttonPrimary].join(" ")}
          >
            {busy ? "搜索中…" : "搜索"}
          </button>
          <div className={styles.searchOptions}>
            <label className={styles.optionRow}>
              最多
              <input
                type="number"
                min={1}
                max={200}
                value={maxResults}
                onChange={(e) => setMaxResults(Number(e.target.value) || 20)}
                className={[shellStyles.input, shellStyles.inputCompact, styles.numField].join(" ")}
              />
            </label>
            <label className={shellStyles.checkboxRow}>
              <input type="checkbox" checked={includeMature} onChange={(e) => setIncludeMature(e.target.checked)} />
              成熟
            </label>
            <label className={shellStyles.checkboxRow}>
              <input type="checkbox" checked={includePaywalled} onChange={(e) => setIncludePaywalled(e.target.checked)} />
              付费
            </label>
          </div>
        </form>

        <div className={styles.split}>
          <div className={[shellStyles.card, styles.tableCard].join(" ")}>
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.tdCheck}>选</th>
                    <th className={styles.tdIdx}>#</th>
                    <th>标题</th>
                    <th>作者</th>
                    <th className={styles.tdNum}>阅读</th>
                    <th className={styles.tdNum}>票</th>
                    <th className={styles.tdNumNarrow}>章</th>
                    <th className={styles.tdNumNarrow}>类</th>
                  </tr>
                </thead>
                <tbody>
                  {stories.map((story, i) => (
                    <tr
                      key={`${story.id ?? i}-${i}`}
                      className={selected.has(i) ? styles.rowActive : ""}
                      onClick={() => handleTableRowClick(i)}
                    >
                      <td className={styles.tdCheck} onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={selected.has(i)} onChange={(e) => toggleRow(i, e)} />
                      </td>
                      <td className={styles.tdIdx}>{i + 1}</td>
                      <td className={styles.tdMain} title={story.title}>
                        {shorten(story.title, 42)}
                      </td>
                      <td className={styles.tdSub} title={story.author}>
                        {shorten(story.author, 18)}
                      </td>
                      <td className={styles.tdNum}>{formatNumber(story.readCount)}</td>
                      <td className={styles.tdNum}>{formatNumber(story.voteCount)}</td>
                      <td className={styles.tdNumNarrow}>{formatNumber(story.numParts)}</td>
                      <td className={styles.tdNumNarrow}>{typeText(story)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {stories.length === 0 && (
                <p className={styles.tableEmpty}>暂无结果，输入关键词后点击「搜索」</p>
              )}
            </div>
            <div className={styles.tableActions}>
              <button
                type="button"
                disabled={exportBusy || busy || !stories.length || selected.size === 0}
                onClick={() => openExport()}
                className={[shellStyles.button, shellStyles.buttonPrimary].join(" ")}
                style={{ flex: 1 }}
              >
                导出
              </button>
              <button
                type="button"
                disabled={selected.size === 0}
                onClick={() => void copyUrls()}
                className={shellStyles.button}
              >
                复制链接
              </button>
            </div>
          </div>

          <div className={[shellStyles.card, styles.previewCard].join(" ")}>
            <h2 className={shellStyles.cardTitle}>预览</h2>
            <div className={styles.previewScroll}>
              {!previewStory ? (
                <span style={{ color: "#52525b" }}>—</span>
              ) : (
                <>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#fafafa" }}>{previewStory.title}</p>
                  <p style={{ margin: "4px 0 0", color: "#71717a" }}>作者：{previewStory.author}</p>
                  <dl style={{ margin: "12px 0 0", display: "flex", flexDirection: "column", gap: 4 }}>
                    <div>
                      <span className={styles.previewKey}>阅读</span>
                      <span className={styles.previewVal}>：{formatNumber(previewStory.readCount)}</span>
                    </div>
                    <div>
                      <span className={styles.previewKey}>投票</span>
                      <span className={styles.previewVal}>：{formatNumber(previewStory.voteCount)}</span>
                    </div>
                    <div>
                      <span className={styles.previewKey}>评论</span>
                      <span className={styles.previewVal}>：{formatNumber(previewStory.commentCount)}</span>
                    </div>
                    <div>
                      <span className={styles.previewKey}>章节</span>
                      <span className={styles.previewVal}>：{formatNumber(previewStory.numParts)}</span>
                    </div>
                    <div>
                      <span className={styles.previewKey}>状态</span>
                      <span className={styles.previewVal}>：{statusText(previewStory)}</span>
                    </div>
                    <div>
                      <span className={styles.previewKey}>类型</span>
                      <span className={styles.previewVal}>：{typeText(previewStory)}</span>
                    </div>
                    <div>
                      <span className={styles.previewKey}>级别</span>
                      <span className={styles.previewVal}>：{maturityText(previewStory)}</span>
                    </div>
                    <div>
                      <span className={styles.previewKey}>更新</span>
                      <span className={styles.previewVal}>：{previewStory.lastPublishedPart || "—"}</span>
                    </div>
                    <div>
                      <span className={styles.previewKey}>链接</span>
                      <span className={styles.previewLink}>：{previewStory.url}</span>
                    </div>
                    <div>
                      <span className={styles.previewKey}>标签</span>
                      <span className={styles.previewVal}>：{previewStory.tags.length ? previewStory.tags.join("、") : "—"}</span>
                    </div>
                  </dl>
                  <p className={styles.previewKey} style={{ marginTop: 14 }}>
                    简介
                  </p>
                  <p className={styles.previewVal}>{previewStory.description || "—"}</p>
                  <p className={styles.previewKey} style={{ marginTop: 14 }}>
                    中文简介
                  </p>
                  <p className={shellStyles.helpText}>机器翻译，仅供参考</p>
                  {!previewStory.description?.trim() ? (
                    <p style={{ margin: "4px 0 0", color: "#71717a" }}>—</p>
                  ) : zhIntroBusy ? (
                    <p style={{ margin: "4px 0 0", color: "#71717a" }}>翻译中…</p>
                  ) : zhIntroErr ? (
                    <p style={{ margin: "4px 0 0", color: "#fca5a5" }}>{zhIntroErr}</p>
                  ) : (
                    <p className={styles.previewVal} style={{ margin: "4px 0 0", whiteSpace: "pre-wrap" }}>
                      {zhIntro || "—"}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <div className={[shellStyles.card, styles.logCard].join(" ")}>
          <div className={styles.logHead}>
            <div className={styles.statusBadge}>{statusLine || " "}</div>
            <button type="button" onClick={clearLog} className={shellStyles.buttonSubtle}>
              清空
            </button>
          </div>
          <div className={styles.logBody}>
            {logLines.length === 0 ? (
              <span style={{ color: "#52525b" }}>日志输出…</span>
            ) : (
              logLines.map((line, i) => <div key={i}>{line}</div>)
            )}
          </div>
        </div>
      </div>

      {exportOpen && (
        <div className={styles.modalBackdrop} role="dialog" onClick={() => setExportOpen(false)}>
          <div className={[shellStyles.card, styles.modalCard].join(" ")} onClick={(e) => e.stopPropagation()}>
            <p className={styles.modalCount}>{[...selected].filter((i) => stories[i]).length} 本</p>
            <p className={shellStyles.helpText}>
              将逐本请求并下载为 .txt（正文与原先 Markdown 导出一致，仅扩展名与 MIME 为文本文件）
            </p>
            <ul className={styles.modalList}>
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
              <div>
                <p className={[shellStyles.banner, shellStyles.bannerWarn].join(" ")}>
                  选中含付费作品：请上传作者本人账号导出的 Cookie 文件
                </p>
                <input
                  ref={cookieRef}
                  type="file"
                  accept=".txt,.json"
                  className={[shellStyles.input, shellStyles.inputCompact].join(" ")}
                  style={{ marginTop: 8 }}
                  onChange={(e) => setCookieName(e.target.files?.[0]?.name ?? "")}
                />
                {cookieName ? <p className={shellStyles.helpText}>{cookieName}</p> : null}
              </div>
            )}
            <div className={styles.modalActions}>
              <button type="button" onClick={() => setExportOpen(false)} className={shellStyles.button}>
                取消
              </button>
              <button
                type="button"
                disabled={exportBusy}
                onClick={() => void runExport()}
                className={[shellStyles.button, shellStyles.buttonPrimary].join(" ")}
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
