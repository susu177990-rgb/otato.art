"use client";

import { useState, useEffect, useCallback, useRef, useMemo, Suspense } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type {
  Message,
  Project,
  Artifact,
  ProjectMeta,
  OnboardingStatus,
  OriginMode,
} from "@/lib/types";
import {
  upsertArtifact as upsertArtifactInList,
  removeArtifactByKey,
  removeSubtreeFromList,
  artifactNow,
} from "@/lib/artifact-mutations";
import { detectStage, detectStageFromContent } from "@/lib/stage-detect";
import { evaluateStageGate } from "@/lib/stage-gate";
import { buildProjectContext } from "@/lib/project-context";
import { SOURCE_ANALYSIS_CONTEXT_CHARS } from "@/lib/source-materials";
import { getStudioAutoStageUserMessage, STUDIO_AUTO_STAGE1_USER_MESSAGE } from "@/lib/studio-auto-kickoff";
import {
  parseTargetEpisodeCount,
  maxExistingEpisodeNum,
  extractPrevEpisodeSummary,
  buildEpisodeUserMessage,
  isStage7EpisodeParsed,
  type PipelineProgress,
} from "@/lib/stage5-pipeline";
import {
  buildEventBatches,
  findNextBatchIndex,
  extractPrevBatchEndHook,
  buildOutlineBatchUserMessage,
} from "@/lib/stage6-pipeline";
import {
  extractArtifacts,
  mergeArtifactsWithPolicy,
  looksLikeTemplateDeliverable,
  reExtractForPreferredStage,
  stage2FullReplaceOpts,
  artifactsWorthMerging,
} from "@/lib/artifact-extract";
import ChatWindow, { type ChatWindowHandle } from "@/components/ChatWindow";
import { useApiSettings } from "@/components/ApiSettingsProvider";
import ApiSettingsToolbarButton from "@/components/ApiSettingsToolbarButton";
import ArtifactPanel from "@/components/ArtifactPanel";
import StudioProcessRail from "@/components/StudioProcessRail";
import StudioBibleDrawer, { type BibleDrawerTab } from "@/components/StudioBibleDrawer";

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

