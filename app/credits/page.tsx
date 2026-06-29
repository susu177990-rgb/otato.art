"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import shellStyles from "@/app/shared/shell.module.css";
import styles from "./credits-page.module.css";

type CreditAccount = {
  availableCredits: number;
  reservedCredits: number;
  lifetimePurchasedCredits: number;
  lifetimeBonusCredits: number;
  lifetimeSpentCredits: number;
};

type CreditLedgerEntry = {
  id: string;
  entryType: string;
  amountCredits: number;
  availableBalanceAfter: number;
  reservedBalanceAfter: number;
  createdAt: string;
};

type CreditOrder = {
  id: string;
  status: string;
  currency: string;
  amountCents: number;
  credits: number;
  bonusCredits: number;
  createdAt: string;
  paidAt: string | null;
};

type CreditPackage = {
  id: string;
  label: string;
  currency: string;
  amountCents: number;
  credits: number;
  bonusCredits: number;
  enabled: boolean;
};

type CreditPackagePayload = {
  packages?: CreditPackage[];
  paymentsEnabled?: boolean;
  error?: string;
};

type ContactQrPayload = {
  imageUrl?: string;
  canUpload?: boolean;
  error?: string;
};

type CreditsSnapshot = {
  account: CreditAccount;
  recentLedger: CreditLedgerEntry[];
  recentOrders: CreditOrder[];
};

function formatMoney(currency: string, amountCents: number): string {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amountCents / 100);
}

function formatDate(value: string | null): string {
  if (!value) return "暂无";
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return "暂无";
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(timestamp));
}

function statusLabel(status: string): string {
  if (status === "paid") return "已到账";
  if (status === "pending") return "待支付";
  if (status === "failed") return "失败";
  if (status === "canceled") return "已取消";
  if (status === "refund_review") return "退款待处理";
  return status;
}

function ledgerTypeLabel(value: string): string {
  if (value === "purchase_granted") return "充值到账";
  if (value === "admin_adjustment") return "后台调整";
  if (value === "bonus_granted") return "赠送到账";
  if (value === "welcome_bonus_granted") return "注册送积分";
  if (value === "reservation_created") return "生成冻结";
  if (value === "reservation_released") return "失败释放";
  if (value === "reservation_captured") return "成功扣费";
  if (value === "refund_marked") return "退款标记";
  return value;
}

function packageName(value: string): string {
  if (value === "Starter") return "入门包";
  if (value === "Creator") return "创作者包";
  if (value === "Studio") return "工作室包";
  if (value === "Pro") return "专业包";
  return value;
}

function CreditsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = searchParams.get("order");
  const returnStatus = searchParams.get("status");
  const rawReturnTo = searchParams.get("returnTo");
  const returnTo = rawReturnTo && rawReturnTo.startsWith("/") && !rawReturnTo.startsWith("//") ? rawReturnTo : null;
  const contactQrInputRef = useRef<HTMLInputElement>(null);
  const [snapshot, setSnapshot] = useState<CreditsSnapshot | null>(null);
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [paymentsEnabled, setPaymentsEnabled] = useState(false);
  const [contactQrUrl, setContactQrUrl] = useState("/api/credits/contact-qr/image");
  const [canUploadContactQr, setCanUploadContactQr] = useState(false);
  const [contactQrUploading, setContactQrUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [meRes, packagesRes, qrRes] = await Promise.all([
        fetch("/api/credits/me", { cache: "no-store" }),
        fetch("/api/credits/packages", { cache: "no-store" }),
        fetch("/api/credits/contact-qr", { cache: "no-store" }),
      ]);
      const me = (await meRes.json().catch(() => ({}))) as CreditsSnapshot & { error?: string };
      const packagePayload = (await packagesRes.json().catch(() => ({}))) as CreditPackagePayload;
      const qrPayload = (await qrRes.json().catch(() => ({}))) as ContactQrPayload;
      if (!meRes.ok) throw new Error(me.error || "读取积分账户失败");
      if (!packagesRes.ok) throw new Error(packagePayload.error || "读取充值套餐失败");
      setSnapshot(me);
      setPackages(packagePayload.packages ?? []);
      setPaymentsEnabled(Boolean(packagePayload.paymentsEnabled));
      if (qrRes.ok) {
        setContactQrUrl(qrPayload.imageUrl || "/api/credits/contact-qr/image");
        setCanUploadContactQr(Boolean(qrPayload.canUpload));
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "读取积分账户失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!orderId || returnStatus !== "success") return;
    const activeOrderId = orderId;
    setMessage("正在确认 Stripe 支付结果…");
    let stopped = false;
    let attempts = 0;
    async function pollOrder() {
      while (!stopped && attempts < 10) {
        attempts += 1;
        const response = await fetch(`/api/credits/orders/${encodeURIComponent(activeOrderId)}`, { cache: "no-store" });
        const payload = (await response.json().catch(() => ({}))) as { order?: CreditOrder };
        if (payload.order?.status === "paid") {
          setMessage("充值已到账。");
          await load();
          return;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 1000));
      }
      if (!stopped) {
        setMessage("到账可能延迟，请稍后刷新。");
        await load();
      }
    }
    void pollOrder();
    return () => {
      stopped = true;
    };
  }, [load, orderId, returnStatus]);

  async function startCheckout(packageId: string) {
    if (!paymentsEnabled) {
      setMessage("在线支付暂未开放，请扫码添加微信后联系充值。");
      return;
    }
    setCheckoutLoading(packageId);
    setError("");
    try {
      const response = await fetch("/api/credits/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId, returnTo }),
      });
      const payload = (await response.json().catch(() => ({}))) as { checkoutUrl?: string; error?: string };
      if (!response.ok || !payload.checkoutUrl) throw new Error(payload.error || "创建支付订单失败");
      window.location.href = payload.checkoutUrl;
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "创建支付订单失败");
      setCheckoutLoading(null);
    }
  }

  async function uploadContactQr(file: File | undefined) {
    if (!file) return;
    setContactQrUploading(true);
    setError("");
    setMessage("");
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/credits/contact-qr", {
        method: "POST",
        body: form,
      });
      const payload = (await response.json().catch(() => ({}))) as ContactQrPayload;
      if (!response.ok) throw new Error(payload.error || "上传二维码失败");
      setContactQrUrl(payload.imageUrl || `/api/credits/contact-qr/image?v=${Date.now()}`);
      setCanUploadContactQr(Boolean(payload.canUpload));
      setMessage("充值二维码已更新。");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "上传二维码失败");
    } finally {
      setContactQrUploading(false);
      if (contactQrInputRef.current) contactQrInputRef.current.value = "";
    }
  }

  const account = snapshot?.account;
  const totalRecharge = useMemo(
    () => (account ? account.lifetimePurchasedCredits + account.lifetimeBonusCredits : 0),
    [account],
  );
  const visibleOrders = snapshot?.recentOrders.slice(0, 4) ?? [];
  const visibleLedger = snapshot?.recentLedger.slice(0, 8) ?? [];

  return (
    <main className={[shellStyles.page, styles.creditsPage].join(" ")}>
      <header className={shellStyles.topbar}>
        <div className={shellStyles.topbarLeft}>
          <button
            type="button"
            onClick={() => {
              if (window.history.length > 1) router.back();
              else router.replace("/projects");
            }}
            className={shellStyles.navLink}
          >
            返回
          </button>
          <Link href="/me" className={shellStyles.navLink}>我的</Link>
        </div>
      </header>

      <div className={[shellStyles.body, shellStyles.bodyTight].join(" ")}>
        <div className={[shellStyles.shell, shellStyles.shellWide, styles.stack].join(" ")}>
          {loading ? <div className={shellStyles.empty}>正在加载积分账户…</div> : null}
          {error ? <div className={[shellStyles.banner, shellStyles.bannerError].join(" ")}>{error}</div> : null}
          {message ? <div className={shellStyles.banner}>{message}</div> : null}
          {returnTo && returnStatus === "success" ? (
            <Link href={returnTo} className={shellStyles.banner}>返回生成页继续</Link>
          ) : null}
          {account ? (
            <>
              <section className={styles.summaryGrid}>
                <div className={[shellStyles.card, styles.walletCard].join(" ")}>
                  <div className={styles.walletHead}>
                    <div>
                      <h1 className={shellStyles.cardTitle}>积分账户</h1>
                      <p className={shellStyles.cardSubtitle}>失败不扣费，冻结积分会释放。</p>
                    </div>
                    <div className={styles.primaryBalance}>
                      <span>可用积分</span>
                      <strong>{account.availableCredits}</strong>
                    </div>
                  </div>
                  <div className={styles.balanceGrid}>
                    <div><span>冻结</span><strong>{account.reservedCredits}</strong></div>
                    <div><span>累计到账</span><strong>{totalRecharge}</strong></div>
                    <div><span>累计消费</span><strong>{account.lifetimeSpentCredits}</strong></div>
                  </div>
                </div>

                <div className={[shellStyles.card, styles.packagePanel].join(" ")}>
                  <div className={styles.sectionHeadCompact}>
                    <div>
                      <h2 className={shellStyles.cardTitle}>充值</h2>
                      <p className={shellStyles.cardSubtitle}>{paymentsEnabled ? "一次性充值。" : "扫码联系充值。"}</p>
                    </div>
                  </div>
                  <div className={styles.packageGrid}>
                    {packages.length === 0 ? <div className={shellStyles.empty}>暂无可购买套餐</div> : null}
                    {packages.map((item, index) => (
                      <button
                        key={item.id}
                        type="button"
                        className={styles.packageButton}
                        data-recommended={index === 0}
                        disabled={checkoutLoading !== null}
                        onClick={() => void startCheckout(item.id)}
                      >
                        <span>{packageName(item.label)}</span>
                        <strong>{item.credits + item.bonusCredits} 积分</strong>
                        <em>{formatMoney(item.currency, item.amountCents)}</em>
                        <small>{item.bonusCredits > 0 ? `含赠送 ${item.bonusCredits} 积分` : "无赠送"}</small>
                      </button>
                    ))}
                  </div>
                  {!paymentsEnabled ? (
                    <div className={styles.contactTopupCard}>
                      <div className={styles.contactQrWrap}>
                        <Image
                          src={contactQrUrl}
                          alt="微信充值联系二维码"
                          width={1024}
                          height={1024}
                          className={styles.contactQr}
                          unoptimized
                        />
                      </div>
                      <div className={styles.contactCopy}>
                        <strong>在线支付暂未开放</strong>
                        <span>扫码添加微信，备注账号邮箱或手机号，确认金额后为你后台充值。</span>
                        {canUploadContactQr ? (
                          <div className={styles.contactAdminTools}>
                            <button
                              type="button"
                              className={styles.contactUploadButton}
                              disabled={contactQrUploading}
                              onClick={() => contactQrInputRef.current?.click()}
                            >
                              {contactQrUploading ? "上传中" : "更换二维码"}
                            </button>
                            <input
                              ref={contactQrInputRef}
                              type="file"
                              accept="image/*"
                              hidden
                              onChange={(event) => void uploadContactQr(event.target.files?.[0])}
                            />
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              </section>

              <section className={styles.recordsGrid}>
                <div className={[shellStyles.card, styles.panel].join(" ")}>
                  <div className={styles.sectionHeadCompact}>
                    <h2 className={shellStyles.cardTitle}>充值记录</h2>
                    {snapshot.recentOrders.length > visibleOrders.length ? <span>最近 {visibleOrders.length} 条</span> : null}
                  </div>
                  <div className={styles.table}>
                    {visibleOrders.map((order) => (
                      <div key={order.id} className={styles.row}>
                        <span>{formatDate(order.createdAt)}</span>
                        <strong>{order.credits + order.bonusCredits}</strong>
                        <span>{formatMoney(order.currency, order.amountCents)}</span>
                        <em>{statusLabel(order.status)}</em>
                      </div>
                    ))}
                    {snapshot.recentOrders.length === 0 ? <div className={shellStyles.empty}>暂无订单</div> : null}
                  </div>
                </div>

                <div className={[shellStyles.card, styles.panel].join(" ")}>
                  <div className={styles.sectionHeadCompact}>
                    <h2 className={shellStyles.cardTitle}>消费流水</h2>
                    {snapshot.recentLedger.length > visibleLedger.length ? <span>最近 {visibleLedger.length} 条</span> : null}
                  </div>
                  <div className={styles.ledger}>
                    {visibleLedger.map((entry) => (
                      <div key={entry.id} className={styles.ledgerRow}>
                        <span>{formatDate(entry.createdAt)}</span>
                        <strong>{ledgerTypeLabel(entry.entryType)}</strong>
                        <em>{entry.amountCredits > 0 ? `+${entry.amountCredits}` : entry.amountCredits}</em>
                        <span>余 {entry.availableBalanceAfter} / 冻 {entry.reservedBalanceAfter}</span>
                      </div>
                    ))}
                    {snapshot.recentLedger.length === 0 ? <div className={shellStyles.empty}>暂无流水</div> : null}
                  </div>
                </div>
              </section>
            </>
          ) : null}
        </div>
      </div>
    </main>
  );
}

export default function CreditsPage() {
  return (
    <Suspense fallback={<main className={shellStyles.page}><div className={shellStyles.empty}>正在加载积分账户…</div></main>}>
      <CreditsPageContent />
    </Suspense>
  );
}
