"use client";

import Link from "next/link";
import { Suspense } from "react";
import { ApiUsageModeSwitch } from "@/components/ApiUsageModeSwitch";
import { ChatWorkspace } from "@/components/chat/ChatWorkspace";
import shellStyles from "../shared/shell.module.css";

const OPEN_CHAT_PROMPT_PRESETS_EVENT = "otato:open-chat-prompt-presets";

export default function ChatPage() {
  return (
    <main className={shellStyles.page}>
      <header className={shellStyles.topbar}>
        <div className={shellStyles.topbarLeft}>
          <Link href="/" className={shellStyles.navLink}>
            返回首页
          </Link>
          <button
            type="button"
            className={shellStyles.navLink}
            onClick={() => window.dispatchEvent(new Event(OPEN_CHAT_PROMPT_PRESETS_EVENT))}
          >
            提示词预设
          </button>
        </div>
        <div className={shellStyles.topnav}>
          <ApiUsageModeSwitch module="llm" />
        </div>
      </header>

      <Suspense fallback={null}>
        <ChatWorkspace />
      </Suspense>
    </main>
  );
}
