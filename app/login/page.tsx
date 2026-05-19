"use client";

import { FormEvent, Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import shellStyles from "../shared/shell.module.css";

type Mode = "login" | "signup";

function LoginInner() {
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setInfo("");
    setSubmitting(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const next = searchParams.get("next") || "/";
      const safeNext = next.startsWith("/") ? next : "/";

      if (mode === "signup") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext)}`,
          },
        });
        if (signUpError) {
          setError(signUpError.message);
          return;
        }
        if (data.session) {
          window.location.assign(safeNext);
          return;
        }
        setInfo("注册成功。若启用了邮箱验证，请查收邮件后点击链接登录。");
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) {
        setError(signInError.message);
        return;
      }
      window.location.assign(safeNext);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className={shellStyles.page}>
      <header className={shellStyles.topbar}>
        <div className={shellStyles.topbarLeft}>
          <div className={shellStyles.topbarTagline}>
            <p className={shellStyles.plainDockText}>剧本工作台 · {mode === "login" ? "登录" : "注册"}</p>
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
              <h1 className={shellStyles.cardTitle}>{mode === "login" ? "登录账号" : "注册账号"}</h1>
              <p className={shellStyles.cardSubtitle}>使用邮箱与密码；同一账号多端数据自动同步。</p>
            </div>
          </div>

          <div className={shellStyles.segmented} style={{ marginBottom: 12 }}>
            <button
              type="button"
              className={[shellStyles.segmentedItem, mode === "login" ? shellStyles.segmentedItemActive : ""]
                .filter(Boolean)
                .join(" ")}
              onClick={() => {
                setMode("login");
                setError("");
                setInfo("");
              }}
            >
              登录
            </button>
            <button
              type="button"
              className={[shellStyles.segmentedItem, mode === "signup" ? shellStyles.segmentedItemActive : ""]
                .filter(Boolean)
                .join(" ")}
              onClick={() => {
                setMode("signup");
                setError("");
                setInfo("");
              }}
            >
              注册
            </button>
          </div>

          <label className={shellStyles.field}>
            <span className={shellStyles.fieldLabel}>邮箱</span>
            <input
              type="email"
              value={email}
              autoComplete="email"
              required
              onChange={(e) => setEmail(e.target.value)}
              className={shellStyles.input}
            />
          </label>

          <label className={shellStyles.field}>
            <span className={shellStyles.fieldLabel}>密码</span>
            <input
              type="password"
              value={password}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              required
              minLength={6}
              onChange={(e) => setPassword(e.target.value)}
              className={shellStyles.input}
            />
          </label>

          {error ? <p className={shellStyles.banner + " " + shellStyles.bannerError}>{error}</p> : null}
          {info ? <p className={shellStyles.banner}>{info}</p> : null}

          <button
            type="submit"
            disabled={submitting}
            className={[shellStyles.button, shellStyles.buttonPrimary].join(" ")}
          >
            {submitting ? "处理中…" : mode === "login" ? "登录" : "注册"}
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
