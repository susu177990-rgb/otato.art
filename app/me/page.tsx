"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { MeSnapshot } from "@/lib/types";
import shellStyles from "../shared/shell.module.css";
import styles from "./me-page.module.css";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; snapshot: MeSnapshot };

type FormState = {
  pending: boolean;
  error: string;
  success: string;
};

const EMPTY_FORM_STATE: FormState = {
  pending: false,
  error: "",
  success: "",
};

function formatDate(value: string | null): string {
  if (!value) return "暂无";
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return "暂无";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function statusText(confirmed: boolean): string {
  return confirmed ? "已验证" : "未验证";
}

function providerLabel(provider: string): string {
  if (provider === "google") return "Google";
  if (provider === "email") return "邮箱密码";
  return provider || "邮箱密码";
}

function usesPasswordProvider(snapshot: MeSnapshot): boolean {
  return snapshot.user.authProviders.length === 0 || snapshot.user.authProviders.includes("email");
}

function totalAssets(snapshot: MeSnapshot): number {
  return snapshot.stats.imageRecords + snapshot.stats.videoRecords + snapshot.stats.canvasBoards;
}

export default function MePage() {
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [emailForm, setEmailForm] = useState("");
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "" });
  const [emailState, setEmailState] = useState<FormState>(EMPTY_FORM_STATE);
  const [passwordState, setPasswordState] = useState<FormState>(EMPTY_FORM_STATE);
  const [logoutPending, setLogoutPending] = useState(false);

  async function loadMe() {
    setLoadState({ status: "loading" });
    try {
      const res = await fetch("/api/me", { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as Partial<MeSnapshot> & { error?: string };
      if (!res.ok) throw new Error(data.error || "读取账号信息失败");
      const snapshot = data as MeSnapshot;
      setLoadState({ status: "ready", snapshot });
      setEmailForm(snapshot.user.email === "暂无" ? "" : snapshot.user.email);
    } catch (error) {
      setLoadState({
        status: "error",
        message: error instanceof Error ? error.message : "读取账号信息失败",
      });
    }
  }

  useEffect(() => {
    void loadMe();
  }, []);

  async function submitPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordState({ pending: true, error: "", success: "" });
    try {
      const res = await fetch("/api/me/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(passwordForm),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok) throw new Error(data.error || "修改密码失败");
      setPasswordState({ pending: false, error: "", success: data.message || "密码已更新" });
      setPasswordForm({ currentPassword: "", newPassword: "" });
    } catch (error) {
      setPasswordState({
        pending: false,
        error: error instanceof Error ? error.message : "修改密码失败",
        success: "",
      });
    }
  }

  async function submitEmail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEmailState({ pending: true, error: "", success: "" });
    try {
      const res = await fetch("/api/me/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newEmail: emailForm }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok) throw new Error(data.error || "修改邮箱失败");
      setEmailState({ pending: false, error: "", success: data.message || "确认邮件已发送" });
      await loadMe();
    } catch (error) {
      setEmailState({
        pending: false,
        error: error instanceof Error ? error.message : "修改邮箱失败",
        success: "",
      });
    }
  }

  async function logout() {
    setLogoutPending(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.href = "/login";
    } finally {
      setLogoutPending(false);
    }
  }

  return (
    <main className={[shellStyles.page, styles.mePage].join(" ")}>
      <header className={[shellStyles.topbar, styles.meTopbar].join(" ")}>
        <div className={[shellStyles.topbarLeft, styles.meTopbarLeft].join(" ")}>
          <div className={shellStyles.topbarTagline}>
            <Link href="/projects" className={shellStyles.navLink}>
              返回项目
            </Link>
          </div>
        </div>
      </header>

      <div className={[shellStyles.body, shellStyles.bodyTight].join(" ")}>
        <div className={[shellStyles.shell, shellStyles.shellWide, styles.stack].join(" ")}>
          {loadState.status === "loading" ? <div className={shellStyles.empty}>正在加载账号信息…</div> : null}
          {loadState.status === "error" ? (
            <div className={[shellStyles.banner, shellStyles.bannerError].join(" ")}>{loadState.message}</div>
          ) : null}

          {loadState.status === "ready" ? (
            <>
              <section className={[shellStyles.card, styles.heroCard].join(" ")}>
                <div className={styles.heroHeader}>
                  <div className={styles.heroCopy}>
                    <h1 className={shellStyles.cardTitle} style={{ fontSize: 24 }}>
                      我的账号
                    </h1>
                    <p className={shellStyles.cardSubtitle} style={{ fontSize: 13 }}>
                      管理你的登录身份、安全信息，以及你在当前工作台里的个人数据使用情况。
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={logout}
                    disabled={logoutPending}
                    className={[shellStyles.button, shellStyles.buttonDanger, styles.logoutBtn].join(" ")}
                  >
                    {logoutPending ? "退出中…" : "退出登录"}
                  </button>
                </div>
                <div className={styles.heroMeta}>
                  <span
                    className={[
                      shellStyles.metaPill,
                      styles.heroMetaPill,
                      loadState.snapshot.user.emailConfirmed ? shellStyles.metaPillOk : shellStyles.metaPillMute,
                    ].join(" ")}
                  >
                    邮箱 {statusText(loadState.snapshot.user.emailConfirmed)}
                  </span>
                  <span className={[shellStyles.metaPill, styles.heroMetaPill].join(" ")}>
                    登录方式 {loadState.snapshot.user.authProviders.map(providerLabel).join(" / ") || "邮箱密码"}
                  </span>
                  <span className={[shellStyles.metaPill, styles.heroMetaPill].join(" ")}>
                    项目 {loadState.snapshot.stats.projects}
                  </span>
                  <span className={[shellStyles.metaPill, styles.heroMetaPill].join(" ")}>
                    会话 {loadState.snapshot.stats.chatConversations}
                  </span>
                  <span className={[shellStyles.metaPill, styles.heroMetaPill].join(" ")}>
                    资产 {totalAssets(loadState.snapshot)}
                  </span>
                </div>
              </section>

              <section className={styles.sectionGrid}>
                <div className={styles.sectionColumn}>
                  <section className={[shellStyles.card, styles.flexCard].join(" ")}>
                    <div className={shellStyles.cardHead}>
                      <div>
                        <h2 className={shellStyles.cardTitle}>账号概览</h2>
                        <p className={shellStyles.cardSubtitle}>查看当前登录信息与账号状态。</p>
                      </div>
                    </div>

                    <div className={styles.grid}>
                      <div className={styles.kvCard}>
                        <span className={styles.kvLabel}>登录邮箱</span>
                        <span className={styles.kvValue}>{loadState.snapshot.user.email || "暂无"}</span>
                      </div>
                      <div className={styles.kvCard}>
                        <span className={styles.kvLabel}>邮箱状态</span>
                        <span className={styles.kvValue}>{statusText(loadState.snapshot.user.emailConfirmed)}</span>
                      </div>
                      <div className={styles.kvCard}>
                        <span className={styles.kvLabel}>登录方式</span>
                        <span className={styles.kvValue}>
                          {loadState.snapshot.user.authProviders.map(providerLabel).join(" / ") || "邮箱密码"}
                        </span>
                      </div>
                      <div className={styles.kvCard}>
                        <span className={styles.kvLabel}>注册时间</span>
                        <span className={styles.kvValue}>{formatDate(loadState.snapshot.user.createdAt)}</span>
                      </div>
                      <div className={styles.kvCard}>
                        <span className={styles.kvLabel}>最近登录</span>
                        <span className={styles.kvValue}>{formatDate(loadState.snapshot.user.lastSignInAt)}</span>
                      </div>
                    </div>
                  </section>
                </div>

                <div className={styles.sectionColumn}>
                  <section className={[shellStyles.card, styles.flexCard].join(" ")}>
                    <div className={shellStyles.cardHead}>
                      <div>
                        <h2 className={shellStyles.cardTitle}>我的数据概览</h2>
                        <p className={shellStyles.cardSubtitle}>这些数字只统计当前登录账号自己拥有的记录。</p>
                      </div>
                    </div>
                    <div className={styles.statsGrid}>
                      <div className={styles.statCard}>
                        <span className={styles.statNumber}>{loadState.snapshot.stats.projects}</span>
                        <span className={styles.statLabel}>项目数</span>
                      </div>
                      <div className={styles.statCard}>
                        <span className={styles.statNumber}>{loadState.snapshot.stats.chatConversations}</span>
                        <span className={styles.statLabel}>对话会话数</span>
                      </div>
                      <div className={styles.statCard}>
                        <span className={styles.statNumber}>{loadState.snapshot.stats.imageRecords}</span>
                        <span className={styles.statLabel}>图片记录</span>
                      </div>
                      <div className={styles.statCard}>
                        <span className={styles.statNumber}>{loadState.snapshot.stats.videoRecords}</span>
                        <span className={styles.statLabel}>视频记录</span>
                      </div>
                      <div className={styles.statCard}>
                        <span className={styles.statNumber}>{loadState.snapshot.stats.canvasBoards}</span>
                        <span className={styles.statLabel}>画布数</span>
                      </div>
                    </div>
                    <p className={styles.dataLegend}>这里只统计当前账号自己的创作数据。</p>
                  </section>

                </div>
              </section>

              <section className={styles.sectionGrid}>
                <div className={styles.sectionColumn}>
                  <section className={[shellStyles.card, styles.accountFormCard].join(" ")}>
                    <form onSubmit={submitPassword} className={styles.accountForm}>
                      <div className={styles.accountFormHeader}>
                        <h2 className={shellStyles.cardTitle}>
                          {usesPasswordProvider(loadState.snapshot) ? "修改密码" : "设置邮箱密码"}
                        </h2>
                        <p className={shellStyles.cardSubtitle}>
                          {usesPasswordProvider(loadState.snapshot)
                            ? "需要先验证当前密码，再允许切换到新密码。"
                            : "当前账号由 Google 登录；设置密码后，也可以用邮箱密码登录。"}
                        </p>
                      </div>
                      <div className={styles.passwordFields}>
                        {usesPasswordProvider(loadState.snapshot) ? (
                          <label className={shellStyles.field}>
                            <span className={shellStyles.fieldLabel}>当前密码</span>
                            <input
                              className={shellStyles.input}
                              type="password"
                              value={passwordForm.currentPassword}
                              autoComplete="current-password"
                              onChange={(event) =>
                                setPasswordForm((prev) => ({ ...prev, currentPassword: event.target.value }))
                              }
                              required
                            />
                          </label>
                        ) : null}
                        <label className={shellStyles.field}>
                          <span className={shellStyles.fieldLabel}>新密码</span>
                          <input
                            className={shellStyles.input}
                            type="password"
                            value={passwordForm.newPassword}
                            autoComplete="new-password"
                            minLength={6}
                            onChange={(event) =>
                              setPasswordForm((prev) => ({ ...prev, newPassword: event.target.value }))
                            }
                            required
                          />
                        </label>
                      </div>
                      {passwordState.error ? (
                        <p className={[shellStyles.banner, shellStyles.bannerError, styles.inlineStatus].join(" ")}>
                          {passwordState.error}
                        </p>
                      ) : null}
                      {passwordState.success ? (
                        <p className={[shellStyles.banner, shellStyles.bannerSuccess, styles.inlineStatus].join(" ")}>
                          {passwordState.success}
                        </p>
                      ) : null}
                      <div className={styles.formFooter}>
                        <button
                          type="submit"
                          disabled={passwordState.pending}
                          className={[shellStyles.button, shellStyles.buttonPrimary].join(" ")}
                        >
                          {passwordState.pending ? "正在修改…" : "更新密码"}
                        </button>
                      </div>
                    </form>
                  </section>
                </div>

                <div className={styles.sectionColumn}>
                  <section className={[shellStyles.card, styles.accountFormCard].join(" ")}>
                    <form onSubmit={submitEmail} className={styles.accountForm}>
                      <div className={styles.accountFormHeader}>
                        <h2 className={shellStyles.cardTitle}>修改登录邮箱</h2>
                        <p className={shellStyles.cardSubtitle}>提交后会向新邮箱发送确认链接，确认前旧邮箱仍然有效。</p>
                      </div>
                      <div className={styles.formFields}>
                        <label className={shellStyles.field}>
                          <span className={shellStyles.fieldLabel}>新登录邮箱</span>
                          <input
                            className={shellStyles.input}
                            type="email"
                            value={emailForm}
                            autoComplete="email"
                            onChange={(event) => setEmailForm(event.target.value)}
                            required
                          />
                        </label>
                      </div>
                      {emailState.error ? (
                        <p className={[shellStyles.banner, shellStyles.bannerError, styles.inlineStatus].join(" ")}>
                          {emailState.error}
                        </p>
                      ) : null}
                      {emailState.success ? (
                        <p className={[shellStyles.banner, shellStyles.bannerSuccess, styles.inlineStatus].join(" ")}>
                          {emailState.success}
                        </p>
                      ) : null}
                      <div className={styles.formFooter}>
                        <button
                          type="submit"
                          disabled={emailState.pending}
                          className={[shellStyles.button, shellStyles.buttonPrimary].join(" ")}
                        >
                          {emailState.pending ? "正在提交…" : "发送确认邮件"}
                        </button>
                      </div>
                    </form>
                  </section>
                </div>
              </section>
            </>
          ) : null}
        </div>
      </div>
    </main>
  );
}
