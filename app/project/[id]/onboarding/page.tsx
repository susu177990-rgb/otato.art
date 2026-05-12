"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { nanoid } from "nanoid";
import type {
  AdaptationPhase,
  Message,
  OriginMode,
  Project,
  ProjectMeta,
  SourceMaterial,
} from "@/lib/types";
import { useApiSettings } from "@/components/ApiSettingsProvider";
import ApiSettingsToolbarButton from "@/components/ApiSettingsToolbarButton";
import PlanningChatPanel from "@/components/PlanningChatPanel";
import { buildAdaptationDiscussBootstrap, buildPlanningBootstrap } from "@/lib/planning-bootstrap";
import {
  SOURCE_MATERIALS_MAX_CHARS,
  assertSourceMaterialsWithinLimit,
  totalSourceChars,
} from "@/lib/source-materials";
import {
  downloadCreativeBriefMarkdownFile,
  downloadSeriesBibleMarkdownFile,
} from "@/lib/export-artifacts";
import { parseCreativeBriefToProjectMeta } from "@/lib/creative-brief-meta-parse";
import { extractCreativeBriefDocument } from "@/lib/creative-brief-extract";

function normalizeMeta(p: Project): ProjectMeta {
  const m = p.meta;
  return {
    seriesTitle: m?.seriesTitle ?? p.name ?? "",
    episodeCount: m?.episodeCount ?? "",
    episodeDurationMinutes: m?.episodeDurationMinutes ?? null,
    targetMarket: m?.targetMarket ?? "",
    dialogueLanguage: m?.dialogueLanguage ?? "",
    extraNotes: m?.extraNotes ?? "",
  };
}

function effectiveAdaptPhase(p: Project): AdaptationPhase {
  if ((p.originMode ?? "original") !== "adaptation") return "idle";
  return p.adaptationPhase ?? "upload";
}

