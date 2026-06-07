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
    <main className={shellStyles.page}>
      <header className={shellStyles.topbar}>
        <div className={shellStyles.topbarLeft}>
          <div className={shellStyles.topbarTagline}>
            <Link href="/" className={[shellStyles.plainDockText, shellStyles.dockTextLink].join(" ")}>
              返回首页
            </Link>
          </div>
        </div>
        <nav className={shellStyles.topnav}>
          <Link href="/me" className={[shellStyles.navLink, shellStyles.navLinkActive].join(" ")}>
            我的
          </Link>
        </nav>
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
                <div className={styles.heroCopy}>
                  <h1 className={shellStyles.cardTitle} style={{ fontSize: 24 }}>
                    我的账号
                  </h1>
                  <p className={shellStyles.cardSubtitle} style={{ fontSize: 13 }}>
                    管理你的登录身份、安全信息，以及你在当前工作台里的个人数据使用情况。
                  </p>
                </div>
                <div className={styles.heroMeta}>
                  <span
                    className={[
                      shellStyles.metaPill,
                      loadState.snapshot.user.emailConfirmed ? shellStyles.metaPillOk : shellStyles.metaPillMute,
                    ].join(" ")}
                  >
                    邮箱 {statusText(loadState.snapshot.user.emailConfirmed)}
                  </span>
                  <span className={shellStyles.metaPill}>项目 {loadState.snapshot.stats.projects}</span>
                  <span className={shellStyles.metaPill}>会话 {loadState.snapshot.stats.chatConversations}</span>
                  <span className={shellStyles.metaPill}>资产 {totalAssets(loadState.snapshot)}</span>
                </div>
              </section>

              <section className={styles.sectionGrid}>
                <div className={styles.sectionColumn}>
                  <section className={shellStyles.card}>
                    <div className={shellStyles.cardHead}>
                      <div>
                        <h2 className={shellStyles.cardTitle}>账号概览</h2>
                        <p className={shellStyles.cardSubtitle}>当前账号信息直接读取自 Supabase Auth，没有再维护第二套个人资料表。</p>
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
                        <span className={styles.kvLabel}>注册时间</span>
                        <span className={styles.kvValue}>{formatDate(loadState.snapshot.user.createdAt)}</span>
                      </div>
                      <div className={styles.kvCard}>
                        <span className={styles.kvLabel}>最近登录</span>
                        <span className={styles.kvValue}>{formatDate(loadState.snapshot.user.lastSignInAt)}</span>
                      </div>
                      <div className={styles.kvCard}>
                        <span className={styles.kvLabel}>用户 ID</span>
                        <span className={[styles.kvValue, styles.idValue, shellStyles.mono].join(" ")}>
                          {loadState.snapshot.user.id}
                        </span>
                      </div>
                    </div>
                  </section>

                  <section className={shellStyles.card}>
                    <div className={shellStyles.cardHead}>
                      <div>
                        <h2 className={shellStyles.cardTitle}>安全</h2>
                        <p className={shellStyles.cardSubtitle}>密码和邮箱都在当前账号内处理，不影响系统共享设置。</p>
                      </div>
                    </div>

                    <div className={styles.securityStack}>
                      <form onSubmit={submitPassword} className={styles.subCard}>
                        <div className={styles.subCardHeader}>
                          <h3 className={styles.subCardTitle}>修改密码</h3>
                          <p className={styles.subCardText}>需要先验证当前密码，再允许切换到新密码。</p>
                        </div>
                        <div className={shellStyles.row}>
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
                        <div className={styles.actions}>
                          <button
                            type="submit"
                            disabled={passwordState.pending}
                            className={[shellStyles.button, shellStyles.buttonPrimary].join(" ")}
                          >
                            {passwordState.pending ? "正在修改…" : "更新密码"}
                          </button>
                        </div>
                      </form>

                      <form onSubmit={submitEmail} className={styles.subCard}>
                        <div className={styles.subCardHeader}>
                          <h3 className={styles.subCardTitle}>修改登录邮箱</h3>
                          <p className={styles.subCardText}>提交后会向新邮箱发送确认链接，确认前旧邮箱仍然有效。</p>
                        </div>
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
                        <div className={styles.actions}>
                          <button
                            type="submit"
                            disabled={emailState.pending}
                            className={[shellStyles.button, shellStyles.buttonPrimary].join(" ")}
                          >
                            {emailState.pending ? "正在提交…" : "发送确认邮件"}
                          </button>
                        </div>
                      </form>
                    </div>
                    <div className={styles.actions}>
                      <button
                        type="button"
                        onClick={logout}
                        disabled={logoutPending}
                        className={[shellStyles.button, shellStyles.buttonDanger].join(" ")}
                      >
                        {logoutPending ? "退出中…" : "退出登录"}
                      </button>
                    </div>
                  </section>
                </div>

                <div className={styles.sectionColumn}>
                  <section className={shellStyles.card}>
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
                    <p className={styles.dataLegend}>
                      这里是账户视角的使用概览，不承担项目运营后台或账单面板的职责。
                    </p>
                  </section>

                  <section className={shellStyles.card}>
                    <div className={shellStyles.cardHead}>
                      <div>
                        <h2 className={shellStyles.cardTitle}>账户说明</h2>
                        <p className={shellStyles.cardSubtitle}>把边界讲清楚，避免误以为这里已经接管整套 SaaS 后台。</p>
                      </div>
                    </div>
                    <div className={styles.noteStack}>
                      <div className={[shellStyles.banner, shellStyles.bannerInfo].join(" ")}>
                        系统设置页 <code>/settings</code> 目前仍然是登录用户共享配置，不属于你的个人私有设置。
                      </div>
                      <div className={[shellStyles.banner, shellStyles.bannerWarn].join(" ")}>
                        修改登录邮箱后，必须去新邮箱完成确认；确认前，系统仍然按旧邮箱识别当前账号。
                      </div>
                      <div className={[shellStyles.banner, shellStyles.bannerInfo].join(" ")}>
                        这次没有引入团队、账单、订阅、头像、公开主页，也没有把共享配置切成个人工作区。
                      </div>
                    </div>
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
