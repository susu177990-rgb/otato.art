import { describe, expect, it } from "vitest";
import { IMAGE_MODEL_ORDER } from "@/lib/image-workspace";
import { DISABLED_VIDEO_MODEL_IDS } from "@/lib/video-workspace";
import {
  DEFAULT_CREDIT_PACKAGES,
  defaultImageCreditPrices,
  defaultVideoCreditPrices,
  roundCreditsToFive,
} from "./default-prices";
import { crunCreditsToCnyFen, saleCreditsForCnyCost } from "./crun-pricing";
import { estimateMarginFromCost, marginStatus } from "./margins";

describe("default credit prices", () => {
  it("seeds the default CNY credit packages", () => {
    expect(DEFAULT_CREDIT_PACKAGES.map((item) => [item.id, item.amountCents, item.credits + item.bonusCredits])).toEqual([
      ["studio", 10000, 11000],
    ]);
    expect(new Set(DEFAULT_CREDIT_PACKAGES.map((item) => item.currency))).toEqual(new Set(["cny"]));
  });

  it("covers every image model and the full gpt-image-2 quality matrix", () => {
    const prices = defaultImageCreditPrices();
    expect(new Set(prices.map((item) => item.modelId))).toEqual(new Set(IMAGE_MODEL_ORDER));
    const gpt = prices.filter((item) => item.modelId === "gpt-image-2");
    expect(gpt).toHaveLength(9);
    expect(new Set(gpt.map((item) => `${item.gptQuality}:${item.sizeTier}`))).toEqual(new Set([
      "low:1K",
      "low:2K",
      "low:4K",
      "medium:1K",
      "medium:2K",
      "medium:4K",
      "high:1K",
      "high:2K",
      "high:4K",
    ]));
    expect(prices.find((item) => item.modelId === "nano-banana-2" && item.sizeTier === "1K")?.credits).toBe(34);
    expect(prices.find((item) => item.modelId === "gpt-image-2" && item.gptQuality === "high" && item.sizeTier === "4K")?.credits).toBe(670);
  });

  it("generates video prices only for enabled real model capabilities", () => {
    const prices = defaultVideoCreditPrices();
    expect(prices.length).toBeGreaterThan(0);
    expect(prices.some((item) => item.modelId === "seedance-2.0-mini")).toBe(true);
    expect(prices.some((item) => item.modelId === "seedance-1.0-pro")).toBe(true);
    for (const disabled of DISABLED_VIDEO_MODEL_IDS) {
      expect(prices.some((item) => item.modelId === disabled)).toBe(false);
    }
  });

  it("uses default video prices with mode-specific overrides where needed", () => {
    const prices = defaultVideoCreditPrices();
    expect(prices.find((item) => item.modelId === "kling-3.0" && item.modeId === "text_to_video" && item.resolution === "1080p")?.creditsPerSecond).toBe(184);
    expect(prices.find((item) => item.modelId === "kling-3.0" && item.modeId === "video_edit" && item.resolution === "1080p")).toBeUndefined();
    expect(prices.find((item) => item.modelId === "kling-3.0" && item.modeId === "text_to_video" && item.resolution === "4k")?.creditsPerSecond).toBe(300);
    expect(prices.find((item) => item.modelId === "veo-3.1-fast" && item.modeId === "multi_image_reference" && item.resolution === "4k")?.creditsPerSecond).toBe(78);
    expect(prices.find((item) => item.modelId === "kling-3.0" && item.modeId === "motion_control" && item.resolution === "1080p")?.creditsPerSecond).toBe(124);
    expect(prices.find((item) => item.modelId === "kling-3.0-motion" && item.modeId === "motion_control" && item.resolution === "1080p")).toBeUndefined();
    expect(prices.find((item) => item.modelId === "kling-2.6-motion" && item.modeId === "motion_control" && item.resolution === "1080p")?.creditsPerSecond).toBe(124);
    expect(roundCreditsToFive(287.5)).toBe(290);

    const groups = new Map<string, Set<number>>();
    for (const item of prices) {
      if (item.modelId === "kling-3.0" && item.modeId === "motion_control") continue;
      const key = `${item.modelId}:${item.resolution}`;
      groups.set(key, (groups.get(key) ?? new Set()).add(item.creditsPerSecond));
    }
    for (const values of groups.values()) expect(values.size).toBe(1);
  });

  it("converts Crun credits into CNY fen and 2x sale credits", () => {
    expect(crunCreditsToCnyFen(5)).toBe(17);
    expect(crunCreditsToCnyFen(98.4)).toBe(335);
    expect(saleCreditsForCnyCost(335)).toBe(670);
  });

  it("converts Veo per-video prices into per-second prices", () => {
    const prices = defaultVideoCreditPrices();
    expect(prices.find((item) => item.modelId === "veo-3.1-fast" && item.resolution === "720p")?.creditsPerSecond).toBe(26);
    expect(prices.find((item) => item.modelId === "veo-3.1" && item.resolution === "1080p")?.creditsPerSecond).toBe(198);
  });
});

describe("credit margins", () => {
  it("marks missing costs without blocking saves", () => {
    const estimate = estimateMarginFromCost({ credits: 100, unit: "image" });
    expect(estimate.marginStatus).toBe("cost_missing");
    expect(estimate.estimatedMarginPercent).toBeNull();
  });

  it("classifies warning and blocked margin bands", () => {
    expect(marginStatus(54.9)).toBe("warning");
    expect(marginStatus(34.9)).toBe("blocked");
    expect(marginStatus(55)).toBe("healthy");
  });

  it("calculates CNY cost margins with one credit equal to one fen", () => {
    const estimate = estimateMarginFromCost({
      credits: 200,
      costPerUnitMinor: 100,
      currency: "cny",
      unit: "image",
    });
    expect(estimate.estimatedMarginCredits).toBe(100);
    expect(estimate.estimatedMarginPercent).toBe(50);
    expect(estimate.marginStatus).toBe("warning");
  });
});
