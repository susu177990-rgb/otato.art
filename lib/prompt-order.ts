type PromptOrderItem = { id: string };

export function promotePromptToFront<T extends PromptOrderItem>(items: readonly T[], id: string): T[] {
  const target = items.find((item) => item.id === id);
  if (!target) return [...items];
  return [target, ...items.filter((item) => item.id !== id)];
}

export function promotePromptToLatestForReversedList<T extends PromptOrderItem>(items: readonly T[], id: string): T[] {
  const target = items.find((item) => item.id === id);
  if (!target) return [...items];
  return [...items.filter((item) => item.id !== id), target];
}
