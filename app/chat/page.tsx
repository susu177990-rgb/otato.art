"use client";

import Link from "next/link";
import { Suspense } from "react";
import { ChatWorkspace } from "@/components/chat/ChatWorkspace";
import shellStyles from "../shared/shell.module.css";

export default function ChatPage() {
  return (
    <main className={shellStyles.page}>
      <header className={shellStyles.topbar}>
        <div className={shellStyles.topbarLeft}>
          <Link href="/" className={shellStyles.navLink}>
            返回首页
          </Link>
        </div>
      </header>

      <Suspense fallback={null}>
        <ChatWorkspace />
      </Suspense>
    </main>
  );
}
