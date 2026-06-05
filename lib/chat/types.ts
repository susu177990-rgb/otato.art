import type { ImageModelId } from "@/lib/image-workspace";

export type ChatAttachmentKind = "image" | "video" | "file";

export interface ChatAttachment {
  kind: ChatAttachmentKind;
  mime: string;
  name: string;
  dataUrl: string;
  registryId?: string;
}

export type ChatMessagePart =
  | { type: "text"; text: string }
  | { type: "attachment"; attachment: ChatAttachment };

export interface ChatToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  createdAt: number;
  parts: ChatMessagePart[];
  toolCallId?: string;
  toolCalls?: ChatToolCall[];
}

export interface SkillDocument {
  name: string;
  markdown: string;
}

export type SkillJsonSchema = Record<string, unknown>;

export interface SkillFormRunResult {
  master_prompt?: string;
  /** 与 master_prompt 相同；兼容 output.json 使用 master_prompt_markdown 的 Skill */
  master_prompt_markdown?: string;
  image_generation_status?: "awaiting_confirmation" | "ready" | "failed";
  confirmation_action?: {
    label?: string;
    generation_mode?: "generate_image";
    uses_prompt_field?: string;
  } | null;
  generated_image_url?: string;
  error?: string;
}

export interface SkillPackRecord {
  id: string;
  /** ZIP 文件名（管理用，不可在设置页修改） */
  title: string;
  /** 对话页左侧 Skill 条显示名；可在设置里修改 */
  displayLabel: string;
  /** 对话页空状态展示的使用说明（Markdown，在设置里填写） */
  chatUsageHint?: string;
  importedAt: number;
  skills: SkillDocument[];
  /** interface/input.json — 存在则 /chat 切换为表单模式 */
  inputSchema?: SkillJsonSchema | null;
  /** interface/output.json */
  outputSchema?: SkillJsonSchema | null;
  /** agent_core/optimized_system_prompt.md — 表单 One-Shot 系统提示词 */
  optimizedSystemPrompt?: string | null;
}

export type ChatMode = "skill" | "prompt";

export interface ConversationAttachmentEntry {
  id: string;
  messageId: string;
  name: string;
  mime: string;
  kind: ChatAttachmentKind;
  createdAt: number;
  dataUrl: string;
}

export interface ChatConversation {
  id: string;
  title: string;
  updatedAt: number;
  messages: ChatMessage[];
  chatMode?: ChatMode;
  /** 当前会话记住的 Skill 选择 */
  selectedSkillPackId?: string | null;
  /** 当前会话记住的对话提示词预设选择 */
  selectedChatPresetId?: string | null;
  attachments?: ConversationAttachmentEntry[];
  /** 对话 Agent 调用 generate_image 时的默认作图模型 */
  preferredImageModelId?: ImageModelId;
}

export interface ChatApiConfig {
  presetId: string;
  modelName: string;
  endpointUrl: string;
  apiKey: string;
}

export interface ChatConversationSummary {
  id: string;
  title: string;
  updatedAt: number;
}
