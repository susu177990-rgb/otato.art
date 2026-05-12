"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * 消息列表变化后将滚动容器贴底。
 * 流式输出时若用 scrollIntoView({ behavior: "smooth" })，每条 chunk 都会启动动画，多条动画叠加会来回抽搐；
 * 这里改为对 overflow 容器直接设置 scrollTop（同步、无动画竞争）。
 */
export function useMessagesScrollEnd(messages: unknown[]) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  return scrollRef;
}
