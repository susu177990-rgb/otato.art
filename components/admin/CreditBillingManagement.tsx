"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import shellStyles from "@/app/shared/shell.module.css";
import settingsStyles from "@/app/settings/settings-page.module.css";
import {
  DEFAULT_IMAGE_SETTINGS,
  GPT_IMAGE_QUALITY_LABELS,
  IMAGE_MODEL_ORDER,
  type GptImageQuality,
  type ImageModelId,
  type ImageSizeTier,
} from "@/lib/image-workspace";
import {
  DISABLED_VIDEO_MODEL_IDS,
  VIDEO_GENERATION_MODES,
  VIDEO_MODEL_ORDER,
  getVideoModelDefinition,
  getVideoParameterCapabilities,
  isVideoModelModeSupported,
  type VideoGenerationModeId,
  type VideoModelId,
  type VideoResolution,
} from "@/lib/video-workspace";
import { defaultCreditPackages } from "@/lib/credits/default-prices";
import { HARD_MARGIN_FLOOR_PERCENT, estimateMarginFromCost, type MarginStatus } from "@/lib/credits/margins";
import styles from "./admin-management.module.css";

type BillingTab = "dashboard" | "pricing" | "packages" | "orders" | "ledger" | "reservations";
type PricingKind = "image" | "video";
type ImagePrice = {
  modelId: ImageModelId;
  sizeTier: ImageSizeTier;
  gptQuality: GptImageQuality | null;
  credits: number;
  enabled: boolean;
  costPerUnitMinor: number;
  costCurrency: string;
  costSource: "manual" | "invoice" | "estimated";
  marginPercent: number | null;
  marginStatus: MarginStatus;
};
type VideoPrice = {
  modelId: VideoModelId;
  modeId: VideoGenerationModeId;
  resolution: VideoResolution;
  creditsPerSecond: number;
  enabled: boolean;
  costPerUnitMinor: number;
  costCurrency: string;
  costSource: "manual" | "invoice" | "estimated";
  marginPercent: number | null;
  marginStatus: MarginStatus;
};
type PackageRow = {
  id: string;
  label: string;
  currency: string;
  amountCents: number;
  credits: number;
  bonusCredits: number;
  enabled: boolean;
  sortOrder: number;
  metadata?: Record<string, unknown>;
};
type OrderRow = {
  id: string;
  userId: string;
  status: string;
  amountCents: number;
  currency: string;
  credits: number;
  bonusCredits: number;
  providerOrderId: string | null;
  createdAt: string;
};
type LedgerRow = {
  id: string;
  userId: string;
  entryType: string;
  amountCredits: number;
  availableDeltaCredits: number;
  reservedDeltaCredits: number;
  availableBalanceAfter: number;
  reservedBalanceAfter: number;
  createdAt: string;
};
type ReservationRow = {
  id: string;
  userId: string;
  status: string;
  feature: string;
  modelId: string;
  reservedCredits: number;
  requestId: string;
  expiresAt: string;
  createdAt: string;
};
type DashboardPayload = {
  metrics: Array<{ label: string; value: string; tone?: "danger" | "warn" | "normal" }>;
  modelRows: Array<{
    modelId: string;
    revenueCredits: number;
    estimatedCostCents: number;
    estimatedMarginPercent: number | null;
    capturedCount: number;
    failedCount: number;
    averageBillableSeconds: number | null;
  }>;
  riskEvents: Array<{ id: string; riskType: string; status: string; severity: string; createdAt: string }>;
};

const cardClass = [shellStyles.card, settingsStyles.floatCard].join(" ");
const imageSizes: ImageSizeTier[] = ["1K", "2K", "4K"];
const gptQualities: GptImageQuality[] = ["low", "medium", "high"];
const videoResolutionOrder: VideoResolution[] = ["480p", "720p", "1080p", "4k"];
const tabs: Array<{ id: BillingTab; label: string }> = [
  { id: "dashboard", label: "经营看板" },
  { id: "pricing", label: "价格管理" },
  { id: "packages", label: "充值套餐" },
  { id: "orders", label: "订单" },
  { id: "ledger", label: "流水" },
  { id: "reservations", label: "冻结异常" },
];

