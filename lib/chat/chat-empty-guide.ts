/** 未选 Skill（「无」）时对话页空状态文案 */
export const CHAT_NO_SKILL_GUIDE = `## 对话

左侧选 **「无」** 为通用对话，不注入 Skill 文档。

选择某个 **Skill** 后，此处显示设置页里填写的使用说明。`;

export const CHAT_NO_PROMPT_GUIDE = `## 对话

左侧可选择一个 **对话提示词预设**，为当前会话补充系统级风格和约束。

如果保持 **未选择**，当前会话就是普通对话，不额外挂任何提示词预设。`;

export function buildChatEmptyGuideMarkdown(
  pack: { displayLabel: string; chatUsageHint?: string } | null | undefined,
): string {
  if (!pack) return CHAT_NO_SKILL_GUIDE;
  const hint = pack.chatUsageHint?.trim();
  if (hint) return hint;
  const name = pack.displayLabel.trim() || "该 Skill";
  return `## ${name}

尚未填写对话页说明。请前往 **设置 → skill → Skill设置** 编辑「对话页说明」。`;
}

export function buildChatPromptPresetGuideMarkdown(
  preset: { title: string; promptTemplate?: string } | null | undefined,
): string {
  if (!preset) return CHAT_NO_PROMPT_GUIDE;
  const title = preset.title.trim() || "对话提示词预设";
  return `## ${title}

当前会话会挂载这个对话提示词预设。

如需修改内容，请前往 **设置 → 预设库 → 对话提示词预设**。`;
}