export default function OnboardingPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<Project | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [originTab, setOriginTab] = useState<OriginMode>("original");
  const [adaptPhase, setAdaptPhase] = useState<AdaptationPhase>("idle");

  const [meta, setMeta] = useState<ProjectMeta>({
    seriesTitle: "",
    episodeCount: "",
    episodeDurationMinutes: null,
    targetMarket: "",
    dialogueLanguage: "",
    extraNotes: "",
  });
  const [materials, setMaterials] = useState<SourceMaterial[]>([]);
  const [planningMessages, setPlanningMessages] = useState<Message[]>([]);
  const [adaptationMessages, setAdaptationMessages] = useState<Message[]>([]);
  const { settings, openSettings } = useApiSettings();
  const [pasteLabel, setPasteLabel] = useState("");
  const [pasteBody, setPasteBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [briefOpen, setBriefOpen] = useState(false);
  const [briefDraft, setBriefDraft] = useState("");
  const [creativeBrief, setCreativeBrief] = useState("");
  /** 立项页可编辑的系列圣经草稿，与编剧室侧栏同源字段 */
  const [seriesBibleDraft, setSeriesBibleDraft] = useState("");
  /** 英语 Locale 简报草稿，与编剧室「英语简报」同源 */
  const [englishLocaleBriefDraft, setEnglishLocaleBriefDraft] = useState("");
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [generatingBible, setGeneratingBible] = useState(false);
  const [generatingLocaleBrief, setGeneratingLocaleBrief] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const adaptationMessagesRef = useRef<Message[]>([]);

  useEffect(() => {
    adaptationMessagesRef.current = adaptationMessages;
  }, [adaptationMessages]);

  const planningBootstrap = useMemo(() => buildPlanningBootstrap(meta, materials), [meta, materials]);

  const adaptationDiscussBootstrap = useMemo(
    () => buildAdaptationDiscussBootstrap(project?.sourceAnalysis, materials),
    [project?.sourceAnalysis, materials]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${id}`);
      if (!res.ok) {
        setProject(null);
        return;
      }
      const p: Project = await res.json();
      setProject(p);
      setMeta(normalizeMeta(p));
      setMaterials(p.sourceMaterials ?? []);
      setPlanningMessages(p.planningMessages ?? []);
      setAdaptationMessages(p.adaptationMessages ?? []);
      setCreativeBrief(p.creativeBrief ?? "");
      setSeriesBibleDraft(p.seriesBible ?? "");
      setEnglishLocaleBriefDraft(p.englishLocaleBrief ?? "");
      const om: OriginMode = p.originMode ?? "original";
      setOriginTab(om);
      let nextAdapt = effectiveAdaptPhase(p);
      if (
        om === "adaptation" &&
        p.adaptationPhase === "planner" &&
        (p.creativeBrief ?? "").trim().length > 0
      ) {
        nextAdapt = "meta";
      }
      setAdaptPhase(nextAdapt);
      const st = p.onboardingStatus ?? "ready";
      if (om === "original" && (st === "planning" || st === "ready")) setStep(2);
      else if (om === "original") setStep(1);
    } catch {
      setProject(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const runGenerateSeriesBible = useCallback(
    async (opts?: {
      replaceExisting?: boolean;
      creativeBriefOverride?: string;
    }): Promise<Project> => {
    if (!settings.apiKey) {
      throw new Error("请先配置 API Key");
    }
    const res = await fetch("/api/onboarding/generate-series-bible", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: id,
        settings,
        replaceExisting: opts?.replaceExisting,
        creativeBriefOverride: opts?.creativeBriefOverride,
      }),
    });
    const data = (await res.json()) as { error?: string; project?: Project };
    if (res.status === 409) {
      const r2 = await fetch(`/api/projects/${id}`);
      if (r2.ok) {
        const p2 = (await r2.json()) as Project;
        if ((p2.seriesBible ?? "").trim()) return p2;
      }
    }
    if (!res.ok) throw new Error(data.error || res.statusText);
    const merged = data.project;
    if (!merged || !(merged.seriesBible ?? "").trim()) {
      throw new Error("未返回系列圣经");
    }
    return merged;
  },
  [id, settings]
);

  async function handleGenerateBibleFromReadyBar() {
    if (!settings.apiKey) {
      openSettings();
      return;
    }
    setGeneratingBible(true);
    try {
      const p = await runGenerateSeriesBible();
      setProject(p);
    } catch (e) {
      alert(e instanceof Error ? e.message : "生成系列圣经失败");
    } finally {
      setGeneratingBible(false);
    }
  }

  function updateMeta<K extends keyof ProjectMeta>(key: K, value: ProjectMeta[K]) {
    setMeta((m) => ({ ...m, [key]: value }));
  }

  function requestOriginTab(next: OriginMode) {
    if (next === originTab) return;
    const serverMode = project?.originMode ?? "original";
    if (serverMode === "adaptation" && next === "original") {
      const hasProgress =
        (project?.sourceAnalysis?.trim()?.length ?? 0) > 0 ||
        (adaptationMessages?.length ?? 0) > 0 ||
        (planningMessages?.length ?? 0) > 0;
      if (hasProgress && !confirm("已保存为改编立项。切换到原创将仅影响本页向导展示，已存数据仍保留在项目内。继续？")) {
        return;
      }
    }
    setOriginTab(next);
  }

  function addMaterial(mat: SourceMaterial) {
    const { ok, total } = assertSourceMaterialsWithinLimit(materials, mat.text.length);
    if (!ok) {
      alert(`素材总字数将超过上限（${SOURCE_MATERIALS_MAX_CHARS}），当前约 ${total} 字。`);
      return false;
    }
    setMaterials((prev) => [...prev, mat]);
    return true;
  }

  function removeMaterial(mid: string) {
    setMaterials((prev) => prev.filter((m) => m.id !== mid));
  }

  function handleAddPaste() {
    const text = pasteBody.trim();
    if (!text) {
      alert("请先粘贴正文");
      return;
    }
    const label = pasteLabel.trim() || `粘贴 ${new Date().toLocaleString()}`;
    const mat: SourceMaterial = {
      id: nanoid(10),
      kind: "paste",
      label,
      text,
      createdAt: new Date().toISOString(),
    };
    if (addMaterial(mat)) {
      setPasteBody("");
      setPasteLabel("");
    }
  }

  async function handleFile(files: FileList | null) {
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      const lower = file.name.toLowerCase();
      let text = "";
      let kind: SourceMaterial["kind"] = "txt";
      if (lower.endsWith(".docx")) {
        kind = "docx";
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/parse-docx", { method: "POST", body: fd });
        const data = (await res.json()) as { text?: string; error?: string };
        if (!res.ok) {
          alert(data.error || "docx 解析失败");
          continue;
        }
        text = data.text ?? "";
      } else if (lower.endsWith(".pdf") || file.type === "application/pdf") {
        kind = "pdf";
        try {
          const fd = new FormData();
          fd.append("file", file);
          const res = await fetch("/api/parse-pdf", { method: "POST", body: fd });
          let data: { text?: string; error?: string };
          try {
            data = (await res.json()) as { text?: string; error?: string };
          } catch {
            alert("PDF 解析失败：服务未返回有效数据，请重试或换一份文件。");
            continue;
          }
          if (!res.ok) {
            alert(data.error || "PDF 解析失败");
            continue;
          }
          text = data.text ?? "";
          if (!text.trim()) {
            alert("该 PDF 未提取到文字，可能是扫描版/纯图片。请使用可复制文字的 PDF，或粘贴文字。");
            continue;
          }
        } catch (e) {
          alert(e instanceof Error ? e.message : "上传或解析 PDF 失败，请重试。");
          continue;
        }
      } else if (lower.endsWith(".md") || lower.endsWith(".markdown") || file.type === "text/markdown") {
        kind = "md";
        text = await file.text();
      } else if (lower.endsWith(".txt") || file.type === "text/plain") {
        kind = "txt";
        text = await file.text();
      } else {
        alert("不支持的文件格式，请使用 .txt、.md、.docx 或 .pdf。");
        continue;
      }
      const mat: SourceMaterial = {
        id: nanoid(10),
        kind,
        label: file.name,
        text,
        createdAt: new Date().toISOString(),
      };
      if (!addMaterial(mat)) break;
    }
  }

  async function handleSaveStep1() {
    if (!meta.seriesTitle.trim()) {
      alert("请填写剧名");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: meta.seriesTitle.trim(),
          meta: { ...meta, seriesTitle: meta.seriesTitle.trim() },
          sourceMaterials: materials,
          onboardingStatus: "planning",
          originMode: "original",
        }),
      });
      if (!res.ok) throw new Error("保存失败");
      const p: Project = await res.json();
      setProject(p);
      setOriginTab("original");
      setStep(2);
    } catch (e) {
      alert(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  const persistPlanning = useCallback(
    async (msgs: Message[]) => {
      try {
        await fetch(`/api/projects/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planningMessages: msgs }),
        });
      } catch {
        // ignore
      }
    },
    [id]
  );

  const persistAdaptation = useCallback(
    async (msgs: Message[]) => {
      try {
        await fetch(`/api/projects/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ adaptationMessages: msgs }),
        });
      } catch {
        // ignore
      }
    },
    [id]
  );

  function handlePlanningAssistantDone(_full: string, snapshot: Message[]) {
    void persistPlanning(snapshot);
  }

  function handleAdaptationAssistantDone(_full: string, snapshot: Message[]) {
    void persistAdaptation(snapshot);
  }

  function openBriefModalOriginal() {
    const lastAssistant = [...planningMessages].reverse().find((m) => m.role === "assistant");
    const lastRaw = (lastAssistant?.content ?? "").trim();
    const extracted = lastRaw ? extractCreativeBriefDocument(lastRaw).trim() : "";
    setBriefDraft(extracted || lastRaw || project?.creativeBrief?.trim() || "");
    setSeriesBibleDraft(project?.seriesBible ?? "");
    setEnglishLocaleBriefDraft(project?.englishLocaleBrief ?? "");
    setBriefOpen(true);
  }

  async function handleGenerateLocaleBriefInOnboarding(creativeBriefSource: string) {
    const briefNorm = (extractCreativeBriefDocument(creativeBriefSource) || creativeBriefSource).trim();
    if (!briefNorm) {
      alert("请先填写《创作思路确认书》正文，供简报参照。");
      return;
    }
    if (!seriesBibleDraft.trim()) {
      alert("请先填写或生成《系列圣经》正文，再生成简报。");
      return;
    }
    if (!settings.apiKey) {
      openSettings();
      return;
    }
    setGeneratingLocaleBrief(true);
    try {
      const res = await fetch("/api/locale-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: id,
          settings,
          creativeBriefOverride: briefNorm,
          seriesBibleOverride: seriesBibleDraft.trim(),
        }),
      });
      const data = (await res.json()) as { markdown?: string; error?: string };
      if (!res.ok) throw new Error(data.error || res.statusText);
      if (data.markdown) setEnglishLocaleBriefDraft(data.markdown);
    } catch (e) {
      alert(e instanceof Error ? e.message : "生成简报失败");
    } finally {
      setGeneratingLocaleBrief(false);
    }
  }

  async function handleLlmFillSeriesBibleInForm(briefForLlm: string) {
    const brief = briefForLlm.trim();
    if (!brief) {
      alert("请先填写《创作思路确认书》正文");
      return;
    }
    if (!settings.apiKey) {
      openSettings();
      return;
    }
    const hasBible = !!(seriesBibleDraft.trim() || (project?.seriesBible ?? "").trim());
    setGeneratingBible(true);
    try {
      const p = await runGenerateSeriesBible({
        replaceExisting: hasBible,
        creativeBriefOverride: brief,
      });
      setProject(p);
      setSeriesBibleDraft(p.seriesBible ?? "");
    } catch (e) {
      alert(e instanceof Error ? e.message : "生成系列圣经失败");
    } finally {
      setGeneratingBible(false);
    }
  }

  async function handleSaveBibleManualFromReadyBar() {
    const t = seriesBibleDraft.trim();
    if (!t) {
      alert("请填写或粘贴系列圣经正文");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seriesBible: t }),
      });
      if (!res.ok) throw new Error("保存失败");
      const p: Project = await res.json();
      setProject(p);
      setSeriesBibleDraft(p.seriesBible ?? "");
    } catch (e) {
      alert(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  function handleAutoFillMetaFromCreativeBrief() {
    const brief = creativeBrief.trim();
    if (!brief) {
      alert("请先填写或保留《创作思路确认书》正文");
      return;
    }
    const fallback = project?.name?.trim() || meta.seriesTitle?.trim() || "未命名项目";
    const { meta: parsed, warnings } = parseCreativeBriefToProjectMeta(brief, fallback);
    setMeta(parsed);
    if (warnings.length) {
      alert(`${warnings.join("\n")}\n\n请核对上方立项字段；若缺节可在确认书文末补上「## 立项字段（系统自动识别）」及键值行。`);
    }
  }

  async function handleFinishOnboardingOriginal() {
    const briefRaw = briefDraft.trim();
    const brief =
      extractCreativeBriefDocument(briefRaw) || briefRaw;
    if (!brief) {
      alert("请填写或粘贴《创作思路确认书》正文");
      return;
    }
    if (!settings.apiKey) {
      openSettings();
      return;
    }
    const bibleSave = seriesBibleDraft.trim();
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creativeBrief: brief,
          onboardingStatus: "ready",
          planningMessages,
          meta,
          sourceMaterials: materials,
          name: meta.seriesTitle.trim() || project?.name,
          originMode: "original",
          ...(bibleSave ? { seriesBible: bibleSave } : {}),
          ...(englishLocaleBriefDraft.trim() ? { englishLocaleBrief: englishLocaleBriefDraft.trim() } : {}),
        }),
      });
      if (!res.ok) throw new Error("保存失败");
      const saved: Project = await res.json();
      setBriefOpen(false);
      setProject(saved);
      setSeriesBibleDraft(saved.seriesBible ?? seriesBibleDraft);
      setEnglishLocaleBriefDraft(saved.englishLocaleBrief ?? englishLocaleBriefDraft);

      if ((saved.seriesBible ?? "").trim()) {
        alert("已保存立项与系列圣经。请从 STAGE 1 剧情梗概开始。");
        router.push(`/studio/${id}`);
        return;
      }

      setGeneratingBible(true);
      try {
        const p = await runGenerateSeriesBible({ creativeBriefOverride: brief });
        setProject(p);
        setSeriesBibleDraft(p.seriesBible ?? "");
      } catch (e) {
        alert(
          e instanceof Error
            ? `${e.message}（立项已保存，请在本页补全系列圣经或点击「生成系列圣经」后再进入编剧室）`
            : "生成系列圣经失败"
        );
        await load();
        return;
      } finally {
        setGeneratingBible(false);
      }
      alert("系列圣经已生成。请从 STAGE 1 剧情梗概开始。");
      router.push(`/studio/${id}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveMaterialsAndAnalyze() {
    if (!materials.length) {
      alert("请先上传或粘贴至少一份原文");
      return;
    }
    if (!settings.apiKey) {
      openSettings();
      return;
    }
    setSaving(true);
    setAnalyzing(true);
    try {
      const put = await fetch(`/api/projects/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceMaterials: materials,
          originMode: "adaptation",
          adaptationPhase: "upload",
          onboardingStatus: "planning",
        }),
      });
      if (!put.ok) throw new Error("保存素材失败");
      const res = await fetch("/api/onboarding/analyze-source", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: id, settings }),
      });
      const data = (await res.json()) as { error?: string; project?: Project };
      if (!res.ok) {
        alert(data.error || "分析失败");
        return;
      }
      if (data.project) setProject(data.project);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "分析失败");
    } finally {
      setSaving(false);
      setAnalyzing(false);
    }
  }

  async function putAdaptPhase(phase: AdaptationPhase) {
    const res = await fetch(`/api/projects/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adaptationPhase: phase }),
    });
    if (!res.ok) throw new Error("保存失败");
    const p: Project = await res.json();
    setProject(p);
    setAdaptPhase(phase);
  }

  async function handleEnterDiscuss() {
    setSaving(true);
    try {
      await putAdaptPhase("discuss");
    } catch (e) {
      alert(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerateAdaptPlan() {
    if (!settings.apiKey) {
      openSettings();
      return;
    }
    const latestDiscuss =
      adaptationMessages.length >= adaptationMessagesRef.current.length
        ? adaptationMessages
        : adaptationMessagesRef.current;
    setGeneratingPlan(true);
    try {
      const res = await fetch("/api/onboarding/generate-adaptation-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: id,
          settings,
          adaptationMessages: latestDiscuss,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        project?: Project;
        seriesBibleError?: string;
        localeBriefError?: string;
      };
      if (!res.ok) {
        alert(data.error || "生成失败");
        return;
      }
      if (data.project) {
        setProject(data.project);
        setCreativeBrief(data.project.creativeBrief ?? "");
        setSeriesBibleDraft(data.project.seriesBible ?? "");
        setEnglishLocaleBriefDraft(data.project.englishLocaleBrief ?? "");
        setPlanningMessages(data.project.planningMessages ?? []);
        setAdaptationMessages(data.project.adaptationMessages ?? latestDiscuss);
      }
      if (data.seriesBibleError) {
        alert(
          `《创作思路确认书》已保存。《系列圣经》自动生成未成功：${data.seriesBibleError}\n可在本页点击「用 LLM 根据确认书生成」补全圣经。`
        );
      }
      if (data.localeBriefError) {
        alert(
          `《创作思路确认书》与《系列圣经》已保存。英语 Locale 简报自动生成未成功：${data.localeBriefError}\n可在立项表单中点击「LLM 生成简报」重试。`
        );
      }
      setAdaptPhase("meta");
    } catch (e) {
      alert(e instanceof Error ? e.message : "生成失败");
    } finally {
      setGeneratingPlan(false);
    }
  }

  async function handleFinishAdaptMeta() {
    if (!meta.seriesTitle.trim()) {
      alert("请填写剧名");
      return;
    }
    if (!creativeBrief.trim()) {
      alert("规划正文为空，请填写或返回上一步重新生成");
      return;
    }
    if (!settings.apiKey) {
      openSettings();
      return;
    }
    const bibleSave = seriesBibleDraft.trim();
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: meta.seriesTitle.trim(),
          meta: { ...meta, seriesTitle: meta.seriesTitle.trim() },
          onboardingStatus: "ready",
          originMode: "adaptation",
          adaptationPhase: "ready",
          sourceMaterials: materials,
          planningMessages,
          adaptationMessages,
          creativeBrief: creativeBrief.trim(),
          ...(bibleSave ? { seriesBible: bibleSave } : {}),
          ...(englishLocaleBriefDraft.trim() ? { englishLocaleBrief: englishLocaleBriefDraft.trim() } : {}),
        }),
      });
      if (!res.ok) throw new Error("保存失败");
      const saved: Project = await res.json();
      setProject(saved);
      setSeriesBibleDraft(saved.seriesBible ?? seriesBibleDraft);
      setEnglishLocaleBriefDraft(saved.englishLocaleBrief ?? englishLocaleBriefDraft);

      if ((saved.seriesBible ?? "").trim()) {
        alert("已保存立项与系列圣经。请从 STAGE 1 剧情梗概开始。");
        router.push(`/studio/${id}`);
        return;
      }

      setGeneratingBible(true);
      try {
        const p = await runGenerateSeriesBible({
          creativeBriefOverride: creativeBrief.trim(),
        });
        setProject(p);
        setSeriesBibleDraft(p.seriesBible ?? "");
      } catch (e) {
        alert(
          e instanceof Error
            ? `${e.message}（立项已保存，请在本页补全系列圣经或点击「生成系列圣经」后再进入编剧室）`
            : "生成系列圣经失败"
        );
        await load();
        return;
      } finally {
        setGeneratingBible(false);
      }
      alert("系列圣经已生成。请从 STAGE 1 剧情梗概开始。");
      router.push(`/studio/${id}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-500">
        加载中…
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-950 text-zinc-400">
        <p>项目不存在</p>
        <Link href="/projects" className="text-indigo-400 hover:underline">
          返回项目列表
        </Link>
      </div>
    );
  }

  const totalChars = totalSourceChars(materials);
  const status = project.onboardingStatus ?? "ready";
  const serverMode = project.originMode ?? "original";
  const isAdaptationUi = originTab === "adaptation";
  /** 本地选了改编但尚未写入服务端时，仍显示「上传」步 */
  const phase: AdaptationPhase =
    isAdaptationUi && serverMode !== "adaptation" ? "upload" : isAdaptationUi ? adaptPhase : "idle";

  const materialsBlock = (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-zinc-500">
        <span>素材（上传 / 粘贴）</span>
        <span>
          约 {totalChars} / {SOURCE_MATERIALS_MAX_CHARS} 字
        </span>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,.md,.markdown,.docx,.pdf,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        multiple
        className="hidden"
        aria-hidden
        onChange={(e) => {
          void handleFile(e.target.files);
          e.target.value = "";
        }}
      />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-md shadow-indigo-900/40 transition hover:bg-indigo-500"
        >
          <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
            />
          </svg>
          选择文件上传
        </button>
        <span className="text-[11px] leading-snug text-zinc-500">
          支持 .txt、Markdown（.md）、Word（.docx）、PDF（.pdf），可多选；Word / PDF 在服务端转为纯文本后保存
        </span>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <input
          value={pasteLabel}
          onChange={(e) => setPasteLabel(e.target.value)}
          placeholder="粘贴素材标题（可选）"
          className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs sm:max-w-xs"
        />
        <button type="button" onClick={handleAddPaste} className="rounded bg-zinc-700 px-2 py-1.5 text-xs text-zinc-200">
          加入粘贴正文
        </button>
      </div>
      <textarea
        value={pasteBody}
        onChange={(e) => setPasteBody(e.target.value)}
        rows={5}
        placeholder="在此粘贴大纲、灵感或网文片段…"
        className="mt-2 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 font-mono text-[11px]"
      />
      <ul className="mt-2 space-y-1 text-[11px] text-zinc-500">
        {materials.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-2 rounded bg-zinc-900/80 px-2 py-1">
            <span className="truncate">
              {m.label} · {m.kind} · {m.text.length} 字
            </span>
            <button type="button" onClick={() => removeMaterial(m.id)} className="shrink-0 text-rose-400">
              删除
            </button>
          </li>
        ))}
      </ul>
    </div>
  );

  const metaForm = (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block text-xs">
        <span className="text-zinc-500">剧名</span>
        <input
          value={meta.seriesTitle}
          onChange={(e) => updateMeta("seriesTitle", e.target.value)}
          className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm"
          placeholder="必填"
        />
      </label>
      <label className="block text-xs">
        <span className="text-zinc-500">目标集数 / 区间</span>
        <input
          value={meta.episodeCount}
          onChange={(e) => updateMeta("episodeCount", e.target.value)}
          className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm"
          placeholder="如 60 或 30～45"
        />
      </label>
      <label className="block text-xs">
        <span className="text-zinc-500">单集时长（分钟）</span>
        <input
          type="number"
          min={0.5}
          step={0.5}
          value={meta.episodeDurationMinutes ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            updateMeta("episodeDurationMinutes", v === "" ? null : Number(v));
          }}
          className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm"
          placeholder="如 2"
        />
      </label>
      <label className="block text-xs">
        <span className="text-zinc-500">目标市场</span>
        <input
          value={meta.targetMarket}
          onChange={(e) => updateMeta("targetMarket", e.target.value)}
          className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm"
        />
      </label>
      <label className="block text-xs sm:col-span-2">
        <span className="text-zinc-500">台词语言</span>
        <input
          value={meta.dialogueLanguage}
          onChange={(e) => updateMeta("dialogueLanguage", e.target.value)}
          className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm"
          placeholder="如 中文 / 英文"
        />
      </label>
      <label className="block text-xs sm:col-span-2">
        <span className="text-zinc-500">备注</span>
        <textarea
          value={meta.extraNotes}
          onChange={(e) => updateMeta("extraNotes", e.target.value)}
          rows={2}
          className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm"
        />
      </label>
    </div>
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200">
      <header className="border-b border-zinc-800 px-4 py-3">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-sm font-semibold text-zinc-100">项目立项</h1>
            <p className="text-[11px] text-zinc-500">
              {isAdaptationUi ? "上传原文 → 分析 → 改编讨论 → 立项表单 → 编剧室" : "填写元数据与素材 → 策划对齐 → 进入编剧室"}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <ApiSettingsToolbarButton />
            <Link href="/projects" className="rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800">
              返回项目列表
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-zinc-500">模式</span>
          <div className="inline-flex rounded-lg border border-zinc-700 p-0.5">
            <button
              type="button"
              onClick={() => requestOriginTab("original")}
              className={`rounded-md px-3 py-1 text-xs ${
                originTab === "original" ? "bg-indigo-600 text-white" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              原创
            </button>
            <button
              type="button"
              onClick={() => requestOriginTab("adaptation")}
              className={`rounded-md px-3 py-1 text-xs ${
                originTab === "adaptation" ? "bg-indigo-600 text-white" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              改编
            </button>
          </div>
          {serverMode === "adaptation" && (
            <span className="text-[10px] text-zinc-600">（服务端已保存为改编）</span>
          )}
        </div>

        {status === "ready" && (
          <div className="mb-4 rounded-lg border border-emerald-900/60 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-200/90">
            {(project?.seriesBible ?? "").trim() ? (
              <>
                本项目已完成立项且已生成系列圣经。你可继续调整策划，或
                <Link href={`/studio/${id}`} className="ml-1 text-indigo-400 underline">
                  进入编剧室
                </Link>
                。
              </>
            ) : (
              <div className="space-y-2">
                <p>
                  立项已就绪，但尚缺系列圣经；须补全后才可进入编剧室。
                  {(project?.creativeBrief ?? "").trim() ? null : (
                    <span className="block text-amber-200/80">（缺少《创作思路确认书》，请回到对应步骤补全。）</span>
                  )}
                </p>
                <label className="block text-[11px] text-zinc-500">手填 / 粘贴系列圣经（与编剧室侧栏同源）</label>
                <textarea
                  value={seriesBibleDraft}
                  onChange={(e) => setSeriesBibleDraft(e.target.value)}
                  rows={8}
                  className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-2 font-mono text-[11px] leading-relaxed text-zinc-200"
                  placeholder="可直接粘贴 Markdown…"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={saving || !seriesBibleDraft.trim()}
                    onClick={() => void handleSaveBibleManualFromReadyBar()}
                    className="rounded-lg border border-zinc-600 px-3 py-1.5 text-[11px] text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
                  >
                    {saving ? "保存中…" : "保存手填圣经"}
                  </button>
                  {(project?.creativeBrief ?? "").trim() ? (
                    <button
                      type="button"
                      disabled={generatingBible || !settings.apiKey}
                      onClick={() => void handleGenerateBibleFromReadyBar()}
                      className="rounded-lg bg-indigo-600 px-3 py-1.5 text-[11px] font-medium text-white disabled:opacity-50"
                    >
                      {generatingBible ? "正在生成系列圣经…" : "用 LLM 生成系列圣经"}
                    </button>
                  ) : null}
                </div>
                {!settings.apiKey ? (
                  <button
                    type="button"
                    onClick={() => openSettings()}
                    className="ml-2 text-[11px] text-indigo-300 underline"
                  >
                    配置 API Key
                  </button>
                ) : null}
              </div>
            )}
          </div>
        )}

        {!isAdaptationUi && (
          <>
            <div className="mb-4 flex gap-2 text-xs">
              <span
                className={`rounded-full px-2 py-0.5 ${step === 1 ? "bg-indigo-600 text-white" : "bg-zinc-800 text-zinc-500"}`}
              >
                1 元数据与素材
              </span>
              <span className="text-zinc-600">→</span>
              <span
                className={`rounded-full px-2 py-0.5 ${step === 2 ? "bg-indigo-600 text-white" : "bg-zinc-800 text-zinc-500"}`}
              >
                2 策划对齐
              </span>
            </div>

            {step === 1 && (
              <div className="space-y-4">
                {metaForm}
                {materialsBlock}
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void handleSaveStep1()}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {saving ? "保存中…" : "保存并进入策划"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="rounded-lg border border-zinc-600 px-4 py-2 text-sm text-zinc-400"
                  >
                    已有保存：去策划
                  </button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="text-xs text-zinc-500 hover:text-zinc-300"
                >
                  ← 返回修改元数据与素材
                </button>
                <PlanningChatPanel
                  layout="fixedScroll"
                  settings={settings}
                  messages={planningMessages}
                  planningBootstrap={planningBootstrap}
                  onOpenSettings={() => openSettings()}
                  onMessagesChange={setPlanningMessages}
                  onAssistantDone={handlePlanningAssistantDone}
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={openBriefModalOriginal}
                    className="rounded-lg bg-emerald-800 px-4 py-2 text-sm text-emerald-100"
                  >
                    确认创作思路并进入编剧室
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {isAdaptationUi && (
          <div className="space-y-6">
            <p className="text-[10px] text-zinc-500">
              改编流程：上传 → 分析 → 讨论 → 立项表单
              {phase !== "idle" && phase !== "upload" && (
                <span className="ml-2 text-zinc-600">
                  （当前：{phase === "ready" ? "已完成" : phase}）
                </span>
              )}
            </p>

            {(phase === "idle" || phase === "upload") && (
              <div className="space-y-3">
                <p className="text-xs text-zinc-400">请先上传或粘贴待改编原文（至少一份）。保存后将调用模型做一次结构化分析。</p>
                {materialsBlock}
                <button
                  type="button"
                  disabled={saving || analyzing}
                  onClick={() => void handleSaveMaterialsAndAnalyze()}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {analyzing ? "分析中…" : saving ? "保存中…" : "保存原文并开始分析"}
                </button>
              </div>
            )}

            {phase === "analyzed" && (
              <div className="space-y-3">
                <h2 className="text-xs font-medium text-zinc-300">原文分析（只读）</h2>
                <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-lg border border-zinc-800 bg-zinc-900/80 p-3 text-[11px] leading-relaxed text-zinc-300">
                  {project.sourceAnalysis || "（无）"}
                </pre>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleEnterDiscuss()}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-50"
                >
                  进入改编讨论
                </button>
              </div>
            )}

            {phase === "discuss" && (
              <div className="space-y-3">
                <PlanningChatPanel
                  key="adapt-discuss"
                  layout="fixedScroll"
                  settings={settings}
                  messages={adaptationMessages}
                  planningBootstrap={adaptationDiscussBootstrap}
                  chatEndpoint="/api/adaptation-discuss"
                  onOpenSettings={() => openSettings()}
                  onMessagesChange={setAdaptationMessages}
                  onAssistantDone={handleAdaptationAssistantDone}
                  headerTitle="改编策略讨论（不产出 STAGE 模板正文）"
                  emptyHint="基于上文分析，讨论改编方向、体量与删留策略。"
                  inputPlaceholder="输入你的想法或追问…"
                />
                <button
                  type="button"
                  disabled={saving || generatingPlan}
                  onClick={() => void handleGenerateAdaptPlan()}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-50"
                >
                  {generatingPlan ? "正在生成…" : "下一步：生成确认书与系列圣经"}
                </button>
              </div>
            )}

            {phase === "planner" && !(project?.creativeBrief ?? "").trim() && (
              <div className="space-y-3 rounded-lg border border-amber-900/50 bg-amber-950/20 p-4 text-sm text-amber-100/90">
                <p className="text-xs leading-relaxed">
                  检测到旧版流程停留在「规划师对话」步骤且尚无规划正文。点击下方将按当前讨论记录自动生成规划并进入立项表单。
                </p>
                <button
                  type="button"
                  disabled={generatingPlan}
                  onClick={() => void handleGenerateAdaptPlan()}
                  className="rounded-lg bg-amber-700 px-4 py-2 text-sm text-white disabled:opacity-50"
                >
                  {generatingPlan ? "生成中…" : "一键生成确认书与圣经并进入立项表单"}
                </button>
              </div>
            )}

            {phase === "meta" && (
              <div className="space-y-4">
                <p className="text-xs text-zinc-400">
                  请确认或修改立项信息。确认书文末须有固定节「## 立项字段（系统自动识别）」及键值行；点击下方按钮将**本地解析**该节填入表单（不调用大模型、无需 API Key）。
                </p>
                <button
                  type="button"
                  disabled={!creativeBrief.trim()}
                  onClick={handleAutoFillMetaFromCreativeBrief}
                  className="rounded-lg border border-indigo-600/60 bg-indigo-950/40 px-3 py-2 text-xs font-medium text-indigo-100 hover:bg-indigo-900/50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  根据《创作思路确认书》自动填写立项表单
                </button>
                {metaForm}
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <label className="block text-xs text-zinc-500">
                      规划全文（《创作思路确认书》，可编辑）
                    </label>
                    <button
                      type="button"
                      disabled={!creativeBrief.trim()}
                      onClick={() =>
                        downloadCreativeBriefMarkdownFile(
                          project?.name?.trim() || meta.seriesTitle?.trim() || "未命名项目",
                          creativeBrief
                        )
                      }
                      className="shrink-0 rounded border border-zinc-600 px-2 py-0.5 text-[11px] text-zinc-300 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
                      title="仅下载为 .txt；正文与编辑区相同，仍为 Markdown"
                    >
                      导出 .txt
                    </button>
                  </div>
                  <textarea
                    value={creativeBrief}
                    onChange={(e) => setCreativeBrief(e.target.value)}
                    rows={14}
                    className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-2 font-mono text-[11px] leading-relaxed text-zinc-200"
                    placeholder="规划正文将显示在此…"
                  />
                </div>
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="block text-xs text-zinc-500">
                      系列圣经（SSOT，Markdown，可编辑）
                    </label>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={!seriesBibleDraft.trim()}
                        onClick={() =>
                          downloadSeriesBibleMarkdownFile(
                            project?.name?.trim() || meta.seriesTitle?.trim() || "未命名项目",
                            seriesBibleDraft
                          )
                        }
                        className="rounded border border-zinc-600 px-2 py-0.5 text-[11px] text-zinc-300 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
                        title="仅下载为 .txt；正文与编辑区相同，仍为 Markdown"
                      >
                        导出圣经 .txt
                      </button>
                      <button
                        type="button"
                        disabled={
                          generatingBible ||
                          generatingLocaleBrief ||
                          saving ||
                          !creativeBrief.trim() ||
                          !settings.apiKey
                        }
                        onClick={() => void handleLlmFillSeriesBibleInForm(creativeBrief)}
                        className="rounded border border-indigo-700 bg-indigo-950/50 px-2 py-0.5 text-[11px] text-indigo-200 transition hover:bg-indigo-900/40 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {generatingBible ? "生成中…" : "用 LLM 根据确认书生成"}
                      </button>
                    </div>
                  </div>
                  <p className="mt-1 text-[10px] leading-relaxed text-zinc-600">
                    与编剧室侧栏「系列圣经」为同一数据；可手打粘贴，也可用 LLM 生成后再改。若此处已有正文，保存时将直接采用，不再自动覆盖。
                  </p>
                  <textarea
                    value={seriesBibleDraft}
                    onChange={(e) => setSeriesBibleDraft(e.target.value)}
                    rows={12}
                    className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-2 font-mono text-[11px] leading-relaxed text-zinc-200"
                    placeholder="建议含一级标题「# 系列圣经与里程碑（SERIES_BIBLE）」…"
                  />
                </div>
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="block text-xs text-zinc-500">英语 Locale 简报（STAGE 7，可编辑）</label>
                    <button
                      type="button"
                      disabled={
                        generatingLocaleBrief ||
                        generatingBible ||
                        saving ||
                        !creativeBrief.trim() ||
                        !seriesBibleDraft.trim() ||
                        !settings.apiKey
                      }
                      onClick={() => void handleGenerateLocaleBriefInOnboarding(creativeBrief)}
                      className="rounded border border-indigo-700 bg-indigo-950/50 px-2 py-0.5 text-[11px] text-indigo-200 transition hover:bg-indigo-900/40 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {generatingLocaleBrief ? "生成中…" : "用 LLM 生成英语简报"}
                    </button>
                  </div>
                  <p className="mt-1 text-[10px] leading-relaxed text-zinc-600">
                    与编剧室「英语简报」同源；结合上方《创作思路确认书》与本区系列圣经正文，可先点生成再改。
                  </p>
                  <textarea
                    value={englishLocaleBriefDraft}
                    onChange={(e) => setEnglishLocaleBriefDraft(e.target.value)}
                    rows={8}
                    className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-2 font-mono text-[11px] leading-relaxed text-zinc-200"
                    placeholder="可选；也可进编剧室后在顶栏「英语简报」中生成。"
                  />
                </div>
                <button
                  type="button"
                  disabled={saving || generatingLocaleBrief}
                  onClick={() => void handleFinishAdaptMeta()}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {saving
                    ? generatingBible
                      ? "正在生成系列圣经…"
                      : generatingLocaleBrief
                        ? "正在生成简报…"
                        : "保存中…"
                    : "确认并进入编剧室"}
                </button>
              </div>
            )}

            {phase === "ready" && serverMode === "adaptation" && (
              <div className="space-y-2">
                <p className="text-xs text-zinc-500">改编立项已完成，请从顶部链接进入编剧室。</p>
                {(project?.creativeBrief ?? "").trim() ? (
                  <button
                    type="button"
                    onClick={() =>
                      downloadCreativeBriefMarkdownFile(
                        project?.name?.trim() || meta.seriesTitle?.trim() || "未命名项目",
                        (project?.creativeBrief ?? "").trim()
                      )
                    }
                    className="rounded border border-zinc-600 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
                    title="仅下载为 .txt；正文与立项稿相同，仍为 Markdown"
                  >
                    导出《创作思路确认书》.txt
                  </button>
                ) : null}
              </div>
            )}
          </div>
        )}
      </main>

      {briefOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => !saving && setBriefOpen(false)}
          role="presentation"
        >
          <div
            className="w-full max-w-2xl rounded-xl border border-zinc-700 bg-zinc-900 p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
          >
            <h2 className="mb-2 text-sm font-semibold text-zinc-100">保存立项文稿</h2>
            <p className="mb-2 text-[11px] text-zinc-500">
              确认书、系列圣经与英语 Locale 简报均可编辑。改编讨论后若已通过「下一步：生成确认书与系列圣经」进入本步，确认书、圣经与简报会一并尝试生成；若某步失败可在此用「LLM 生成圣经」或「LLM 生成简报」补全。保存时若圣经框为空，仍会尝试根据确认书自动生成后再进入编剧室（STAGE 1 起）。
            </p>
            <p className="mb-1 text-[10px] font-medium text-zinc-400">《创作思路确认书》</p>
            <textarea
              value={briefDraft}
              onChange={(e) => setBriefDraft(e.target.value)}
              rows={10}
              className="mb-3 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 font-mono text-[11px] leading-relaxed"
            />
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[10px] font-medium text-zinc-400">系列圣经（SSOT）</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!seriesBibleDraft.trim()}
                  onClick={() =>
                    downloadSeriesBibleMarkdownFile(
                      project?.name?.trim() || meta.seriesTitle?.trim() || "未命名项目",
                      seriesBibleDraft
                    )
                  }
                  className="rounded border border-zinc-600 px-2 py-0.5 text-[10px] text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
                  title="仅下载为 .txt；正文与编辑区相同，仍为 Markdown"
                >
                  导出圣经
                </button>
                <button
                  type="button"
                  disabled={generatingBible || generatingLocaleBrief || !briefDraft.trim() || !settings.apiKey}
                  onClick={() => void handleLlmFillSeriesBibleInForm(briefDraft)}
                  className="rounded border border-indigo-700 bg-indigo-950/50 px-2 py-0.5 text-[10px] text-indigo-200 disabled:opacity-40"
                >
                  {generatingBible ? "生成中…" : "LLM 生成圣经"}
                </button>
              </div>
            </div>
            <textarea
              value={seriesBibleDraft}
              onChange={(e) => setSeriesBibleDraft(e.target.value)}
              rows={8}
              className="mb-2 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 font-mono text-[11px] leading-relaxed"
              placeholder="可手填，或用「LLM 生成圣经」…"
            />
            <div className="mb-3">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[10px] font-medium text-zinc-400">英语 Locale 简报（STAGE 7）</p>
                <button
                  type="button"
                  disabled={
                    generatingLocaleBrief ||
                    generatingBible ||
                    saving ||
                    !briefDraft.trim() ||
                    !seriesBibleDraft.trim() ||
                    !settings.apiKey
                  }
                  onClick={() => void handleGenerateLocaleBriefInOnboarding(briefDraft)}
                  className="rounded border border-indigo-700 bg-indigo-950/50 px-2 py-0.5 text-[10px] text-indigo-200 disabled:opacity-40"
                >
                  {generatingLocaleBrief ? "生成中…" : "LLM 生成简报"}
                </button>
              </div>
              <p className="mb-1 text-[10px] leading-relaxed text-zinc-600">
                与编剧室「英语简报」为同一数据。使用上框确认书与本框系列圣经正文，无需先保存也可生成。
              </p>
              <textarea
                value={englishLocaleBriefDraft}
                onChange={(e) => setEnglishLocaleBriefDraft(e.target.value)}
                rows={6}
                className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 font-mono text-[11px] leading-relaxed text-zinc-200"
                placeholder="点「LLM 生成简报」或手填粘贴…"
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                disabled={!briefDraft.trim()}
                onClick={() =>
                  downloadCreativeBriefMarkdownFile(
                    project?.name?.trim() || meta.seriesTitle?.trim() || "未命名项目",
                    briefDraft
                  )
                }
                className="rounded border border-zinc-600 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
                title="仅下载为 .txt；正文与弹窗内稿相同，仍为 Markdown"
              >
                导出确认书 .txt
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={saving || generatingLocaleBrief}
                  onClick={() => setBriefOpen(false)}
                  className="rounded px-3 py-1.5 text-xs text-zinc-400"
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={saving || generatingLocaleBrief}
                  onClick={() => void handleFinishOnboardingOriginal()}
                  className="rounded bg-indigo-600 px-3 py-1.5 text-xs text-white disabled:opacity-50"
                >
                  {saving
                    ? generatingBible
                      ? "正在生成系列圣经…"
                      : generatingLocaleBrief
                        ? "正在生成简报…"
                        : "保存中…"
                    : "保存并进入"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {generatingPlan && (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-2 bg-black/55 text-zinc-100">
          <p className="text-sm font-medium">正在生成《创作思路确认书》《系列圣经》与英语 Locale 简报…</p>
          <p className="text-xs text-zinc-400">请稍候，可能需要数十秒至一两分钟…</p>
        </div>
      )}
    </div>
  );
}
