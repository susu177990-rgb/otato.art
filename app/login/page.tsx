"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, useActionState, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  loginWithPassword,
  sendPasswordResetEmail,
  signUpWithPassword,
  type AuthFormState,
} from "@/app/login/actions";
import { BRAND_NAME } from "@/lib/branding";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import shellStyles from "../shared/shell.module.css";
import styles from "./login-page.module.css";

type Mode = "login" | "signup" | "reset";

function authErrorFromSearch(value: string | null): string {
  if (value === "auth_callback_failed") return "登录回调无效或已过期，请重新登录。";
  if (value === "oauth_cancelled") return "Google 登录已取消。";
  return "";
}

function localizeOAuthError(message: string): string {
  if (/provider.*not.*enabled|Unsupported provider|provider is not enabled/i.test(message)) {
    return "Google 登录未启用：请在 Supabase Authentication → Providers → Google 开启。";
  }
  if (/redirect|URI is not allowed/i.test(message)) {
    return "Google 登录回调地址未被 Supabase 允许，请把当前域名的 /auth/callback 加入 Redirect URLs。";
  }
  return message;
}

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginState, loginAction, loginPending] = useActionState(loginWithPassword, null);
  const [signupState, signupAction, signupPending] = useActionState(signUpWithPassword, null);
  const [resetState, resetAction, resetPending] = useActionState(sendPasswordResetEmail, null);
  const [localError, setLocalError] = useState("");
  const [localInfo, setLocalInfo] = useState("");
  const [googlePending, setGooglePending] = useState(false);

  const next = searchParams.get("next") || "/";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const formState: AuthFormState = mode === "login" ? loginState : mode === "signup" ? signupState : resetState;
  const error = localError || formState?.error || authErrorFromSearch(searchParams.get("error"));
  const info = localInfo || formState?.info || "";
  const submitting = mode === "login" ? loginPending : mode === "signup" ? signupPending : resetPending;

  const modeCopy = useMemo(() => {
    if (mode === "signup") {
      return {
        title: "创建账号",
        subtitle: "注册后你的项目、会话、画廊和画布会同步到当前账号。",
        submit: "注册",
      };
    }
    if (mode === "reset") {
      return {
        title: "重设密码",
        subtitle: "输入账号邮箱，系统会发送一封重设密码邮件。",
        submit: "发送邮件",
      };
    }
    return {
      title: "登录账号",
      subtitle: "继续使用你的项目、会话、画廊和画布数据。",
      submit: "登录",
    };
  }, [mode]);

  useEffect(() => {
    setLocalError("");
    setLocalInfo("");
  }, [mode, loginState, signupState, resetState]);

  useEffect(() => {
    try {
      const supabase = createSupabaseBrowserClient();
      void supabase.auth.getUser().then(({ data }) => {
        if (data.user) router.replace(safeNext);
      });
    } catch {
      // 缺少 Supabase 环境变量时，提交动作会显示明确错误。
    }
  }, [router, safeNext]);

  async function startGoogleLogin() {
    setGooglePending(true);
    setLocalError("");
    setLocalInfo("");
    try {
      const supabase = createSupabaseBrowserClient();
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext)}`;
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          queryParams: {
            access_type: "offline",
            prompt: "select_account",
          },
        },
      });

      if (oauthError) {
        throw new Error(localizeOAuthError(oauthError.message));
      }

      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      setGooglePending(false);
      setLocalError(error instanceof Error ? error.message : "Google 登录失败");
    }
  }

  return (
    <main className={shellStyles.page}>
      <header className={shellStyles.topbar}>
        <div className={shellStyles.topbarLeft}>
          <Link href="/" className={styles.brandLink}>
            <Image
              src="/oTATo.svg"
              alt={BRAND_NAME}
              width={36}
              height={36}
              className={shellStyles.brandLogo}
              priority
            />
            <span className={shellStyles.brandWordmark}>oTATo Art</span>
          </Link>
        </div>
        <nav className={shellStyles.topnav}>
          <Link href="/" className={shellStyles.navLink}>
            首页
          </Link>
        </nav>
      </header>

      <div className={styles.authBody}>
        <section className={styles.authPanel}>
          <div className={styles.panelHeader}>
            <p className={styles.eyebrow}>{mode === "signup" ? "注册" : mode === "reset" ? "找回密码" : "登录"}</p>
            <h1 className={styles.title}>{modeCopy.title}</h1>
            <p className={styles.subtitle}>{modeCopy.subtitle}</p>
          </div>

          <button
            type="button"
            onClick={() => void startGoogleLogin()}
            disabled={googlePending || submitting}
            className={styles.googleButton}
          >
            <span className={styles.googleMark}>G</span>
            {googlePending ? "正在跳转…" : "使用 Google 继续"}
          </button>

          <div className={styles.divider}>
            <span />
            <p>{mode === "reset" ? "邮箱找回" : "或使用邮箱"}</p>
            <span />
          </div>

          {mode !== "reset" ? (
            <div className={[shellStyles.segmented, styles.modeTabs].join(" ")}>
              <button
                type="button"
                className={[shellStyles.segmentedItem, mode === "login" ? shellStyles.segmentedItemActive : ""]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => setMode("login")}
              >
                登录
              </button>
              <button
                type="button"
                className={[shellStyles.segmentedItem, mode === "signup" ? shellStyles.segmentedItemActive : ""]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => setMode("signup")}
              >
                注册
              </button>
            </div>
          ) : null}

          <form
            action={mode === "login" ? loginAction : mode === "signup" ? signupAction : resetAction}
            className={styles.form}
          >
            <input type="hidden" name="next" value={safeNext} />

            <label className={shellStyles.field}>
              <span className={shellStyles.fieldLabel}>邮箱</span>
              <input
                type="email"
                name="email"
                value={email}
                autoComplete="email"
                required
                onChange={(event) => setEmail(event.target.value)}
                className={shellStyles.input}
                placeholder="you@example.com"
              />
            </label>

            {mode !== "reset" ? (
              <label className={shellStyles.field}>
                <span className={shellStyles.fieldLabel}>密码</span>
                <input
                  type="password"
                  name="password"
                  value={password}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  required
                  minLength={6}
                  onChange={(event) => setPassword(event.target.value)}
                  className={shellStyles.input}
                  placeholder="至少 6 位"
                />
              </label>
            ) : null}

            {error ? <p className={[shellStyles.banner, shellStyles.bannerError].join(" ")}>{error}</p> : null}
            {info ? <p className={[shellStyles.banner, shellStyles.bannerSuccess].join(" ")}>{info}</p> : null}

            <button
              type="submit"
              disabled={submitting || googlePending}
              className={[shellStyles.button, shellStyles.buttonPrimary, styles.submitButton].join(" ")}
            >
              {submitting ? "处理中…" : modeCopy.submit}
            </button>
          </form>

          <div className={styles.panelFooter}>
            {mode === "reset" ? (
              <button type="button" className={styles.textButton} onClick={() => setMode("login")}>
                返回登录
              </button>
            ) : (
              <>
                <button type="button" className={styles.textButton} onClick={() => setMode("reset")}>
                  忘记密码？
                </button>
                <button
                  type="button"
                  className={styles.textButton}
                  onClick={() => setMode(mode === "login" ? "signup" : "login")}
                >
                  {mode === "login" ? "没有账号？注册" : "已有账号？登录"}
                </button>
              </>
            )}
          </div>
        </section>
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