function StudioInner() {
  const params = useParams<{ id: string }>();
  const projectId = params.id ?? "";
  const { settings, openSettings } = useApiSettings();

  const [mounted, setMounted] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);

  const [projectName, setProjectName] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [currentStage, setCurrentStage] = useState(0);
  const [seriesBible, setSeriesBible] = useState("");
  const [maxApprovedStage, setMaxApprovedStage] = useState(0);
  const [gateOverrideNote, setGateOverrideNote] = useState("");
  const [projectMeta, setProjectMeta] = useState<ProjectMeta | null>(null);
  const [creativeBrief, setCreativeBrief] = useState("");
  const [englishLocaleBrief, setEnglishLocaleBrief] = useState("");
  const [onboardingStatus, setOnboardingStatus] = useState<OnboardingStatus | null>(null);
  const [projectOriginMode, setProjectOriginMode] = useState<OriginMode>("original");
  const [projectSourceAnalysis, setProjectSourceAnalysis] = useState("");

  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [bibleDrawerOpen, setBibleDrawerOpen] = useState(false);
  const [bibleDrawerTab, setBibleDrawerTab] = useState<BibleDrawerTab>("bible");
  const [chatLoading, setChatLoading] = useState(false);
  /** 右侧产物区与流程条共用的「当前查看阶段」（1–5） */
  const [viewStage, setViewStage] = useState(1);

  const [pipelineProgress, setPipelineProgress] = useState<PipelineProgress | null>(null);

  const chatRef = useRef<ChatWindowHandle>(null);
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const seriesBibleSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const englishLocaleBriefSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const artifactsRef = useRef(artifacts);
  const pipelineAbortRef = useRef(false);
  const pipelineStageOverrideRef = useRef(0);

  const [fullAutoEnabled, setFullAutoEnabled] = useState(false);
  const [fullAutoStage, setFullAutoStage] = useState(0);
  const fullAutoAbortRef = useRef(false);

  useEffect(() => {
    artifactsRef.current = artifacts;
  }, [artifacts]);

  const studioAutoKickoffMessage = useMemo(() => {
    if (!initialLoadComplete) return null;
    if (messages.length > 0) return null;
    if (!settings.apiKey) return null;
    if ((onboardingStatus ?? "ready") !== "ready") return null;
    return STUDIO_AUTO_STAGE1_USER_MESSAGE;
  }, [initialLoadComplete, messages.length, settings.apiKey, onboardingStatus]);

  const projectContext = useMemo(() => {
    const om = projectOriginMode ?? "original";
    const raw = projectSourceAnalysis.trim();
    const excerpt =
      om === "adaptation" && raw
        ? raw.length <= SOURCE_ANALYSIS_CONTEXT_CHARS
          ? raw
          : raw.slice(0, SOURCE_ANALYSIS_CONTEXT_CHARS) + "…"
        : undefined;
    return buildProjectContext({
      messages,
      artifacts,
      maxApprovedStage: maxApprovedStage ?? 0,
      meta: projectMeta ?? undefined,
      creativeBrief,
      originMode: om,
      sourceAnalysisExcerpt: excerpt,
      seriesBible,
      englishLocaleBrief,
    });
  }, [
    messages,
    artifacts,
    maxApprovedStage,
    projectMeta,
    creativeBrief,
    projectOriginMode,
    projectSourceAnalysis,
    seriesBible,
    englishLocaleBrief,
  ]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const loadProject = useCallback(async (id: string) => {
    setLoadError(null);
    setInitialLoadComplete(false);
    try {
      const res = await fetch(`/api/projects/${id}`);
      if (!res.ok) {
        setLoadError("项目不存在或无法加载");
        return;
      }
      const p: Project = await res.json();
      setProjectName(p.name);
      setMessages(p.messages);
      setArtifacts(p.artifacts);
      setCurrentStage(p.currentStage);
      setSeriesBible(p.seriesBible ?? "");
      setMaxApprovedStage(p.maxApprovedStage ?? 0);
      setGateOverrideNote(p.gateOverrideNote ?? "");
      setProjectMeta(normalizeMeta(p));
      setCreativeBrief(p.creativeBrief ?? "");
      setEnglishLocaleBrief(p.englishLocaleBrief ?? "");
      setOnboardingStatus(p.onboardingStatus ?? "ready");
      setProjectOriginMode(p.originMode ?? "original");
      setProjectSourceAnalysis(p.sourceAnalysis ?? "");
      setInitialLoadComplete(true);
    } catch {
      setLoadError("加载失败");
    }
  }, []);

  useEffect(() => {
    if (!mounted || !projectId) return;
    void loadProject(projectId);
  }, [mounted, projectId, loadProject]);

  useEffect(() => {
    setViewStage(1);
  }, [projectId]);

  const persistProject = useCallback(
    (
      msgs: Message[],
      arts: Artifact[],
      stage: number,
      persistOverrides?: {
        seriesBible?: string;
        englishLocaleBrief?: string;
        maxApprovedStage?: number;
        gateOverrideNote?: string;
      }
    ) => {
      if (!projectId) return;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        try {
          const payload = {
            messages: msgs,
            artifacts: arts,
            currentStage: stage,
            seriesBible: persistOverrides?.seriesBible ?? seriesBible,
            englishLocaleBrief: persistOverrides?.englishLocaleBrief ?? englishLocaleBrief,
            maxApprovedStage: persistOverrides?.maxApprovedStage ?? maxApprovedStage,
            gateOverrideNote: persistOverrides?.gateOverrideNote ?? gateOverrideNote,
          };

          await fetch(`/api/projects/${projectId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
        } catch {}
      }, 400);
    },
    [projectId, seriesBible, englishLocaleBrief, maxApprovedStage, gateOverrideNote]
  );

  const handleSeriesBibleChange = useCallback(
    (next: string) => {
      setSeriesBible(next);
      if (!projectId) return;
      if (seriesBibleSaveTimerRef.current) clearTimeout(seriesBibleSaveTimerRef.current);
      seriesBibleSaveTimerRef.current = setTimeout(async () => {
        try {
          await fetch(`/api/projects/${projectId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ seriesBible: next }),
          });
        } catch {}
      }, 600);
    },
    [projectId]
  );

  const handleEnglishLocaleBriefChange = useCallback(
    (next: string) => {
      setEnglishLocaleBrief(next);
      if (!projectId) return;
      if (englishLocaleBriefSaveTimerRef.current) clearTimeout(englishLocaleBriefSaveTimerRef.current);
      englishLocaleBriefSaveTimerRef.current = setTimeout(async () => {
        try {
          await fetch(`/api/projects/${projectId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ englishLocaleBrief: next }),
          });
        } catch {}
      }, 600);
    },
    [projectId]
  );

  /** 未达标仍要标记已验（需填写原因）；「达标」路径由下方 effect 根据 Gate 自动写入 */
  const handleGateOverrideMark = useCallback(
    async (overrideNote?: string) => {
      if (!projectId || currentStage < 1) return;
      const nextMax = Math.max(currentStage, maxApprovedStage);
      const note = (overrideNote ?? "").trim() || "未达标仍标记";
      setMaxApprovedStage(nextMax);
      setGateOverrideNote(note);
      try {
        await fetch(`/api/projects/${projectId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ maxApprovedStage: nextMax, gateOverrideNote: note }),
        });
      } catch {}
    },
    [projectId, currentStage, maxApprovedStage]
  );

  /** 当前对话阶段 Gate 通过时，自动将工程「已验至」提升到 currentStage（等同原「标为已验收」） */
  const autoApproveWhenGatePasses = useCallback(async () => {
    if (!projectId || currentStage < 1 || currentStage > 7) return;
    const epCount = projectMeta?.episodeCount ? parseTargetEpisodeCount(projectMeta.episodeCount) : undefined;
    const gate = evaluateStageGate(currentStage, artifacts, epCount ? { episodeCount: epCount } : undefined);
    if (!gate.ok) return;
    const nextMax = Math.max(currentStage, maxApprovedStage);
    if (nextMax <= maxApprovedStage) return;
    setMaxApprovedStage(nextMax);
    setGateOverrideNote("");
    try {
      await fetch(`/api/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxApprovedStage: nextMax, gateOverrideNote: "" }),
      });
    } catch {}
  }, [projectId, currentStage, artifacts, maxApprovedStage, projectMeta]);

  useEffect(() => {
    if (!initialLoadComplete) return;
    void autoApproveWhenGatePasses();
  }, [initialLoadComplete, autoApproveWhenGatePasses]);

  useEffect(() => {
    if (viewStage === 7 && projectId && !englishLocaleBrief.trim()) {
      console.info(
        "[编剧室] 建议先在顶栏打开「英语简报」，生成《英语 Locale 简报》，再写 STAGE 7 英语对白。"
      );
    }
  }, [viewStage, projectId, englishLocaleBrief]);

  const runEpisodePipeline = useCallback(
    async (totalEpisodes: number) => {
      if (!chatRef.current) {
        alert("对话区尚未就绪，请稍候再点「连续分集」或「继续」。");
        return;
      }
      pipelineAbortRef.current = false;

      const startFrom = maxExistingEpisodeNum(artifactsRef.current) + 1;
      if (startFrom > totalEpisodes) {
        setPipelineProgress({
          current: totalEpisodes,
          total: totalEpisodes,
          status: "done",
          kind: "episode",
        });
        return;
      }

      setPipelineProgress({
        current: startFrom,
        total: totalEpisodes,
        status: "running",
        kind: "episode",
      });

      for (let ep = startFrom; ep <= totalEpisodes; ep++) {
        if (pipelineAbortRef.current) {
          setPipelineProgress((prev) =>
            prev ? { ...prev, status: "paused", kind: "episode" } : null
          );
          return;
        }

        setPipelineProgress({
          current: ep,
          total: totalEpisodes,
          status: "running",
          kind: "episode",
        });

        const prevSummary =
          ep > 1 ? extractPrevEpisodeSummary(artifactsRef.current, ep - 1) : "";
        const userMsg = buildEpisodeUserMessage(ep, totalEpisodes, prevSummary);

        let reply = "";
        let retried = false;
        for (let attempt = 0; attempt < 2; attempt++) {
          pipelineStageOverrideRef.current = 7;
          reply = await chatRef.current.sendUserMessage(userMsg);
          if (reply && reply !== "(模型未返回任何内容)") break;
          if (attempt === 0) {
            retried = true;
            await new Promise((r) => setTimeout(r, 2000));
          }
        }

        await new Promise((r) => setTimeout(r, 300));

        const epKey = `ep${ep}`;
        const parsedInRef = isStage7EpisodeParsed(artifactsRef.current, epKey);

        if (!parsedInRef && reply) {
          const forcedExtracted = extractArtifacts(reply, 7);
          if (forcedExtracted.some((a) => a.subKey === epKey)) {
            const merged = mergeArtifactsWithPolicy(artifactsRef.current, forcedExtracted);
            setArtifacts(merged);
            artifactsRef.current = merged;
          }
        }

        const parsed = isStage7EpisodeParsed(artifactsRef.current, epKey);

        if (!reply || (!parsed && !retried)) {
          setPipelineProgress({
            current: ep,
            total: totalEpisodes,
            status: "error",
            kind: "episode",
            errorMessage: `第 ${ep} 集生成或解析失败`,
          });
          return;
        }

        if (ep < totalEpisodes) {
          await new Promise((r) => setTimeout(r, 1500));
        }
      }

      setPipelineProgress({
        current: totalEpisodes,
        total: totalEpisodes,
        status: "done",
        kind: "episode",
      });
    },
    []
  );

  const runOutlinePipeline = useCallback(async () => {
    if (!chatRef.current) {
      alert("对话区尚未就绪，请稍候再点「连续大纲」或「继续」。");
      return;
    }
    pipelineAbortRef.current = false;

    const batches = buildEventBatches(artifactsRef.current);
    if (batches.length === 0) {
      alert("无法从 STAGE 4 产物中解析事件批次（缺少「集数范围」标注）。请先确认 STAGE 4 事件已标注集数范围。");
      return;
    }

    const totalEpisodes = batches[batches.length - 1].toEp;
    const startIdx = findNextBatchIndex(batches, artifactsRef.current);
    if (startIdx >= batches.length) {
      setPipelineProgress({
        current: totalEpisodes,
        total: totalEpisodes,
        status: "done",
        kind: "outline",
      });
      return;
    }

    setPipelineProgress({
      current: batches[startIdx].fromEp,
      total: totalEpisodes,
      status: "running",
      kind: "outline",
    });

    for (let i = startIdx; i < batches.length; i++) {
      if (pipelineAbortRef.current) {
        setPipelineProgress((prev) =>
          prev ? { ...prev, status: "paused", kind: "outline" } : null
        );
        return;
      }

      const batch = batches[i];
      setPipelineProgress({
        current: batch.fromEp,
        total: totalEpisodes,
        status: "running",
        kind: "outline",
      });

      const prevHook = i > 0
        ? extractPrevBatchEndHook(artifactsRef.current, batches[i - 1].toEp)
        : "";
      const userMsg = buildOutlineBatchUserMessage(batch, totalEpisodes, prevHook);

      let reply = "";
      for (let attempt = 0; attempt < 2; attempt++) {
        pipelineStageOverrideRef.current = 6;
        reply = await chatRef.current.sendUserMessage(userMsg);
        if (reply && reply !== "(模型未返回任何内容)") break;
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 2000));
        }
      }

      await new Promise((r) => setTimeout(r, 400));

      const outlineKey = `outline_ep${batch.fromEp}`;
      const rootFromRef = artifactsRef.current.find(
        (a) => a.stage === 6 && a.subKey === outlineKey && !a.parentKey
      );

      if (!rootFromRef && reply) {
        const forcedExtracted = extractArtifacts(reply, 6);
        if (forcedExtracted.some((a) => a.subKey === outlineKey)) {
          const merged = mergeArtifactsWithPolicy(artifactsRef.current, forcedExtracted);
          setArtifacts(merged);
          artifactsRef.current = merged;
        }
      }

      const rootOutline = artifactsRef.current.find(
        (a) => a.stage === 6 && a.subKey === outlineKey && !a.parentKey
      );
      const outlineBody = rootOutline?.content?.trim() ?? "";
      const hasAnyOutline =
        outlineBody.length >= 24 &&
        /##\s*第\s*\d+\s*集|本集剧情|开头钩子|结尾悬念/u.test(outlineBody);

      if (!reply || !hasAnyOutline) {
        setPipelineProgress({
          current: batch.fromEp,
          total: totalEpisodes,
          status: "error",
          kind: "outline",
          errorMessage: `事件 ${batch.eventNum}（第 ${batch.fromEp}~${batch.toEp} 集）大纲生成或解析失败`,
        });
        return;
      }

      if (i < batches.length - 1) {
        await new Promise((r) => setTimeout(r, 1500));
      }
    }

    setPipelineProgress({
      current: totalEpisodes,
      total: totalEpisodes,
      status: "done",
      kind: "outline",
    });
  }, []);

  const handleStartOutlinePipeline = useCallback(() => {
    const batches = buildEventBatches(artifacts);

    if (batches.length === 0) {
      const hasAnyS4Events = artifacts.some(
        (a) => a.stage === 4 && a.subKey.startsWith("event_")
      );
      if (!hasAnyS4Events) {
        alert("暂无 STAGE 4 核心事件产物，请先完成 STAGE 4。");
        return;
      }
      const fallback = confirm(
        "STAGE 4 核心事件暂未标注「集数范围：第X集 ~ 第Y集」，无法按事件分批。\n\n" +
        "点击「确定」将以单轮模式发送大纲请求（旧模式，不分批）；\n" +
        "点击「取消」可先回 STAGE 4 补全集数范围后再用流水线。"
      );
      if (!fallback) return;
      const text = getStudioAutoStageUserMessage(6);
      if (text) {
        setViewStage(6);
        void chatRef.current?.sendUserMessage(text);
      }
      return;
    }

    const totalEp = batches[batches.length - 1].toEp;
    const nextIdx = findNextBatchIndex(batches, artifacts);
    if (nextIdx >= batches.length) {
      alert("全部分集大纲已按事件批次写完，无需再启动流水线。");
      return;
    }
    const fromEp = batches[nextIdx].fromEp;

    if (
      !confirm(
        `即将启动分集大纲自动流水线，共 ${batches.length} 个事件批次（${totalEp} 集）。\n将从第 ${fromEp} 集开始，可随时暂停。确认开始？`
      )
    ) {
      return;
    }

    setViewStage(6);
    void runOutlinePipeline();
  }, [artifacts, runOutlinePipeline]);

  const handleStartPipeline = useCallback(() => {
    const raw = projectMeta?.episodeCount ?? "";
    let total = parseTargetEpisodeCount(raw);

    if (!total) {
      const input = prompt(
        `请输入目标集数（当前立项填写的集数为「${raw || "未填"}」）：`
      );
      if (!input) return;
      total = parseTargetEpisodeCount(input);
      if (!total) {
        alert("无法解析为有效集数，请输入纯数字（如 40）。");
        return;
      }
    }

    if (
      !confirm(
        `即将启动自动流水线，从第 ${maxExistingEpisodeNum(artifacts) + 1} 集写到第 ${total} 集。\n全程无需手动干预，可随时暂停。确认开始？`
      )
    ) {
      return;
    }

    setViewStage(7);
    void runEpisodePipeline(total);
  }, [projectMeta, artifacts, runEpisodePipeline]);

  const handlePausePipeline = useCallback(() => {
    pipelineAbortRef.current = true;
  }, []);

  const handleResumePipeline = useCallback(() => {
    if (!pipelineProgress || pipelineProgress.status !== "paused") return;
    const resumeOutline =
      pipelineProgress.kind === "outline" ||
      (pipelineProgress.kind == null && viewStage === 6);
    if (resumeOutline) {
      void runOutlinePipeline();
    } else {
      void runEpisodePipeline(pipelineProgress.total);
    }
  }, [pipelineProgress, viewStage, runEpisodePipeline, runOutlinePipeline]);

  const runFullAutoPipeline = useCallback(async () => {
    if (!chatRef.current) {
      alert("对话区尚未就绪，请稍候再试。");
      setFullAutoEnabled(false);
      return;
    }
    fullAutoAbortRef.current = false;

    const epCountRaw = projectMeta?.episodeCount ?? "";
    const episodeCount = parseTargetEpisodeCount(epCountRaw) || 0;

    let startStage = (maxApprovedStage ?? 0) + 1;

    if (startStage > 7 && episodeCount > 0) {
      const filledEps = maxExistingEpisodeNum(artifactsRef.current);
      if (filledEps < episodeCount) {
        startStage = 7;
      }
      const batches = buildEventBatches(artifactsRef.current);
      if (batches.length > 0) {
        const nextBatch = findNextBatchIndex(batches, artifactsRef.current);
        if (nextBatch < batches.length) {
          startStage = 6;
        }
      }
    }

    if (startStage > 7) {
      setFullAutoEnabled(false);
      setPipelineProgress(null);
      return;
    }

    for (let stage = startStage; stage <= 7; stage++) {
      if (fullAutoAbortRef.current) {
        setFullAutoStage(stage);
        setFullAutoEnabled(false);
        return;
      }

      setFullAutoStage(stage);
      setViewStage(stage);

      if (stage <= 5) {
        const text = getStudioAutoStageUserMessage(stage);
        if (!text) continue;
        pipelineStageOverrideRef.current = stage;
        const reply = await chatRef.current.sendUserMessage(text);
        await new Promise((r) => setTimeout(r, 800));

        const gateMeta = { episodeCount };
        let gate = evaluateStageGate(stage, artifactsRef.current, gateMeta);

        if (!gate.ok && reply) {
          const failedItems = gate.items.filter((i) => !i.pass && !i.optional).map((i) => i.label);
          const retryMsg = `上一轮 STAGE ${stage} 产物未通过验收，请补全以下项目后重新输出完整模板交付物：${failedItems.join("、")}`;
          pipelineStageOverrideRef.current = stage;
          await chatRef.current.sendUserMessage(retryMsg);
          await new Promise((r) => setTimeout(r, 800));
          gate = evaluateStageGate(stage, artifactsRef.current, gateMeta);
        }

        if (!gate.ok) {
          const failedItems = gate.items.filter((i) => !i.pass && !i.optional).map((i) => i.label);
          setPipelineProgress({
            current: stage,
            total: 7,
            status: "error",
            kind: "outline",
            errorMessage: `STAGE ${stage} 验收未通过：${failedItems.join("、")}`,
          });
          setFullAutoEnabled(false);
          return;
        }
      } else if (stage === 6) {
        const batches = buildEventBatches(artifactsRef.current);
        if (batches.length === 0) {
          const text = getStudioAutoStageUserMessage(6);
          if (text) {
            pipelineStageOverrideRef.current = 6;
            await chatRef.current.sendUserMessage(text);
          }
          await new Promise((r) => setTimeout(r, 800));
        } else {
          await runOutlinePipeline();
        }
        if (fullAutoAbortRef.current) {
          setFullAutoEnabled(false);
          return;
        }
      } else if (stage === 7) {
        const total = episodeCount || parseTargetEpisodeCount(projectMeta?.episodeCount ?? "") || 0;
        if (!total) {
          setPipelineProgress({
            current: 7,
            total: 7,
            status: "error",
            kind: "episode",
            errorMessage: "无法获取总集数，无法启动分集剧本流水线",
          });
          setFullAutoEnabled(false);
          return;
        }
        await runEpisodePipeline(total);
        if (fullAutoAbortRef.current) {
          setFullAutoEnabled(false);
          return;
        }
      }

      const newMax = Math.max(stage, maxApprovedStage ?? 0);
      setMaxApprovedStage(newMax);
      setGateOverrideNote("");
      try {
        await fetch(`/api/projects/${projectId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ maxApprovedStage: newMax, gateOverrideNote: "" }),
        });
      } catch {}

      if (stage < 7) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    setFullAutoStage(0);
    setFullAutoEnabled(false);
  }, [projectId, projectMeta, maxApprovedStage, runOutlinePipeline, runEpisodePipeline]);

  const handleToggleFullAuto = useCallback(() => {
    if (fullAutoEnabled) {
      fullAutoAbortRef.current = true;
      pipelineAbortRef.current = true;
      setFullAutoEnabled(false);
    } else {
      setFullAutoEnabled(true);
      void runFullAutoPipeline();
    }
  }, [fullAutoEnabled, runFullAutoPipeline]);

  const handleAutoStartStage = useCallback(
    (stage: 1 | 2 | 3 | 4 | 5 | 6 | 7) => {
      if (stage === 7) {
        handleStartPipeline();
        return;
      }
      if (stage === 6) {
        handleStartOutlinePipeline();
        return;
      }
      const text = getStudioAutoStageUserMessage(stage);
      if (text) void chatRef.current?.sendUserMessage(text);
    },
    [handleStartPipeline, handleStartOutlinePipeline]
  );

  function handleMessagesChange(newMessages: Message[]) {
    setMessages(newMessages);
    const stage = detectStage(newMessages);
    setCurrentStage(stage);
  }

  function handleAssistantDone(fullReply: string, messagesSnapshot: Message[]) {
    const override = pipelineStageOverrideRef.current;
    pipelineStageOverrideRef.current = 0;

    let stage = override || detectStageFromContent(fullReply);
    if (stage === 0) {
      stage = detectStage(messagesSnapshot);
    }
    setCurrentStage(stage);

    const lastUserMsg = [...messagesSnapshot].reverse().find((m) => m.role === "user");
    const lastUserText = lastUserMsg?.content;

    // 用 ref 而非闭包里的 artifacts，避免流水线多集时 state 尚未提交导致合并丢失
    const currentArtifacts = artifactsRef.current;
    let newArtifacts = currentArtifacts;
    if (stage > 0) {
      let extracted = extractArtifacts(fullReply, stage);

      if (
        looksLikeTemplateDeliverable(fullReply) &&
        (extracted.length === 0 || (extracted.length === 1 && extracted[0].subKey === "full"))
      ) {
        for (let tryStage = 1; tryStage <= 7; tryStage++) {
          if (tryStage === stage) continue;
          const fallback = extractArtifacts(fullReply, tryStage);
          if (
            fallback.length > 0 &&
            !(fallback.length === 1 && fallback[0].subKey === "full") &&
            artifactsWorthMerging(fullReply, fallback)
          ) {
            extracted = fallback;
            stage = tryStage;
            setCurrentStage(tryStage);
            break;
          }
        }
      }

      if (artifactsWorthMerging(fullReply, extracted)) {
        const policy = stage2FullReplaceOpts(extracted, lastUserText);
        newArtifacts = mergeArtifactsWithPolicy(currentArtifacts, extracted, policy);
        setArtifacts(newArtifacts);
      }
    } else if (looksLikeTemplateDeliverable(fullReply)) {
      for (let tryStage = 1; tryStage <= 7; tryStage++) {
        const fallback = extractArtifacts(fullReply, tryStage);
        if (
          fallback.length > 0 &&
          !(fallback.length === 1 && fallback[0].subKey === "full") &&
          artifactsWorthMerging(fullReply, fallback)
        ) {
          stage = tryStage;
          setCurrentStage(tryStage);
          const policy = stage2FullReplaceOpts(fallback, lastUserText);
          newArtifacts = mergeArtifactsWithPolicy(currentArtifacts, fallback, policy);
          setArtifacts(newArtifacts);
          break;
        }
      }
    }

    artifactsRef.current = newArtifacts;
    persistProject(messagesSnapshot, newArtifacts, stage);
  }

  const handleArtifactUpsert = useCallback(
    (patch: Omit<Artifact, "updatedAt"> & { updatedAt?: string }) => {
      setArtifacts((prev) => {
        const next = upsertArtifactInList(prev, { ...patch, updatedAt: patch.updatedAt ?? artifactNow() });
        persistProject(messages, next, currentStage);
        return next;
      });
    },
    [messages, currentStage, persistProject]
  );

  const handleArtifactRemove = useCallback(
    (stage: number, subKey: string) => {
      setArtifacts((prev) => {
        const next = removeArtifactByKey(prev, stage, subKey);
        persistProject(messages, next, currentStage);
        return next;
      });
    },
    [messages, currentStage, persistProject]
  );

  const handleArtifactRemoveSubtree = useCallback(
    (rootSubKey: string) => {
      setArtifacts((prev) => {
        const next = removeSubtreeFromList(prev, rootSubKey);
        persistProject(messages, next, currentStage);
        return next;
      });
    },
    [messages, currentStage, persistProject]
  );

  const handleReExtractStage = useCallback(
    (preferredStage: number) => {
      const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
      if (!lastAssistant?.content?.trim()) {
        alert("暂无助手回复，请先在左侧生成一条助手消息。");
        return;
      }
      const fullReply = lastAssistant.content;
      const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
      const lastUserText = lastUserMsg?.content;

      const result = reExtractForPreferredStage(fullReply, preferredStage);
      if (!result) {
        alert("未能从最新助手回复中解析出可记录的产物。请检查格式或确认最新一条是目标阶段的交付。");
        return;
      }

      const { extracted, stageUsed } = result;
      const isAccumulative = stageUsed === 6 || stageUsed === 7;
      const s2Policy = stage2FullReplaceOpts(extracted, lastUserText);
      const replaceStages = new Set<number>();
      if (!isAccumulative) replaceStages.add(stageUsed);
      if (s2Policy?.replaceStages) {
        for (const s of s2Policy.replaceStages) replaceStages.add(s);
      }
      const newArtifacts = mergeArtifactsWithPolicy(artifacts, extracted,
        replaceStages.size > 0 ? { replaceStages: Array.from(replaceStages) } : undefined,
      );
      const nextPersistStage = Math.max(currentStage, stageUsed);
      setArtifacts(newArtifacts);
      setCurrentStage((prev) => Math.max(prev, stageUsed));
      persistProject(messages, newArtifacts, nextPersistStage);
    },
    [messages, artifacts, currentStage, persistProject]
  );

  if (!projectId) {
    return (
      <div className="flex h-full flex-col bg-zinc-950 text-zinc-500">
        <header className="flex justify-end border-b border-zinc-800 px-4 py-2">
          <ApiSettingsToolbarButton />
        </header>
        <div className="flex flex-1 items-center justify-center">无效的项目 ID</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex h-full flex-col bg-zinc-950 text-zinc-400">
        <header className="flex items-center justify-end gap-2 border-b border-zinc-800 px-4 py-2">
          <ApiSettingsToolbarButton />
        </header>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4">
          <p>{loadError}</p>
          <Link href="/projects" className="text-indigo-400 hover:underline">
            返回项目页
          </Link>
        </div>
      </div>
    );
  }

  if (!initialLoadComplete) {
    return (
      <div className="flex h-full flex-col bg-zinc-950">
        <header className="flex items-center justify-between gap-2 border-b border-zinc-800 px-4 py-2.5">
          <Link
            href="/projects"
            className="inline-block rounded-lg border border-zinc-700 px-2 py-1 text-[11px] text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
          >
            返回项目页
          </Link>
          <ApiSettingsToolbarButton />
        </header>
        <div className="flex flex-1 items-center justify-center text-sm text-zinc-500">加载项目…</div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-zinc-800">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <Link
              href="/projects"
              className="shrink-0 rounded-lg border border-zinc-700 px-2 py-1 text-[11px] text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
            >
              返回项目页
            </Link>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
              BL
            </div>
            <h1 className="truncate text-sm font-semibold text-zinc-200">短剧编剧室</h1>
            <span className="truncate text-xs text-zinc-500">· {projectName || "…"}</span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {(() => {
              const switchDisabled = !projectId || !settings.apiKey || (onboardingStatus != null && onboardingStatus !== "ready");
              const isError = !fullAutoEnabled && pipelineProgress?.status === "error" && fullAutoStage > 0;
              return (
                <div className="flex items-center gap-1.5" title={
                  switchDisabled
                    ? "请先完成立项并配置 API Key"
                    : fullAutoEnabled
                      ? "关闭：暂停全自动流水线"
                      : "开启：STAGE 1~7 全自动流水线（Gate 通过即自动验收并推进）"
                }>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={fullAutoEnabled}
                    disabled={switchDisabled}
                    onClick={handleToggleFullAuto}
                    className={[
                      "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40",
                      fullAutoEnabled
                        ? "bg-emerald-600"
                        : isError
                          ? "bg-red-700"
                          : "bg-zinc-700",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "pointer-events-none inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform duration-200",
                        fullAutoEnabled ? "translate-x-4" : "translate-x-0.5",
                      ].join(" ")}
                    />
                  </button>
                  <span className={[
                    "text-[11px] font-medium select-none",
                    fullAutoEnabled
                      ? "text-emerald-300"
                      : isError
                        ? "text-red-300"
                        : "text-zinc-400",
                  ].join(" ")}>
                    {fullAutoEnabled
                      ? <>
                          <span className="relative mr-1 inline-flex h-1.5 w-1.5 align-middle">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          </span>
                          自动 S{fullAutoStage || "…"}
                        </>
                      : isError
                        ? `S${fullAutoStage} 出错`
                        : "全自动"}
                  </span>
                </div>
              );
            })()}
            <button
              type="button"
              onClick={() => {
                setBibleDrawerTab("bible");
                setBibleDrawerOpen(true);
              }}
              disabled={!projectId}
              className="rounded-lg border border-zinc-700 px-2.5 py-1.5 text-[11px] font-medium text-zinc-300 transition hover:bg-zinc-800 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
              title="项目设定真源（SSOT）"
            >
              系列圣经
            </button>
            <button
              type="button"
              onClick={() => {
                setBibleDrawerTab("locale");
                setBibleDrawerOpen(true);
              }}
              disabled={!projectId}
              className="rounded-lg border border-zinc-700 px-2.5 py-1.5 text-[11px] font-medium text-zinc-300 transition hover:bg-zinc-800 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
              title="全剧英语对白语体简报（与系列圣经同抽屉）"
            >
              英语简报
            </button>
            <ApiSettingsToolbarButton />
          </div>
        </div>
        {onboardingStatus && onboardingStatus !== "ready" && (
          <div className="border-t border-zinc-800/80 px-4 py-2">
            <div className="rounded border border-amber-800/60 bg-amber-950/40 px-2 py-1.5 text-[10px] text-amber-100/90">
              立项未完成（{onboardingStatus === "pending_setup" ? "待填写" : "策划中"}）。
              <Link
                href={`/project/${projectId}/onboarding`}
                className="ml-1 underline text-indigo-300 hover:text-indigo-200"
              >
                去立项页
              </Link>
            </div>
          </div>
        )}
        {creativeBrief.trim() &&
        !seriesBible.trim() &&
        (messages.length > 0 || artifacts.length > 0) ? (
          <div className="border-t border-zinc-800/80 px-4 py-2">
            <div className="rounded border border-amber-800/60 bg-amber-950/40 px-2 py-1.5 text-[10px] text-amber-100/90">
              检测到已有对话或产物但系列圣经仍为空。请到立项页补生成系列圣经，或在顶栏「系列圣经」抽屉中用 LLM 生成。
              <Link
                href={`/project/${projectId}/onboarding`}
                className="ml-1 underline text-indigo-300 hover:text-indigo-200"
              >
                去立项页
              </Link>
            </div>
          </div>
        ) : null}
      </header>

      <main className="flex flex-1 overflow-hidden">
        <div className="w-[380px] shrink-0 overflow-hidden border-r border-zinc-800">
          <ChatWindow
            ref={chatRef}
            settings={settings}
            messages={messages}
            projectId={projectId}
            projectContext={projectContext}
            onOpenSettings={openSettings}
            onMessagesChange={handleMessagesChange}
            onAssistantDone={handleAssistantDone}
            autoKickoffUserMessage={studioAutoKickoffMessage}
            onLoadingChange={setChatLoading}
          />
        </div>

        <div className="flex min-h-0 min-w-0 flex-1">
          <ArtifactPanel
            projectName={projectName || "未命名项目"}
            hasProject={!!projectId}
            artifacts={artifacts}
            currentStage={currentStage}
            viewStage={viewStage}
            collapsed={panelCollapsed}
            onToggle={() => setPanelCollapsed(!panelCollapsed)}
            onReExtractStage={handleReExtractStage}
            onArtifactUpsert={handleArtifactUpsert}
            onArtifactRemove={handleArtifactRemove}
            onArtifactRemoveSubtree={handleArtifactRemoveSubtree}
            hasApiKey={Boolean(settings.apiKey)}
            chatLoading={chatLoading}
            onStartThisStage={() => handleAutoStartStage(viewStage as 1 | 2 | 3 | 4 | 5 | 6 | 7)}
            pipelineProgress={viewStage === 6 || viewStage === 7 ? pipelineProgress : null}
            onPausePipeline={handlePausePipeline}
            onResumePipeline={handleResumePipeline}
            creativeBrief={creativeBrief}
            seriesBible={seriesBible}
          />
          <StudioProcessRail
            key={projectId || "none"}
            artifacts={artifacts}
            currentStage={currentStage}
            viewStage={viewStage}
            onViewStageChange={setViewStage}
            maxApprovedStage={maxApprovedStage}
            gateOverrideNote={gateOverrideNote}
            onGateOverrideMark={handleGateOverrideMark}
            episodeCount={projectMeta?.episodeCount ? parseTargetEpisodeCount(projectMeta.episodeCount) ?? undefined : undefined}
          />
        </div>
      </main>

      <StudioBibleDrawer
        open={bibleDrawerOpen}
        onClose={() => setBibleDrawerOpen(false)}
        drawerTab={bibleDrawerTab}
        onDrawerTabChange={setBibleDrawerTab}
        hasProject={!!projectId}
        projectId={projectId}
        projectName={projectName || "未命名项目"}
        creativeBrief={creativeBrief}
        settings={settings}
        hasStudioProgress={messages.length > 0 || artifacts.length > 0}
        onOpenSettings={openSettings}
        seriesBible={seriesBible}
        artifacts={artifacts}
        onSeriesBibleChange={handleSeriesBibleChange}
        englishLocaleBrief={englishLocaleBrief}
        onEnglishLocaleBriefChange={handleEnglishLocaleBriefChange}
        localeBriefGenerateEnabled={viewStage >= 6 || maxApprovedStage >= 6}
      />

    </div>
  );
}

export default function StudioPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full min-h-[200px] items-center justify-center bg-zinc-950 text-zinc-500">
          加载中…
        </div>
      }
    >
      <StudioInner />
    </Suspense>
  );
}
