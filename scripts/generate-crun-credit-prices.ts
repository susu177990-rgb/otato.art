import {
  CRUN_CREDITS_PER_USD,
  CRUN_IMAGE_COST_SEEDS,
  CRUN_PLAN_LABEL,
  CRUN_USD_CNY_RATE,
  CRUN_VIDEO_COST_SEEDS,
} from "@/lib/credits/crun-pricing";

const CRUN_PRICING_URL = "https://crun.ai/zh/pricing";
const REQUIRED_SOURCE_LABELS = [
  "Nano Banana 2",
  "Nano Banana Pro",
  "grok-imagine",
  "GPT Image 2 - Premium",
  "Seedance-2.0-mini",
  "Seedance 2.0 Fast",
  "Seedance 2.0",
  "Kling 3.0",
  "2.6",
  "HappyHorse",
  '"Veo"',
];

function extractNuxtPayload(html: string): string {
  const match = html.match(/<script[^>]+id=["']__NUXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match?.[1]) throw new Error("没有在 Crun 页面找到 __NUXT_DATA__ payload");
  return match[1].trim();
}

async function main() {
  const response = await fetch(CRUN_PRICING_URL, {
    headers: { "user-agent": "otato-art-credit-pricing/1.0" },
  });
  if (!response.ok) throw new Error(`读取 Crun 定价页失败：${response.status}`);
  const html = await response.text();
  const payload = extractNuxtPayload(html);
  const missingLabels = REQUIRED_SOURCE_LABELS.filter((label) => !payload.includes(label));
  if (missingLabels.length > 0) {
    throw new Error(`Crun payload 缺少预期模型名：${missingLabels.join(", ")}`);
  }

  const output = {
    sourceUrl: CRUN_PRICING_URL,
    crunPlan: CRUN_PLAN_LABEL,
    crunCreditsPerUsd: CRUN_CREDITS_PER_USD,
    usdCny: CRUN_USD_CNY_RATE,
    imagePrices: CRUN_IMAGE_COST_SEEDS,
    videoPrices: CRUN_VIDEO_COST_SEEDS,
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
