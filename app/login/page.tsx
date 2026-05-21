"use client";

import { Suspense, useActionState, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { loginWithPassword, signUpWithPassword, type AuthFormState } from "@/app/login/actions";
import { BRAND_NAME } from "@/lib/branding";
import shellStyles from "../shared/shell.module.css";

type Mode = "login" | "signup";

function LoginInner() {
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginState, loginAction, loginPending] = useActionState(loginWithPassword, null);
  const [signupState, signupAction, signupPending] = useActionState(signUpWithPassword, null);
  const [localError, setLocalError] = useState("");
  const [localInfo, setLocalInfo] = useState("");

  const next = searchParams.get("next") || "/";
  const safeNext = next.startsWith("/") ? next : "/";
  const formState: AuthFormState = mode === "login" ? loginState : signupState;
  const error =
    localError ||
    formState?.error ||
    (searchParams.get("error") === "auth_callback_failed" ? "邮箱验证链接无效或已过期，请重新登录。" : "");
  const info = localInfo || formState?.info || "";
  const submitting = mode === "login" ? loginPending : signupPending;

  useEffect(() => {
    setLocalError("");
    setLocalInfo("");
  }, [mode, loginState, signupState]);

  return (
    <main className={shellStyles.page}>
      <header className={shellStyles.topbar}>
        <div className={shellStyles.topbarLeft}>
          <div className={shellStyles.topbarTagline}>
            <p className={shellStyles.plainDockText}>
              {BRAND_NAME} · {mode === "login" ? "登录" : "注册"}
            </p>
          </div>
        </div>
      </header>

      <div className={shellStyles.heroWrap}>
        <form
          action={mode === "login" ? loginAction : signupAction}
          className={shellStyles.card}
          style={{ width: "min(380px, 100%)" }}
        >
          <input type="hidden" name="next" value={safeNext} />
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
                setLocalError("");
                setLocalInfo("");
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
                setLocalError("");
                setLocalInfo("");
              }}
            >
              注册
            </button>
          </div>

          <label className={shellStyles.field}>
            <span className={shellStyles.fieldLabel}>邮箱</span>
            <input
              type="email"
              name="email"
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
              name="password"
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
