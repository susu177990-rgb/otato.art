"use client";

import { FormEvent, Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import shellStyles from "../shared/shell.module.css";

function LoginInner() {
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error || "登录失败");
        return;
      }
      const next = searchParams.get("next") || "/";
      window.location.assign(next.startsWith("/") ? next : "/");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className={shellStyles.page}>
      <header className={shellStyles.topbar}>
        <div className={shellStyles.topbarLeft}>
          <div className={shellStyles.topbarTagline}>
            <p className={shellStyles.plainDockText}>剧本工作台 · 登录</p>
          </div>
        </div>
      </header>

      <div className={shellStyles.heroWrap}>
        <form
          onSubmit={handleSubmit}
          className={shellStyles.card}
          style={{ width: "min(380px, 100%)" }}
        >
          <div className={shellStyles.cardHead}>
            <div>
              <h1 className={shellStyles.cardTitle}>请输入访问密码</h1>
              <p className={shellStyles.cardSubtitle}>密码由站点管理员设置</p>
            </div>
          </div>

          <label className={shellStyles.field}>
            <span className={shellStyles.fieldLabel}>密码</span>
            <input
              id="site-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              placeholder="输入密码"
              className={shellStyles.input}
            />
          </label>

          {error ? <p className={shellStyles.banner + " " + shellStyles.bannerError}>{error}</p> : null}

          <button
            type="submit"
            disabled={submitting}
            className={[shellStyles.button, shellStyles.buttonPrimary].join(" ")}
          >
            {submitting ? "验证中…" : "进入"}
          </button>
        </form>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className={shellStyles.empty}>加载中…</div>}>
      <LoginInner />
    </Suspense>
  );
}
