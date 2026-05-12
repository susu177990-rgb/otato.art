import type { KeyboardEvent as ReactKeyboardEvent } from "react";

/**
 * 是否为输入法（IME）组合或选词过程中的按键。
 * 此时按 Enter 应用于上屏/选词，不应触发「发送消息」等逻辑。
 */
export function isImeCompositionKeyEvent(e: ReactKeyboardEvent): boolean {
  if (e.nativeEvent.isComposing) return true;
  const ke = e.nativeEvent as globalThis.KeyboardEvent;
  return ke.keyCode === 229;
}