function keyOfImage(item: Pick<ImagePrice, "modelId" | "sizeTier" | "gptQuality">): string {
  return `${item.modelId}:${item.sizeTier}:${item.gptQuality ?? "standard"}`;
}

function keyOfVideo(item: Pick<VideoPrice, "modelId" | "modeId" | "resolution">): string {
  return `${item.modelId}:${item.modeId}:${item.resolution}`;
}

function imageModelLabel(modelId: ImageModelId): string {
  return DEFAULT_IMAGE_SETTINGS.models[modelId]?.label ?? modelId;
}

function imageCombos(): ImagePrice[] {
  const out: ImagePrice[] = [];
  for (const modelId of IMAGE_MODEL_ORDER) {
    for (const sizeTier of imageSizes) {
      if (modelId === "gpt-image-2") {
        for (const gptQuality of gptQualities) out.push(emptyImagePrice(modelId, sizeTier, gptQuality));
      } else {
        out.push(emptyImagePrice(modelId, sizeTier, null));
      }
    }
  }
  return out;
}

function videoCombos(): VideoPrice[] {
  const out: VideoPrice[] = [];
  for (const modelId of VIDEO_MODEL_ORDER) {
    if (DISABLED_VIDEO_MODEL_IDS.has(modelId)) continue;
    for (const mode of VIDEO_GENERATION_MODES) {
      if (!isVideoModelModeSupported(modelId, mode.id)) continue;
      const caps = getVideoParameterCapabilities(modelId, mode.id, []);
      for (const resolution of caps.resolutions) {
        out.push({
          modelId,
          modeId: mode.id,
          resolution,
          creditsPerSecond: 0,
          enabled: false,
          costPerUnitMinor: 0,
          costCurrency: "cny",
          costSource: "manual",
          marginPercent: null,
          marginStatus: "cost_missing",
        });
      }
    }
  }
  return out;
}

function emptyImagePrice(modelId: ImageModelId, sizeTier: ImageSizeTier, gptQuality: GptImageQuality | null): ImagePrice {
  return {
    modelId,
    sizeTier,
    gptQuality,
    credits: 0,
    enabled: false,
    costPerUnitMinor: 0,
    costCurrency: "cny",
    costSource: "manual",
    marginPercent: null,
    marginStatus: "cost_missing",
  };
}

function withComputedImageMargin(item: ImagePrice): ImagePrice {
  const margin = estimateMarginFromCost({
    credits: item.credits,
    costPerUnitMinor: item.costPerUnitMinor,
    currency: item.costCurrency,
    source: item.costSource,
    unit: "image",
  });
  return { ...item, marginPercent: margin.estimatedMarginPercent, marginStatus: margin.marginStatus };
}

function withComputedVideoMargin(item: VideoPrice): VideoPrice {
  const margin = estimateMarginFromCost({
    credits: item.creditsPerSecond,
    costPerUnitMinor: item.costPerUnitMinor,
    currency: item.costCurrency,
    source: item.costSource,
    unit: "second",
  });
  return { ...item, marginPercent: margin.estimatedMarginPercent, marginStatus: margin.marginStatus };
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "暂无";
  const time = Date.parse(value);
  if (Number.isNaN(time)) return "暂无";
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(time));
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function currencyLabel(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === "usd") return "美元";
  if (normalized === "cny") return "人民币";
  return value.toUpperCase();
}

function packageLabel(item: Pick<PackageRow, "id" | "label">): string {
  const label = item.label.trim();
  if (label && label !== "Starter" && label !== "Creator" && label !== "Studio" && label !== "Pro") return item.label;
  const id = item.id.trim().toLowerCase();
  if (id === "starter" || item.label === "Starter") return "入门包";
  if (id === "creator" || item.label === "Creator") return "创作者包";
  if (id === "studio" || item.label === "Studio") return "工作室包";
  if (id === "pro" || item.label === "Pro") return "专业包";
  return item.label;
}

function packageCodeLabel(value: string): string {
  const id = value.trim().toLowerCase();
  if (id === "starter") return "入门包";
  if (id === "creator") return "创作者包";
  if (id === "studio") return "工作室包";
  if (id === "pro") return "专业包";
  if (id.startsWith("pkg_")) return "自定义套餐";
  return value;
}

