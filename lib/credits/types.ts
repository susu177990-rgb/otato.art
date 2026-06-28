import type { GptImageQuality, ImageModelId, ImageSizeTier } from "@/lib/image-workspace";
import type { VideoGenerationModeId, VideoModelId, VideoResolution } from "@/lib/video-workspace";

export type CreditAccount = {
  accountId: string;
  userId: string;
  availableCredits: number;
  reservedCredits: number;
  lifetimePurchasedCredits: number;
  lifetimeBonusCredits: number;
  lifetimeSpentCredits: number;
  createdAt: string;
  updatedAt: string;
};

export type CreditLedgerEntry = {
  id: string;
  accountId: string;
  userId: string;
  entryType: string;
  amountCredits: number;
  availableDeltaCredits: number;
  reservedDeltaCredits: number;
  availableBalanceAfter: number;
  reservedBalanceAfter: number;
  totalBalanceAfter: number;
  relatedReservationId: string | null;
  relatedOrderId: string | null;
  relatedGenerationId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type CreditPackage = {
  id: string;
  label: string;
  currency: string;
  amountCents: number;
  credits: number;
  bonusCredits: number;
  enabled: boolean;
  sortOrder: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type CreditOrder = {
  id: string;
  accountId: string;
  userId: string;
  packageId: string | null;
  provider: "stripe" | "manual";
  providerOrderId: string | null;
  status: "pending" | "paid" | "failed" | "canceled" | "refunded" | "refund_review";
  currency: string;
  amountCents: number;
  credits: number;
  bonusCredits: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  paidAt: string | null;
};

export type CreditReservation = {
  id: string;
  accountId: string;
  userId: string;
  status: "pending" | "captured" | "released" | "expired";
  reservedCredits: number;
  capturedCredits: number | null;
  feature: CreditFeature;
  modelId: string;
  projectId: string | null;
  requestId: string;
  priceSnapshot: Record<string, unknown>;
  costSnapshot: Record<string, unknown>;
  estimatedMarginCredits: number | null;
  estimatedMarginPercent: number | null;
  metadata: Record<string, unknown>;
  resultRef: string | null;
  failureReason: string | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
};

export type CreditFeature = "image" | "video" | "canvas_image" | "canvas_video" | "chat";

export type ImageCreditQuoteInput = {
  feature: Extract<CreditFeature, "image" | "canvas_image">;
  modelId: ImageModelId;
  imageSize: ImageSizeTier;
  gptImageQuality?: GptImageQuality;
};

export type ImageCreditQuote = {
  feature: Extract<CreditFeature, "image" | "canvas_image">;
  modelId: ImageModelId;
  imageSize: ImageSizeTier;
  gptImageQuality?: GptImageQuality;
  credits: number;
  priceSnapshot: Record<string, unknown>;
  costSnapshot: Record<string, unknown>;
  estimatedMarginCredits: number | null;
  estimatedMarginPercent: number | null;
  marginStatus: "cost_missing" | "healthy" | "warning" | "blocked";
};

export type VideoCreditQuoteInput = {
  feature: Extract<CreditFeature, "video" | "canvas_video">;
  modelId: VideoModelId;
  modeId: VideoGenerationModeId;
  resolution: VideoResolution;
  durationSeconds: number;
};

export type VideoCreditQuote = {
  feature: Extract<CreditFeature, "video" | "canvas_video">;
  modelId: VideoModelId;
  modeId: VideoGenerationModeId;
  resolution: VideoResolution;
  billableSeconds: number;
  creditsPerSecond: number;
  minimumCredits: number;
  credits: number;
  priceSnapshot: Record<string, unknown>;
  costSnapshot: Record<string, unknown>;
  estimatedMarginCredits: number | null;
  estimatedMarginPercent: number | null;
  marginStatus: "cost_missing" | "healthy" | "warning" | "blocked";
};

export type CreditQuote = ImageCreditQuote | VideoCreditQuote;

export type CreditBalanceSnapshot = {
  account: CreditAccount;
  recentLedger: CreditLedgerEntry[];
  recentOrders: CreditOrder[];
};
