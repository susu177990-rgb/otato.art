"use client";

import Link from "next/link";
import { ChatWorkspace } from "@/components/chat/ChatWorkspace";
import shellStyles from "../shared/shell.module.css";

export default function ChatPage() {
  return (
    <main className={shellStyles.page}>
      <header className={shellStyles.topbar}>
        <div className={shellStyles.topbarLeft}>
          <Link href="/" className={[shellStyles.plainDockText, shellStyles.dockTextLink].join(" ")}>
            返回首页
          </Link>
          <div className={shellStyles.topbarTagline}>
            <p className={shellStyles.plainDockText}>对话</p>
          </div>
        </div>
      </header>

      <ChatWorkspace />
    </main>
  );
}
