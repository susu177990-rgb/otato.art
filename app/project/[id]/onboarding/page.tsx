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
import PlanningChatPanel from "@/components/PlanningChatPanel";
import { buildAdaptationDiscussBootstrap, buildPlanningBootstrap } from "@/lib/planning-bootstrap";
import {
  DEFAULT_CREATIVE_DIRECTION_ID,
  applyCreativeDirectionDefaultsToMeta,
  getCreativeDirection,
  isCreativeDirectionLocked,
  listCreativeDirections,
  normalizeExistingProjectCreativeDirectionId,
  normalizeCreativeDirectionId,
} from "@/lib/creative-directions";
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
import shellStyles from "../../../shared/shell.module.css";
import styles from "./onboarding-page.module.css";

type TabId = "meta" | "materials" | "planning" | "finalize";

const TAB_LABELS: Record<TabId, string> = {
  meta: "基本信息",
  materials: "素材",
  planning: "策划",
  finalize: "立项确认",
};

const TAB_ORDER: TabId[] = ["meta", "materials", "planning", "finalize"];

function normalizeMeta(p: Project): ProjectMeta {
  const m = p.meta;
  return applyCreativeDirectionDefaultsToMeta({
    seriesTitle: m?.seriesTitle ?? p.name ?? "",
    episodeCount: m?.episodeCount ?? "",
    episodeDurationMinutes: m?.episodeDurationMinutes ?? null,
    targetMarket: m?.targetMarket ?? "",
    dialogueLanguage: m?.dialogueLanguage ?? "",
    extraNotes: m?.extraNotes ?? "",
  }, p.creativeDirectionId);
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
  const [activeTab, setActiveTab] = useState<TabId>("meta");
  const [originTab, setOriginTab] = useState<OriginMode>("original");
  const [creativeDirectionId, setCreativeDirectionId] = useState(DEFAULT_CREATIVE_DIRECTION_ID);
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
  const [creativeBrief, setCreativeBrief] = useState("");
  const [seriesBibleDraft, setSeriesBibleDraft] = useState("");
  const [englishLocaleBriefDraft, setEnglishLocaleBriefDraft] = useState("");
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [generatingBible, setGeneratingBible] = useState(false);
  const [generatingLocaleBrief, setGeneratingLocaleBrief] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const adaptationMessagesRef = useRef<Message[]>([]);

  useEffect(() => {
    adaptationMessagesRef.current = adaptationMessages;
  }, [adaptationMessages]);

  const creativeDirectionOptions = useMemo(() => listCreativeDirections(), []);
  const selectedCreativeDirection = useMemo(
    () => getCreativeDirection(creativeDirectionId),
    [creativeDirectionId]
  );

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
      const directionId = normalizeExistingProjectCreativeDirectionId(p.creativeDirectionId);
      setProject(p);
      setCreativeDirectionId(directionId);
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
      // 选默认 tab：未填基本信息→meta；改编 phase upload→materials；改编 phase discuss→planning；
      // 已 ready 或已有 creativeBrief → finalize；原创 planning 状态 → planning。
      const status = p.onboardingStatus ?? "ready";
      if (status === "ready" || (p.creativeBrief ?? "").trim().length > 0) {
        setActiveTab("finalize");
      } else if (om === "adaptation") {
        if (nextAdapt === "discuss" || nextAdapt === "planner") setActiveTab("planning");
        else if (nextAdapt === "meta") setActiveTab("finalize");
        else setActiveTab("materials");
      } else {
        setActiveTab(status === "planning" ? "planning" : "meta");
      }
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
    async (opts?: { replaceExisting?: boolean; creativeBriefOverride?: string }): Promise<Project> => {
      if (!settings.apiKey) {
        throw new Error("请先在设置 → LLM API 中配置 API Key");
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

  function updateMeta<K extends keyof ProjectMeta>(key: K, value: ProjectMeta[K]) {
    setMeta((m) => ({ ...m, [key]: value }));
  }

  function handleCreativeDirectionChange(next: string) {
    const normalized = normalizeCreativeDirectionId(next);
    if (normalized === creativeDirectionId) return;
    if (project && isCreativeDirectionLocked(project)) {
      alert("创作方向已锁定：项目已有确认书、系列圣经、对话或产物，不能直接切换方向。");
      return;
    }
    setCreativeDirectionId(normalized);
    setMeta((m) => applyCreativeDirectionDefaultsToMeta(m, normalized));
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

  /** 仅保存 meta + materials + originMode=original，不切 step（tab 由用户操控） */
  async function handleSaveMetaMaterials(silent = false): Promise<boolean> {
    if (!meta.seriesTitle.trim()) {
      if (!silent) alert("请填写剧名");
      return false;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: meta.seriesTitle.trim(),
          creativeDirectionId,
          meta: { ...meta, seriesTitle: meta.seriesTitle.trim() },
          sourceMaterials: materials,
          onboardingStatus: project?.onboardingStatus === "ready" ? "ready" : "planning",
          originMode: originTab,
        }),
      });
      if (!res.ok) throw new Error("保存失败");
      const p: Project = await res.json();
      setProject(p);
      return true;
    } catch (e) {
      if (!silent) alert(e instanceof Error ? e.message : "保存失败");
      return false;
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

  /** 原创：从最近一条助手消息抽取/填入 creativeBrief 后跳到 finalize。 */
  function handleGoFinalizeOriginal() {
    if (!creativeBrief.trim()) {
      const lastAssistant = [...planningMessages].reverse().find((m) => m.role === "assistant");
      const lastRaw = (lastAssistant?.content ?? "").trim();
      const extracted = lastRaw ? extractCreativeBriefDocument(lastRaw).trim() : "";
      const next = extracted || lastRaw;
      if (next) setCreativeBrief(next);
    }
    setActiveTab("finalize");
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

  async function handleSaveBibleManual() {
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
    setMeta(applyCreativeDirectionDefaultsToMeta(parsed, creativeDirectionId));
    if (warnings.length) {
      alert(`${warnings.join("\n")}\n\n请核对「基本信息」tab；若缺节可在确认书文末补上「## 立项字段（系统自动识别）」及键值行。`);
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
          creativeDirectionId,
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
      setActiveTab("planning");
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
      setActiveTab("planning");
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
          `《创作思路确认书》已保存。《系列圣经》自动生成未成功：${data.seriesBibleError}\n可在「立项确认」tab 用「LLM 生成圣经」补全。`
        );
      }
      if (data.localeBriefError) {
        alert(
          `《创作思路确认书》与《系列圣经》已保存。英语 Locale 简报自动生成未成功：${data.localeBriefError}\n可在「立项确认」tab 点击「LLM 生成简报」重试。`
        );
      }
      setAdaptPhase("meta");
      setActiveTab("finalize");
    } catch (e) {
      alert(e instanceof Error ? e.message : "生成失败");
    } finally {
      setGeneratingPlan(false);
    }
  }

  /** 进入编剧室前最终保存 — 原创/改编合用 */
  async function handleFinalizeAndEnterStudio() {
    if (!meta.seriesTitle.trim()) {
      alert("请先在「基本信息」tab 填写剧名");
      setActiveTab("meta");
      return;
    }
    const briefRaw = creativeBrief.trim();
    const brief = extractCreativeBriefDocument(briefRaw) || briefRaw;
    if (!brief) {
      alert("请填写或粘贴《创作思路确认书》正文");
      return;
    }
    if (!settings.apiKey) {
      openSettings();
      return;
    }
    const bibleSave = seriesBibleDraft.trim();
    const localeSave = englishLocaleBriefDraft.trim();
    const isAdapt = originTab === "adaptation";
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: meta.seriesTitle.trim(),
          creativeDirectionId,
          meta: { ...meta, seriesTitle: meta.seriesTitle.trim() },
          onboardingStatus: "ready",
          originMode: isAdapt ? "adaptation" : "original",
          ...(isAdapt ? { adaptationPhase: "ready" } : {}),
          sourceMaterials: materials,
          planningMessages,
          ...(isAdapt ? { adaptationMessages } : {}),
          creativeBrief: brief,
          ...(bibleSave ? { seriesBible: bibleSave } : {}),
          ...(localeSave ? { englishLocaleBrief: localeSave } : {}),
        }),
      });
      if (!res.ok) throw new Error("保存失败");
      const saved: Project = await res.json();
      setProject(saved);
      setSeriesBibleDraft(saved.seriesBible ?? seriesBibleDraft);
      setEnglishLocaleBriefDraft(saved.englishLocaleBrief ?? englishLocaleBriefDraft);
      setCreativeBrief(saved.creativeBrief ?? brief);

      if ((saved.seriesBible ?? "").trim()) {
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
            ? `${e.message}（立项已保存，请在「立项确认」tab 用「LLM 生成圣经」或手填后再进入编剧室）`
            : "生成系列圣经失败"
        );
        await load();
        return;
      } finally {
        setGeneratingBible(false);
      }
      router.push(`/studio/${id}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  // ========== 渲染辅助变量 ==========

  const status = project?.onboardingStatus ?? "ready";
  const serverMode = project?.originMode ?? "original";
  const isAdaptationUi = originTab === "adaptation";
  const creativeDirectionLocked = project
    ? isCreativeDirectionLocked({
        ...project,
        creativeBrief,
        seriesBible: seriesBibleDraft,
      })
    : false;
  const phase: AdaptationPhase =
    isAdaptationUi && serverMode !== "adaptation" ? "upload" : isAdaptationUi ? adaptPhase : "idle";
  const totalChars = totalSourceChars(materials);

  const finalizeReady =
    Boolean(meta.seriesTitle.trim()) && Boolean(creativeBrief.trim()) && Boolean(seriesBibleDraft.trim());

  /** 推断「下一步建议」tab，给 tab 标签上加小白点 */
  const suggestedTab: TabId | null = (() => {
    if (status === "ready" && finalizeReady) return null;
    if (!meta.seriesTitle.trim()) return "meta";
    if (isAdaptationUi) {
      if (phase === "idle" || phase === "upload") return "materials";
      if (phase === "analyzed" || phase === "discuss" || phase === "planner") return "planning";
      return "finalize";
    }
    if (!creativeBrief.trim()) {
      if (planningMessages.length === 0) return "planning";
      return "planning";
    }
    return "finalize";
  })();

  if (loading) {
    return (
      <main className={shellStyles.page}>
        <div className={shellStyles.empty}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
            <span className={shellStyles.spinner} aria-hidden /> 加载中…
          </span>
        </div>
      </main>
    );
  }

  if (!project) {
    return (
      <main className={shellStyles.page}>
        <div className={shellStyles.empty}>
          <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <span>项目不存在</span>
            <Link href="/projects" className={shellStyles.navLink}>
              返回项目列表
            </Link>
          </span>
        </div>
      </main>
    );
  }

  return (
    <main className={shellStyles.page}>
      <header className={shellStyles.topbar}>
        <div className={shellStyles.topbarLeft}>
          <Link href="/projects" className={[shellStyles.plainDockText, shellStyles.dockTextLink].join(" ")}>
            返回项目列表
          </Link>
          <div className={shellStyles.topbarTagline}>
            <p className={shellStyles.plainDockText}>项目立项 · {project.name || "未命名项目"}</p>
            <p className={shellStyles.helpText}>
              基本信息 → 素材 → 策划 → 立项确认 → 编剧室
              {saving ? <span style={{ marginLeft: 8 }}>· 保存中…</span> : null}
            </p>
          </div>
        </div>
        <nav className={shellStyles.topnav}>
          <div className={shellStyles.segmented} aria-label="创作模式">
            <button
              type="button"
              onClick={() => requestOriginTab("original")}
              className={[
                shellStyles.segmentedItem,
                originTab === "original" ? shellStyles.segmentedItemActive : "",
              ].join(" ")}
            >
              原创
            </button>
            <button
              type="button"
              onClick={() => requestOriginTab("adaptation")}
              className={[
                shellStyles.segmentedItem,
                originTab === "adaptation" ? shellStyles.segmentedItemActive : "",
              ].join(" ")}
            >
              改编
            </button>
          </div>
          {serverMode === "adaptation" && originTab === "original" ? (
            <span className={styles.adaptHint}>（已存为改编）</span>
          ) : null}
        </nav>
      </header>

      <div className={styles.body}>
        <section className={styles.shell}>
          <div className={shellStyles.tabsRow}>
            <div className={shellStyles.segmented} aria-label="立项步骤">
              {TAB_ORDER.map((tab) => {
                const isActive = activeTab === tab;
                const showBadge = !isActive && suggestedTab === tab;
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={[
                      shellStyles.segmentedItem,
                      isActive ? shellStyles.segmentedItemActive : "",
                    ].join(" ")}
                  >
                    {TAB_LABELS[tab]}
                    {showBadge ? <span className={styles.tabBadge} aria-label="建议下一步" /> : null}
                  </button>
                );
              })}
            </div>
          </div>

          {activeTab === "meta" && (
            <section className={styles.section}>
              <div className={shellStyles.card}>
                <div className={shellStyles.cardHead}>
                  <div>
                    <h2 className={shellStyles.cardTitle}>基本信息</h2>
                    <p className={shellStyles.cardSubtitle}>剧名必填；其余字段会写入系列圣经与各阶段提示词。</p>
                  </div>
                </div>
                <div className={shellStyles.row}>
                  <label className={shellStyles.field}>
                    <span className={shellStyles.fieldLabel}>剧名（必填）</span>
                    <input
                      value={meta.seriesTitle}
                      onChange={(e) => updateMeta("seriesTitle", e.target.value)}
                      placeholder="例如：南风识"
                      className={shellStyles.input}
                    />
                  </label>
                  <label className={shellStyles.field}>
                    <span className={shellStyles.fieldLabel}>创作方向</span>
                    <select
                      value={creativeDirectionId}
                      onChange={(e) => handleCreativeDirectionChange(e.target.value)}
                      disabled={creativeDirectionLocked}
                      className={shellStyles.select}
                    >
                      {creativeDirectionOptions.map((direction) => (
                        <option key={direction.id} value={direction.id}>
                          {direction.label}
                        </option>
                      ))}
                    </select>
                    <span className={shellStyles.helpText}>
                      {creativeDirectionLocked ? "已锁定" : selectedCreativeDirection.shortLabel}
                    </span>
                  </label>
                  <label className={shellStyles.field}>
                    <span className={shellStyles.fieldLabel}>目标集数 / 区间</span>
                    <input
                      value={meta.episodeCount}
                      onChange={(e) => updateMeta("episodeCount", e.target.value)}
                      placeholder="如 60 或 30~45"
                      className={shellStyles.input}
                    />
                  </label>
                  <label className={shellStyles.field}>
                    <span className={shellStyles.fieldLabel}>单集时长（分钟）</span>
                    <input
                      type="number"
                      min={0.5}
                      step={0.5}
                      value={meta.episodeDurationMinutes ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        updateMeta("episodeDurationMinutes", v === "" ? null : Number(v));
                      }}
                      placeholder="如 2"
                      className={shellStyles.input}
                    />
                  </label>
                  <label className={shellStyles.field}>
                    <span className={shellStyles.fieldLabel}>目标市场</span>
                    <input
                      value={meta.targetMarket}
                      onChange={(e) => updateMeta("targetMarket", e.target.value)}
                      className={shellStyles.input}
                    />
                  </label>
                  <label className={[shellStyles.field, shellStyles.rowFull].join(" ")}>
                    <span className={shellStyles.fieldLabel}>台词语言</span>
                    <input
                      value={meta.dialogueLanguage}
                      onChange={(e) => updateMeta("dialogueLanguage", e.target.value)}
                      placeholder="如 中文 / 英文"
                      className={shellStyles.input}
                    />
                  </label>
                  <label className={[shellStyles.field, shellStyles.rowFull].join(" ")}>
                    <span className={shellStyles.fieldLabel}>备注</span>
                    <textarea
                      value={meta.extraNotes}
                      onChange={(e) => updateMeta("extraNotes", e.target.value)}
                      rows={2}
                      className={shellStyles.textarea}
                      style={{ minHeight: 72 }}
                    />
                  </label>
                </div>
                <div className={styles.cardActions}>
                  <button
                    type="button"
                    onClick={() => void handleSaveMetaMaterials()}
                    disabled={saving}
                    className={[shellStyles.button, shellStyles.buttonSubtle].join(" ")}
                  >
                    {saving ? "保存中…" : "保存基本信息"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab(isAdaptationUi ? "materials" : "materials")}
                    className={shellStyles.button}
                  >
                    下一步：素材
                  </button>
                </div>
              </div>

              {isAdaptationUi && (project.sourceAnalysis ?? "").trim() ? (
                <div className={shellStyles.card}>
                  <div className={shellStyles.cardHead}>
                    <div>
                      <h2 className={shellStyles.cardTitle}>原文分析（只读）</h2>
                      <p className={shellStyles.cardSubtitle}>由模型对你上传的原文做的一次结构化总结。</p>
                    </div>
                  </div>
                  <pre className={styles.analysisPre}>{project.sourceAnalysis}</pre>
                </div>
              ) : null}
            </section>
          )}

          {activeTab === "materials" && (
            <section className={styles.section}>
              <div className={shellStyles.card}>
                <div className={shellStyles.cardHead}>
                  <div>
                    <h2 className={shellStyles.cardTitle}>素材（上传 / 粘贴）</h2>
                    <p className={shellStyles.cardSubtitle}>
                      支持 .txt / .md / .docx / .pdf；可多选。改编模式下「原文」必填，原创模式可选。
                    </p>
                  </div>
                  <span className={shellStyles.helpText}>
                    约 {totalChars} / {SOURCE_MATERIALS_MAX_CHARS} 字
                  </span>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.md,.markdown,.docx,.pdf,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  multiple
                  style={{ display: "none" }}
                  aria-hidden
                  onChange={(e) => {
                    void handleFile(e.target.files);
                    e.target.value = "";
                  }}
                />
                <div className={styles.materialsActions}>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className={[shellStyles.button, shellStyles.buttonPrimary].join(" ")}
                  >
                    选择文件上传
                  </button>
                  <span className={shellStyles.helpText}>
                    Word / PDF 在服务端转为纯文本后保存；扫描版 PDF 不支持
                  </span>
                </div>
                <div className={styles.pasteRow}>
                  <input
                    value={pasteLabel}
                    onChange={(e) => setPasteLabel(e.target.value)}
                    placeholder="粘贴素材标题（可选）"
                    className={[shellStyles.input, styles.pasteLabelInput].join(" ")}
                  />
                  <button
                    type="button"
                    onClick={handleAddPaste}
                    className={[shellStyles.button, shellStyles.buttonSubtle].join(" ")}
                  >
                    加入粘贴正文
                  </button>
                </div>
                <textarea
                  value={pasteBody}
                  onChange={(e) => setPasteBody(e.target.value)}
                  rows={6}
                  placeholder="在此粘贴大纲、灵感或网文片段…"
                  className={[shellStyles.textarea, shellStyles.mono].join(" ")}
                  style={{ fontSize: 11, minHeight: 140 }}
                />
                {materials.length > 0 ? (
                  <ul className={styles.materialList}>
                    {materials.map((m) => (
                      <li key={m.id} className={styles.materialItem}>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {m.label} · {m.kind} · {m.text.length} 字
                        </span>
                        <button type="button" onClick={() => removeMaterial(m.id)}>
                          删除
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={shellStyles.helpText}>尚未加入任何素材。</p>
                )}
                <div className={styles.cardActions}>
                  <button
                    type="button"
                    onClick={() => void handleSaveMetaMaterials()}
                    disabled={saving}
                    className={[shellStyles.button, shellStyles.buttonSubtle].join(" ")}
                  >
                    {saving ? "保存中…" : "保存素材"}
                  </button>
                  {isAdaptationUi && (phase === "idle" || phase === "upload") ? (
                    <button
                      type="button"
                      onClick={() => void handleSaveMaterialsAndAnalyze()}
                      disabled={saving || analyzing || materials.length === 0}
                      className={[shellStyles.button, shellStyles.buttonPrimary].join(" ")}
                    >
                      {analyzing ? "分析中…" : saving ? "保存中…" : "保存原文并开始分析"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setActiveTab("planning")}
                      className={shellStyles.button}
                    >
                      下一步：策划
                    </button>
                  )}
                </div>
              </div>
            </section>
          )}

          {activeTab === "planning" && (
            <section className={styles.section}>
              {!isAdaptationUi ? (
                <div className={shellStyles.card}>
                  <div className={shellStyles.cardHead}>
                    <div>
                      <h2 className={shellStyles.cardTitle}>策划对齐（原创）</h2>
                      <p className={shellStyles.cardSubtitle}>
                        与规划师交流方向、人设、节奏；助手输出会作为《创作思路确认书》的来源。
                      </p>
                    </div>
                  </div>
                  <PlanningChatPanel
                    layout="fixedScroll"
                    settings={settings}
                    messages={planningMessages}
                    planningBootstrap={planningBootstrap}
                    extraBody={{ creativeDirectionId }}
                    onOpenSettings={() => openSettings()}
                    onMessagesChange={setPlanningMessages}
                    onAssistantDone={handlePlanningAssistantDone}
                  />
                  <div className={styles.cardActions}>
                    <button
                      type="button"
                      onClick={handleGoFinalizeOriginal}
                      className={[shellStyles.button, shellStyles.buttonPrimary].join(" ")}
                    >
                      下一步：立项确认
                    </button>
                  </div>
                </div>
              ) : phase === "idle" || phase === "upload" ? (
                <div className={[shellStyles.banner, shellStyles.bannerWarn].join(" ")}>
                  请先在「素材」tab 上传或粘贴待改编原文，并执行「保存原文并开始分析」。
                </div>
              ) : phase === "analyzed" ? (
                <div className={shellStyles.card}>
                  <div className={shellStyles.cardHead}>
                    <div>
                      <h2 className={shellStyles.cardTitle}>原文分析已生成</h2>
                      <p className={shellStyles.cardSubtitle}>请进入下一步，与规划师讨论改编策略。</p>
                    </div>
                  </div>
                  {project.sourceAnalysis ? (
                    <pre className={styles.analysisPre}>{project.sourceAnalysis}</pre>
                  ) : null}
                  <div className={styles.cardActions}>
                    <button
                      type="button"
                      onClick={() => void handleEnterDiscuss()}
                      disabled={saving}
                      className={[shellStyles.button, shellStyles.buttonPrimary].join(" ")}
                    >
                      {saving ? "保存中…" : "进入改编讨论"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className={shellStyles.card}>
                  <div className={shellStyles.cardHead}>
                    <div>
                      <h2 className={shellStyles.cardTitle}>改编策略讨论</h2>
                      <p className={shellStyles.cardSubtitle}>
                        基于原文分析，敲定改编方向、体量、删留策略；不产出 STAGE 模板正文。
                      </p>
                    </div>
                  </div>
                  <PlanningChatPanel
                    key="adapt-discuss"
                    layout="fixedScroll"
                    settings={settings}
                    messages={adaptationMessages}
                    planningBootstrap={adaptationDiscussBootstrap}
                    chatEndpoint="/api/adaptation-discuss"
                    extraBody={{ creativeDirectionId }}
                    onOpenSettings={() => openSettings()}
                    onMessagesChange={setAdaptationMessages}
                    onAssistantDone={handleAdaptationAssistantDone}
                    headerTitle="改编策略讨论（不产出 STAGE 模板正文）"
                    emptyHint="基于上文分析，讨论改编方向、体量与删留策略。"
                    inputPlaceholder="输入你的想法或追问…"
                  />
                  <div className={styles.cardActions}>
                    <button
                      type="button"
                      onClick={() => void handleGenerateAdaptPlan()}
                      disabled={saving || generatingPlan}
                      className={[shellStyles.button, shellStyles.buttonPrimary].join(" ")}
                    >
                      {generatingPlan ? "正在生成…" : "下一步：生成确认书与系列圣经"}
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}

          {activeTab === "finalize" && (
            <section className={styles.section}>
              <div
                className={[
                  shellStyles.banner,
                  finalizeReady ? shellStyles.bannerSuccess : shellStyles.bannerWarn,
                ].join(" ")}
              >
                <div className={styles.finalizeBanner}>
                  <span>
                    {finalizeReady
                      ? "立项已就绪，可点击右下角进入编剧室。"
                      : "立项尚未齐备：请补全剧名 / 创作思路 / 系列圣经。"}
                  </span>
                  <span className={styles.finalizeChecklist}>
                    <span>
                      剧名 {meta.seriesTitle.trim() ? "✓" : "·"}
                    </span>
                    <span>
                      确认书 {creativeBrief.trim() ? "✓" : "·"}
                    </span>
                    <span>
                      圣经 {seriesBibleDraft.trim() ? "✓" : "·"}
                    </span>
                    <span>
                      简报 {englishLocaleBriefDraft.trim() ? "✓" : "·"}
                    </span>
                  </span>
                </div>
              </div>

              <div className={shellStyles.finalizeGrid}>
                <div className={[shellStyles.card, shellStyles.finalizeGridFull].join(" ")}>
                  <div className={shellStyles.cardHead}>
                    <div>
                      <h2 className={shellStyles.cardTitle}>创作思路确认书</h2>
                      <p className={shellStyles.cardSubtitle}>
                        Markdown 正文。文末「## 立项字段（系统自动识别）」可被「自动填表」解析回基本信息。
                      </p>
                    </div>
                    <div className={styles.cardActions}>
                      <button
                        type="button"
                        disabled={!creativeBrief.trim()}
                        onClick={handleAutoFillMetaFromCreativeBrief}
                        className={[shellStyles.button, shellStyles.buttonSubtle].join(" ")}
                      >
                        自动填基本信息
                      </button>
                      <button
                        type="button"
                        disabled={!creativeBrief.trim()}
                        onClick={() =>
                          downloadCreativeBriefMarkdownFile(
                            project.name?.trim() || meta.seriesTitle?.trim() || "未命名项目",
                            creativeBrief
                          )
                        }
                        className={[shellStyles.button, shellStyles.buttonSubtle].join(" ")}
                      >
                        导出 .txt
                      </button>
                    </div>
                  </div>
                  <textarea
                    value={creativeBrief}
                    onChange={(e) => setCreativeBrief(e.target.value)}
                    rows={14}
                    placeholder="规划正文将显示在此…"
                    className={[shellStyles.textarea, styles.finalizeBigTextarea].join(" ")}
                  />
                </div>

                <div className={shellStyles.card}>
                  <div className={shellStyles.cardHead}>
                    <div>
                      <h2 className={shellStyles.cardTitle}>系列圣经（SSOT）</h2>
                      <p className={shellStyles.cardSubtitle}>
                        与编剧室侧栏「系列圣经」同源；可手填粘贴或用 LLM 根据确认书生成。
                      </p>
                    </div>
                    <div className={styles.cardActions}>
                      <button
                        type="button"
                        disabled={!seriesBibleDraft.trim()}
                        onClick={() =>
                          downloadSeriesBibleMarkdownFile(
                            project.name?.trim() || meta.seriesTitle?.trim() || "未命名项目",
                            seriesBibleDraft
                          )
                        }
                        className={[shellStyles.button, shellStyles.buttonSubtle].join(" ")}
                      >
                        导出圣经
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
                        className={[shellStyles.button, shellStyles.buttonPrimary].join(" ")}
                      >
                        {generatingBible ? "生成中…" : "LLM 生成"}
                      </button>
                      <button
                        type="button"
                        disabled={saving || !seriesBibleDraft.trim()}
                        onClick={() => void handleSaveBibleManual()}
                        className={[shellStyles.button, shellStyles.buttonSubtle].join(" ")}
                      >
                        保存手填
                      </button>
                    </div>
                  </div>
                  <textarea
                    value={seriesBibleDraft}
                    onChange={(e) => setSeriesBibleDraft(e.target.value)}
                    rows={12}
                    placeholder="建议含一级标题「# 系列圣经与里程碑（SERIES_BIBLE）」…"
                    className={[shellStyles.textarea, styles.finalizeMidTextarea].join(" ")}
                  />
                </div>

                <div className={shellStyles.card}>
                  <div className={shellStyles.cardHead}>
                    <div>
                      <h2 className={shellStyles.cardTitle}>英语 Locale 简报（STAGE 7）</h2>
                      <p className={shellStyles.cardSubtitle}>
                        与编剧室「英语简报」同源；先有圣经再点 LLM 生成，可后改。
                      </p>
                    </div>
                    <div className={styles.cardActions}>
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
                        className={[shellStyles.button, shellStyles.buttonPrimary].join(" ")}
                      >
                        {generatingLocaleBrief ? "生成中…" : "LLM 生成"}
                      </button>
                    </div>
                  </div>
                  <textarea
                    value={englishLocaleBriefDraft}
                    onChange={(e) => setEnglishLocaleBriefDraft(e.target.value)}
                    rows={8}
                    placeholder="可选；也可进编剧室后在顶栏「英语简报」中生成。"
                    className={[shellStyles.textarea, styles.finalizeMidTextarea].join(" ")}
                  />
                </div>
              </div>
            </section>
          )}

          <div className={shellStyles.stickyCta}>
            {!finalizeReady ? (
              <span className={shellStyles.helpText} style={{ alignSelf: "center" }}>
                需先填写剧名 / 创作思路 / 系列圣经
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => void handleFinalizeAndEnterStudio()}
              disabled={saving || generatingBible || generatingLocaleBrief || !finalizeReady}
              className={[shellStyles.button, shellStyles.buttonPrimary].join(" ")}
            >
              {saving
                ? generatingBible
                  ? "正在生成系列圣经…"
                  : "保存中…"
                : "保存并进入编剧室"}
            </button>
          </div>
        </section>
      </div>

      {generatingPlan && (
        <div className={styles.generatingOverlay}>
          <p className={styles.generatingTitle}>正在生成《创作思路确认书》《系列圣经》与英语 Locale 简报…</p>
          <p className={styles.generatingHint}>请稍候，可能需要数十秒至一两分钟…</p>
        </div>
      )}
    </main>
  );
}