function metricLabel(value: string): string {
  if (value === "ARPPU") return "客单价";
  return value;
}

function orderStatusLabel(value: string): string {
  if (value === "paid") return "已到账";
  if (value === "pending") return "待处理";
  if (value === "failed") return "失败";
  if (value === "canceled") return "已取消";
  if (value === "refunded") return "已退款";
  if (value === "refund_review") return "退款待处理";
  return value;
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

function reservationStatusLabel(value: string): string {
  if (value === "pending") return "冻结中";
  if (value === "captured") return "已扣费";
  if (value === "released") return "已释放";
  if (value === "expired") return "已过期释放";
  return value;
}

function featureLabel(value: string): string {
  if (value === "image") return "图片生成";
  if (value === "video") return "视频生成";
  if (value === "canvas_image") return "画布图片";
  if (value === "canvas_video") return "画布视频";
  if (value === "chat") return "对话";
  return value;
}

function riskTypeLabel(value: string): string {
  if (value === "refund_review") return "退款待处理";
  if (value === "dispute_review") return "争议待处理";
  if (value === "bad_debt") return "坏账";
  if (value === "high_failure_rate") return "失败率过高";
  return value;
}

function riskStatusLabel(value: string): string {
  if (value === "open") return "待处理";
  if (value === "resolved") return "已处理";
  if (value === "bad_debt") return "坏账";
  if (value === "ignored") return "已忽略";
  return value;
}

function severityLabel(value: string): string {
  if (value === "low") return "低";
  if (value === "medium") return "中";
  if (value === "high") return "高";
  if (value === "critical") return "严重";
  return value;
}

function displayId(value: string): string {
  return value;
}

function userLabel(value: string): string {
  return value;
}

function paymentRefLabel(value: string | null): string {
  if (!value) return "暂无";
  if (value.startsWith("manual_wechat")) return "线下微信收款";
  if (value.startsWith("manual_wire")) return "线下转账";
  if (value.startsWith("manual_pending")) return "线下收款待确认";
  if (value.startsWith("manual_bank")) return "银行转账";
  if (value.startsWith("manual_card")) return "线下刷卡";
  return value;
}

function requestLabel(value: string): string {
  return value;
}

async function readJson<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || "请求失败");
  return data;
}

