export interface Settings {
  apiUrl: string;
  apiKey: string;
  model: string;
}

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

/** 立项时填写的剧作元数据 */
export interface ProjectMeta {
  seriesTitle: string;
  episodeCount: string;
  episodeDurationMinutes: number | null;
  targetMarket: string;
  dialogueLanguage: string;
  extraNotes: string;
}

export type SourceMaterialKind = "paste" | "txt" | "md" | "docx" | "pdf";

export interface SourceMaterial {
  id: string;
  kind: SourceMaterialKind;
  label: string;
  text: string;
  createdAt: string;
}

export type OnboardingStatus = "pending_setup" | "planning" | "ready";

/** 立项模式：原创或改编（缺省视为 original，兼容旧数据） */
export type OriginMode = "original" | "adaptation";

/** 改编立项阶段（仅 originMode === adaptation 时使用） */
export type AdaptationPhase =
  | "idle"
  | "upload"
  | "analyzed"
  | "discuss"
  | "planner"
  | "meta"
  | "ready";

export interface Artifact {
  stage: number;
  subKey: string;
  label: string;
  content: string;
  updatedAt: string;
  parentKey?: string;
}

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  currentStage: number;
  messages: Message[];
  artifacts: Artifact[];
  /** 项目级系列圣经（设定真源，与全局 knowledge/03 模板区分） */
  seriesBible?: string;
  /** 工程侧已验收的最高阶段（0 表示尚未确认） */
  maxApprovedStage?: number;
  /** 「未达标仍标记验收」等说明，可选审计 */
  gateOverrideNote?: string;
  /** 立项元数据（剧名、集数、市场等） */
  meta?: ProjectMeta;
  /** 上传/粘贴的素材正文（仅存纯文本） */
  sourceMaterials?: SourceMaterial[];
  /** 立项向导与策划流程状态；旧数据无此字段时视为 ready */
  onboardingStatus?: OnboardingStatus;
  /** 策划对齐后的创作思路摘要（Markdown） */
  creativeBrief?: string;
  /** 全剧一份：英语对白 Locale 简报（Markdown），STAGE 7 语体 SSOT */
  englishLocaleBrief?: string;
  /** 策划阶段专用对话，与编剧室 messages 分离 */
  planningMessages?: Message[];
  /** 立项模式：原创 / 改编 */
  originMode?: OriginMode;
  /** 改编：单次分析原文得到的 Markdown（大纲、人物等） */
  sourceAnalysis?: string;
  /** 改编：改编策略讨论线程，与 planningMessages 分离 */
  adaptationMessages?: Message[];
  /** 改编：当前向导阶段 */
  adaptationPhase?: AdaptationPhase;
}

export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: string;
  currentStage: number;
  onboardingStatus?: OnboardingStatus;
  originMode?: OriginMode;
}

/** 公司内部默认网关与 Key；模型可被用户改为快捷列表中的其它项并存入 localStorage。 */
export const DEFAULT_SETTINGS: Settings = {
  apiUrl: "https://api.bltcy.ai/v1/chat/completions",
  apiKey: "sk-jxPGXe4BdXYbsYbweWRUHTkNMiS6fm3OTTOgfssStrLKiN6S",
  model: "gpt-5.4-mini",
};

export const STAGES = [
  { id: 1, label: "梗概", key: "synopsis" },
  { id: 2, label: "人物", key: "characters" },
  { id: 3, label: "三幕", key: "structure" },
  { id: 4, label: "事件", key: "events" },
  { id: 5, label: "设定集", key: "settings" },
  { id: 6, label: "大纲", key: "outlines" },
  { id: 7, label: "分集", key: "episodes" },
] as const;

export const STAGE_LABELS: Record<number, string> = {
  1: "剧情梗概",
  2: "核心人物小传",
  3: "三幕式结构",
  4: "核心事件",
  5: "设定集",
  6: "分集大纲",
  7: "分集剧本",
};
