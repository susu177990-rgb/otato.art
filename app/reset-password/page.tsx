"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState, useState } from "react";
import { updateRecoveredPassword } from "@/app/reset-password/actions";
import { BRAND_NAME } from "@/lib/branding";
import shellStyles from "../shared/shell.module.css";
import loginStyles from "../login/login-page.module.css";

export default function ResetPasswordPage() {
  const [state, action, pending] = useActionState(updateRecoveredPassword, null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  return (
    <main className={shellStyles.page}>
      <header className={shellStyles.topbar}>
        <div className={shellStyles.topbarLeft}>
          <Link href="/" className={loginStyles.brandLink}>
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
      </header>

      <div className={loginStyles.authBody}>
        <section className={loginStyles.authPanel}>
          <div className={loginStyles.panelHeader}>
            <p className={loginStyles.eyebrow}>账号安全</p>
            <h1 className={loginStyles.title}>设置新密码</h1>
            <p className={loginStyles.subtitle}>请为当前账号设置新的登录密码。</p>
          </div>

          <form action={action} className={loginStyles.form}>
            <label className={shellStyles.field}>
              <span className={shellStyles.fieldLabel}>新密码</span>
              <input
                type="password"
                name="password"
                value={password}
                autoComplete="new-password"
                minLength={6}
                required
                onChange={(event) => setPassword(event.target.value)}
                className={shellStyles.input}
              />
            </label>

            <label className={shellStyles.field}>
              <span className={shellStyles.fieldLabel}>确认新密码</span>
              <input
                type="password"
                name="confirmPassword"
                value={confirmPassword}
                autoComplete="new-password"
                minLength={6}
                required
                onChange={(event) => setConfirmPassword(event.target.value)}
                className={shellStyles.input}
              />
            </label>

            {state?.error ? <p className={[shellStyles.banner, shellStyles.bannerError].join(" ")}>{state.error}</p> : null}
            {state?.info ? <p className={[shellStyles.banner, shellStyles.bannerSuccess].join(" ")}>{state.info}</p> : null}

            <button
              type="submit"
              disabled={pending}
              className={[shellStyles.button, shellStyles.buttonPrimary, loginStyles.submitButton].join(" ")}
            >
              {pending ? "正在更新…" : "更新密码"}
            </button>
          </form>

          <div className={loginStyles.panelFooter}>
            <Link href="/login" className={loginStyles.textButton}>
              返回登录
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