export function CreditBillingPanel() {
  const [tab, setTab] = useState<BillingTab>("pricing");
  const [imagePrices, setImagePrices] = useState<ImagePrice[]>([]);
  const [videoPrices, setVideoPrices] = useState<VideoPrice[]>([]);
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [reservations, setReservations] = useState<ReservationRow[]>([]);
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [pricingKind, setPricingKind] = useState<PricingKind>("image");
  const [selectedImageModel, setSelectedImageModel] = useState<ImageModelId>("gpt-image-2");
  const [selectedVideoModel, setSelectedVideoModel] = useState<VideoModelId>("seedance-2.0");

  const imageRows = useMemo(() => {
    const map = new Map(imagePrices.map((item) => [keyOfImage(item), item]));
    return imageCombos().map((combo) => ({ ...combo, ...(map.get(keyOfImage(combo)) ?? {}) }));
  }, [imagePrices]);

  const videoRows = useMemo(() => {
    const map = new Map(videoPrices.map((item) => [keyOfVideo(item), item]));
    return videoCombos().map((combo) => ({ ...combo, ...(map.get(keyOfVideo(combo)) ?? {}) }));
  }, [videoPrices]);
  const selectedImageRows = useMemo(
    () => imageRows.filter((item) => item.modelId === selectedImageModel),
    [imageRows, selectedImageModel],
  );
  const selectedVideoRows = useMemo(
    () => videoRows.filter((item) => item.modelId === selectedVideoModel),
    [selectedVideoModel, videoRows],
  );
  const selectedImageQualityRows = useMemo(
    () => selectedImageModel === "gpt-image-2" ? gptQualities : [null],
    [selectedImageModel],
  );
  const selectedVideoResolutions = useMemo(() => {
    const supported = new Set(selectedVideoRows.map((item) => item.resolution));
    return videoResolutionOrder.filter((resolution) => supported.has(resolution));
  }, [selectedVideoRows]);

  async function loadAll() {
    setLoading(true);
    setMessage("");
    try {
      const [pricing, packageData, orderData, ledgerData, reservationData] = await Promise.all([
        fetch("/api/admin/credits/pricing", { cache: "no-store" }).then((res) => readJson<{ imagePrices: ImagePrice[]; videoPrices: VideoPrice[] }>(res)),
        fetch("/api/admin/credits/packages", { cache: "no-store" }).then((res) => readJson<{ packages: PackageRow[] }>(res)),
        fetch("/api/admin/credits/orders", { cache: "no-store" }).then((res) => readJson<{ orders: OrderRow[] }>(res)),
        fetch("/api/admin/credits/ledger", { cache: "no-store" }).then((res) => readJson<{ ledger: LedgerRow[] }>(res)),
        fetch("/api/admin/credits/reservations", { cache: "no-store" }).then((res) => readJson<{ reservations: ReservationRow[] }>(res)),
      ]);
      setImagePrices(pricing.imagePrices);
      setVideoPrices(pricing.videoPrices);
      setPackages(packageData.packages);
      setOrders(orderData.orders);
      setLedger(ledgerData.ledger);
      setReservations(reservationData.reservations);
      void fetch("/api/admin/credits/dashboard", { cache: "no-store" })
        .then((res) => readJson<DashboardPayload>(res))
        .then(setDashboard)
        .catch(() => setDashboard(null));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加载积分计费数据失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

  async function savePricing() {
    setMessage("");
    const cleanImages = imageRows.filter((item) => item.credits > 0).map((item) => ({ ...item, enabled: true }));
    const cleanVideos = videoRows.filter((item) => item.creditsPerSecond > 0).map((item) => ({ ...item, enabled: true }));
    const blocked = [
      ...cleanImages.map(withComputedImageMargin),
      ...cleanVideos.map(withComputedVideoMargin),
    ].filter((item) => item.marginStatus === "blocked");
    const allowLowMarginOverride = blocked.length > 0
      ? window.confirm(`有 ${blocked.length} 个价格毛利低于 ${HARD_MARGIN_FLOOR_PERCENT}%，只有 owner 可以强制保存。继续提交？`)
      : false;
    if (blocked.length > 0 && !allowLowMarginOverride) return;
    try {
      const data = await fetch("/api/admin/credits/pricing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imagePrices: cleanImages, videoPrices: cleanVideos, allowLowMarginOverride }),
      }).then((res) => readJson<{ imagePrices: ImagePrice[]; videoPrices: VideoPrice[] }>(res));
      setImagePrices(data.imagePrices);
      setVideoPrices(data.videoPrices);
      setMessage("价格已保存");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存价格失败");
    }
  }

  async function savePackages() {
    setMessage("");
    try {
      const enabledPackages = packages.map((item) => ({ ...item, enabled: true }));
      const data = await fetch("/api/admin/credits/packages", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packages: enabledPackages }),
      }).then((res) => readJson<{ packages: PackageRow[] }>(res));
      setPackages(data.packages);
      setMessage("套餐已保存");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存套餐失败");
    }
  }

  async function syncStripeOrder(orderId: string) {
    setMessage("");
    try {
      await fetch("/api/admin/credits/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync_stripe_session", orderId }),
      }).then((res) => readJson<{ order: OrderRow }>(res));
      setMessage("订单已同步");
      await loadAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "同步订单失败");
    }
  }

  async function releaseReservation(reservationId: string) {
    const reason = window.prompt("释放原因", "admin_manual_release");
    if (!reason) return;
    setMessage("");
    try {
      await fetch("/api/admin/credits/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "release", reservationId, reason }),
      }).then((res) => readJson<{ reservation: ReservationRow }>(res));
      setMessage("冻结单已释放");
      await loadAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "释放冻结单失败");
    }
  }

  async function captureReservation(reservationId: string) {
    const resultRef = window.prompt("结果引用（可留空）", "");
    if (resultRef === null) return;
    setMessage("");
    try {
      await fetch("/api/admin/credits/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "capture", reservationId, resultRef }),
      }).then((res) => readJson<{ reservation: ReservationRow }>(res));
      setMessage("冻结单已手动扣费");
      await loadAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "手动扣费失败");
    }
  }

  function updateImagePrice(key: string, patch: Partial<ImagePrice>) {
    setImagePrices(() => {
      const map = new Map(imageRows.map((item) => [keyOfImage(item), item]));
      map.set(key, withComputedImageMargin({ ...map.get(key)!, ...patch }));
      return Array.from(map.values());
    });
  }

  function updateVideoResolutionPrice(resolution: VideoResolution, patch: Partial<VideoPrice>) {
    setVideoPrices(() => {
      const map = new Map(videoRows.map((item) => [keyOfVideo(item), item]));
      for (const item of videoRows) {
        if (item.modelId !== selectedVideoModel || item.resolution !== resolution) continue;
        const key = keyOfVideo(item);
        map.set(key, withComputedVideoMargin({ ...item, ...patch }));
      }
      return Array.from(map.values());
    });
  }

  function fillRecommendedPackages() {
    setPackages((current) => {
      const byId = new Map(current.map((item) => [item.id, item]));
      for (const item of defaultCreditPackages()) {
        if (!byId.has(item.id)) byId.set(item.id, item);
      }
      return Array.from(byId.values()).sort((a, b) => a.sortOrder - b.sortOrder);
    });
    setMessage("已填入缺失的推荐套餐，已有套餐未覆盖");
  }

  return (
    <section className={cardClass}>
      <div className={shellStyles.cardHead}>
        <div>
          <h1 className={shellStyles.cardTitle}>积分计费</h1>
          <p className={shellStyles.cardSubtitle}>价格、套餐、订单、流水和冻结异常。</p>
        </div>
        <div className={styles.headerActions}>
          <button type="button" className={shellStyles.buttonSubtle} onClick={() => void loadAll()} disabled={loading}>刷新</button>
          {tab === "pricing" ? <button type="button" className={shellStyles.buttonSubtle} onClick={() => void savePricing()}>保存价格</button> : null}
          {tab === "packages" ? <button type="button" className={shellStyles.buttonSubtle} onClick={fillRecommendedPackages}>填入推荐套餐</button> : null}
          {tab === "packages" ? <button type="button" className={shellStyles.buttonSubtle} onClick={() => void savePackages()}>保存套餐</button> : null}
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.filterGroup}>
          {tabs.map((item) => (
            <button key={item.id} type="button" className={shellStyles.buttonSubtle} data-active={tab === item.id} onClick={() => setTab(item.id)}>
              {item.label}
            </button>
          ))}
        </div>
      </div>
      {message ? <p className={shellStyles.cardSubtitle}>{message}</p> : null}
      {loading ? <div className={shellStyles.empty}>正在加载积分计费数据…</div> : null}

      {tab === "dashboard" ? (
        <div className={styles.adminStack}>
          <section className={styles.detailPanel}>
            <div className={styles.overviewGrid}>
              {(dashboard?.metrics ?? []).map((item) => (
                <div key={item.label} className={styles.overviewMetric}>
                  <span>{metricLabel(item.label)}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
              {!dashboard ? <div className={shellStyles.empty}>暂无经营数据</div> : null}
            </div>
          </section>
          <div className={styles.dashboardGrid}>
            <ReadOnlyTable
              title="模型毛利"
              compact
              headers={["模型", "收入", "成本", "毛利", "成/败", "秒"]}
              rows={(dashboard?.modelRows ?? []).map((item) => [
                item.modelId,
                formatNumber(item.revenueCredits),
                `¥${(item.estimatedCostCents / 100).toFixed(2)}`,
                item.estimatedMarginPercent == null ? "缺成本" : `${item.estimatedMarginPercent.toFixed(1)}%`,
                `${formatNumber(item.capturedCount)} / ${formatNumber(item.failedCount)}`,
                item.averageBillableSeconds == null ? "暂无" : item.averageBillableSeconds.toFixed(1),
              ])}
            />
            <ReadOnlyTable
              title="风险事件"
              compact
              headers={["类型", "状态", "级别", "时间"]}
              rows={(dashboard?.riskEvents ?? []).map((item) => [riskTypeLabel(item.riskType), riskStatusLabel(item.status), severityLabel(item.severity), formatDate(item.createdAt)])}
            />
          </div>
        </div>
      ) : null}

      {tab === "pricing" ? (
        <section className={styles.detailPanel}>
          <div className={styles.detailPanelHeader}>
            <div>
              <h2 className={shellStyles.cardTitle}>价格管理</h2>
              <p className={shellStyles.cardSubtitle}>按模型维护售价和供应商成本。</p>
            </div>
            <div className={styles.filterGroup}>
              <button type="button" className={shellStyles.buttonSubtle} data-active={pricingKind === "image"} onClick={() => setPricingKind("image")}>图片</button>
              <button type="button" className={shellStyles.buttonSubtle} data-active={pricingKind === "video"} onClick={() => setPricingKind("video")}>视频</button>
            </div>
          </div>

          <div className={styles.priceManager}>
            <aside className={styles.priceModelRail} aria-label="模型列表">
              {pricingKind === "image" ? IMAGE_MODEL_ORDER.map((modelId) => {
                const rows = imageRows.filter((item) => item.modelId === modelId);
                const enabledCount = rows.filter((item) => item.credits > 0).length;
                return (
                  <button
                    key={modelId}
                    type="button"
                    className={styles.priceModelButton}
                    data-active={selectedImageModel === modelId}
                    onClick={() => setSelectedImageModel(modelId)}
                  >
                    <span>{imageModelLabel(modelId)}</span>
                    <strong>{enabledCount}/{rows.length}</strong>
                  </button>
                );
              }) : VIDEO_MODEL_ORDER.filter((modelId) => !DISABLED_VIDEO_MODEL_IDS.has(modelId)).map((modelId) => {
                const rows = videoRows.filter((item) => item.modelId === modelId);
                const resolutions = videoResolutionOrder.filter((resolution) => rows.some((item) => item.resolution === resolution));
                const enabledCount = resolutions.filter((resolution) => rows.some((item) => item.resolution === resolution && item.creditsPerSecond > 0)).length;
                return (
                  <button
                    key={modelId}
                    type="button"
                    className={styles.priceModelButton}
                    data-active={selectedVideoModel === modelId}
                    onClick={() => setSelectedVideoModel(modelId)}
                  >
                    <span>{getVideoModelDefinition(modelId).label}</span>
                    <strong>{enabledCount}/{resolutions.length}</strong>
                  </button>
                );
              })}
            </aside>

            {pricingKind === "image" ? (
              <div className={styles.priceEditor}>
                <div className={styles.priceEditorHeader}>
                  <div>
                    <h3 className={shellStyles.cardTitle}>{imageModelLabel(selectedImageModel)}</h3>
                    <p className={shellStyles.cardSubtitle}>
                      {selectedImageModel === "gpt-image-2" ? "按质量和尺寸配置每张图片价格。" : "按尺寸配置每张图片价格。"}
                    </p>
                  </div>
                  <span className={styles.pill}>{selectedImageRows.filter((item) => item.credits > 0).length} 项已填</span>
                </div>
                <div className={styles.priceMatrixWrap}>
                  <table className={styles.priceMatrix}>
                    <thead>
                      <tr>
                        <th>质量</th>
                        {imageSizes.map((sizeTier) => <th key={sizeTier}>{sizeTier}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {selectedImageQualityRows.map((quality) => (
                        <tr key={quality ?? "standard"}>
                          <th>{quality ? GPT_IMAGE_QUALITY_LABELS[quality] : "标准"}</th>
                          {imageSizes.map((sizeTier) => {
                            const item = selectedImageRows.find((row) => row.sizeTier === sizeTier && row.gptQuality === quality);
                            if (!item) return <td key={sizeTier} className={styles.priceMatrixEmpty}>不支持</td>;
                            const key = keyOfImage(item);
                            return (
                              <td key={key}>
                                <div className={styles.priceMatrixCell}>
                                  <div className={styles.priceMatrixInputs}>
                                    <label><span>售价</span><input className={styles.priceInput} value={item.credits || ""} inputMode="numeric" onChange={(event) => updateImagePrice(key, { credits: Number(event.target.value) || 0, enabled: true })} /></label>
                                    <label><span>成本（分）</span><input className={styles.priceInput} value={item.costPerUnitMinor || ""} inputMode="numeric" onChange={(event) => updateImagePrice(key, { costPerUnitMinor: Number(event.target.value) || 0, costCurrency: "cny" })} /></label>
                                  </div>
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className={styles.priceEditor}>
                <div className={styles.priceEditorHeader}>
                  <div>
                    <h3 className={shellStyles.cardTitle}>{getVideoModelDefinition(selectedVideoModel).label}</h3>
                    <p className={shellStyles.cardSubtitle}>同一模型不同模式使用同一套分辨率价格。</p>
                  </div>
                  <span className={styles.pill}>{selectedVideoResolutions.filter((resolution) => selectedVideoRows.some((item) => item.resolution === resolution && item.creditsPerSecond > 0)).length} 项已填</span>
                </div>
                <div className={styles.priceMatrixWrap}>
                  <table className={styles.priceMatrix}>
                    <thead>
                      <tr>
                        <th>项目</th>
                        {selectedVideoResolutions.map((resolution) => <th key={resolution}>{resolution}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <th>每秒价格</th>
                        {selectedVideoResolutions.map((resolution) => {
                          const item = selectedVideoRows.find((row) => row.resolution === resolution && row.creditsPerSecond > 0)
                            ?? selectedVideoRows.find((row) => row.resolution === resolution);
                          if (!item) return <td key={resolution} className={styles.priceMatrixEmpty}>不支持</td>;
                          return (
                            <td key={resolution}>
                              <div className={styles.priceMatrixCell}>
                                <div className={styles.priceMatrixInputs}>
                                  <label><span>售价/秒</span><input className={styles.priceInput} value={item.creditsPerSecond || ""} inputMode="numeric" onChange={(event) => updateVideoResolutionPrice(resolution, { creditsPerSecond: Number(event.target.value) || 0, enabled: true })} /></label>
                                  <label><span>成本/秒（分）</span><input className={styles.priceInput} value={item.costPerUnitMinor || ""} inputMode="numeric" onChange={(event) => updateVideoResolutionPrice(resolution, { costPerUnitMinor: Number(event.target.value) || 0, costCurrency: "cny" })} /></label>
                                </div>
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </section>
      ) : null}

      {tab === "packages" ? (
        <section className={styles.detailPanel}>
          <div className={styles.detailPanelHeader}>
            <div>
              <h2 className={shellStyles.cardTitle}>充值套餐</h2>
              <p className={shellStyles.cardSubtitle}>金额以最小货币单位保存，人民币套餐按分保存。</p>
            </div>
            <button type="button" className={shellStyles.buttonSubtle} onClick={() => setPackages((current) => [...current, { id: `pkg_${Date.now()}`, label: "新套餐", currency: "cny", amountCents: 1000, credits: 1000, bonusCredits: 0, enabled: true, sortOrder: current.length }])}>新增套餐</button>
          </div>
          <div className={`${styles.tableWrap} ${styles.packageTableWrap}`}>
            <table className={`${styles.table} ${styles.packageTable}`}>
              <thead><tr><th>套餐编号</th><th>名称</th><th>币种</th><th>金额</th><th>积分</th><th>赠送</th><th>排序</th></tr></thead>
              <tbody>
                {packages.map((item, index) => (
                  <tr key={`${item.id}-${index}`}>
                    <td>{packageCodeLabel(item.id)}</td>
                    <td><input className={styles.searchInput} value={packageLabel(item)} onChange={(event) => setPackages((rows) => rows.map((row, i) => i === index ? { ...row, label: event.target.value } : row))} /></td>
                    <td>
                      <select className={styles.select} value={item.currency} onChange={(event) => setPackages((rows) => rows.map((row, i) => i === index ? { ...row, currency: event.target.value } : row))}>
                        <option value="usd">美元</option>
                        <option value="cny">人民币</option>
                      </select>
                    </td>
                    <td><input className={styles.searchInput} value={item.amountCents} inputMode="numeric" onChange={(event) => setPackages((rows) => rows.map((row, i) => i === index ? { ...row, amountCents: Number(event.target.value) || 0 } : row))} /></td>
                    <td><input className={styles.searchInput} value={item.credits} inputMode="numeric" onChange={(event) => setPackages((rows) => rows.map((row, i) => i === index ? { ...row, credits: Number(event.target.value) || 0 } : row))} /></td>
                    <td><input className={styles.searchInput} value={item.bonusCredits} inputMode="numeric" onChange={(event) => setPackages((rows) => rows.map((row, i) => i === index ? { ...row, bonusCredits: Number(event.target.value) || 0 } : row))} /></td>
                    <td><input className={styles.searchInput} value={item.sortOrder} inputMode="numeric" onChange={(event) => setPackages((rows) => rows.map((row, i) => i === index ? { ...row, sortOrder: Number(event.target.value) || 0 } : row))} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === "orders" ? (
        <ReadOnlyTable
          title="订单"
          rows={orders.map((item) => [displayId(item.id), userLabel(item.userId), orderStatusLabel(item.status), `${formatNumber(item.amountCents)} ${currencyLabel(item.currency)}`, `${formatNumber(item.credits)} + ${formatNumber(item.bonusCredits)}`, paymentRefLabel(item.providerOrderId), formatDate(item.createdAt)])}
          headers={["编号", "用户", "状态", "金额", "积分", "支付单号", "创建"]}
          actions={(_, index) => {
            const order = orders[index];
            return order?.status === "pending" && order.providerOrderId
              ? <button type="button" className={shellStyles.buttonSubtle} onClick={() => void syncStripeOrder(order.id)}>同步支付状态</button>
              : null;
          }}
        />
      ) : null}
      {tab === "ledger" ? <ReadOnlyTable title="流水" rows={ledger.map((item) => [displayId(item.id), userLabel(item.userId), ledgerTypeLabel(item.entryType), formatNumber(item.amountCredits), `${formatNumber(item.availableDeltaCredits)} / ${formatNumber(item.reservedDeltaCredits)}`, `${formatNumber(item.availableBalanceAfter)} / ${formatNumber(item.reservedBalanceAfter)}`, formatDate(item.createdAt)])} headers={["编号", "用户", "类型", "总变化", "可用/冻结变化", "可用/冻结余额", "时间"]} /> : null}
      {tab === "reservations" ? (
        <ReadOnlyTable
          title="冻结异常"
          rows={reservations.map((item) => [displayId(item.id), userLabel(item.userId), reservationStatusLabel(item.status), featureLabel(item.feature), item.modelId, formatNumber(item.reservedCredits), requestLabel(item.requestId), formatDate(item.expiresAt), formatDate(item.createdAt)])}
          headers={["编号", "用户", "状态", "功能", "模型", "冻结", "请求", "过期", "创建"]}
          actions={(_, index) => {
            const reservation = reservations[index];
            return reservation?.status === "pending" ? (
              <div className={styles.inlineActions}>
                <button type="button" className={shellStyles.buttonSubtle} onClick={() => void releaseReservation(reservation.id)}>释放</button>
                <button type="button" className={shellStyles.buttonSubtle} onClick={() => void captureReservation(reservation.id)}>扣费</button>
              </div>
            ) : null;
          }}
        />
      ) : null}
    </section>
  );
}

function ReadOnlyTable({
  title,
  headers,
  rows,
  actions,
  compact = false,
}: {
  title: string;
  headers: string[];
  rows: string[][];
  actions?: (row: string[], index: number) => ReactNode;
  compact?: boolean;
}) {
  return (
    <section className={styles.detailPanel}>
      <div className={styles.detailPanelHeader}>
        <div>
          <h2 className={shellStyles.cardTitle}>{title}</h2>
          <p className={shellStyles.cardSubtitle}>最近 {rows.length} 条。</p>
        </div>
      </div>
      {rows.length === 0 ? <div className={shellStyles.empty}>暂无数据。</div> : (
        <div className={[styles.tableWrap, compact ? styles.compactTableWrap : ""].join(" ")}>
          <table className={[styles.table, compact ? styles.compactTable : ""].join(" ")}>
            <thead><tr>{headers.map((item) => <th key={item}>{item}</th>)}{actions ? <th>操作</th> : null}</tr></thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index}>
                  {row.map((cell, i) => <td key={`${index}-${i}`}>{cell}</td>)}
                  {actions ? <td>{actions(row, index)}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
