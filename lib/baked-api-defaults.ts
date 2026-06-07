/**
 * 打包默认 API：首次访问、清空存储或 localStorage 某字段为空时，回落到此处。
 * 生图各槽 apiKey 若留空字符串，则在 `DEFAULT_IMAGE_SETTINGS` 组装时用 LLM API 的同一把 Key 回填。
 *
 * ⚠️ 安全须知：
 * - 此处不允许硬编码真实 API Key。Key 从 `NEXT_PUBLIC_BAKED_API_KEY` 环境变量读取。
 * - 没有环境变量时回退到空字符串，不影响 Supabase store/设置页存储的值。
 * - 若需永久覆盖默认 Key，请在 Zeabur / 。env.local 中设置 `NEXT_PUBLIC_BAKED_API_KEY`。
 */

function envKey(): string {
  if (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_BAKED_API_KEY) {
    return process.env.NEXT_PUBLIC_BAKED_API_KEY;
  }
  // 浏览器端通过 __NEXT_DATA__ 读取 public env
  if (typeof window !== "undefined") {
    try {
      const data = (window as unknown as Record<string, unknown>).__NEXT_DATA__;
      const env = (data as Record<string, unknown>)?.runtimeConfig as Record<string, string> | undefined;
      if (env?.NEXT_PUBLIC_BAKED_API_KEY) return env.NEXT_PUBLIC_BAKED_API_KEY;
    } catch {
      // 安全降级
    }
  }
  return "";
}

function envUrl(): string {
  if (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_BAKED_API_URL) {
    return process.env.NEXT_PUBLIC_BAKED_API_URL;
  }
  return "https://grsai.dakka.com.cn/v1/chat/completions";
}

function envModel(): string {
  if (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_BAKED_MODEL) {
    return process.env.NEXT_PUBLIC_BAKED_MODEL;
  }
  return "gpt-5.4";
}

export const BAKED_LLM_SETTINGS = {
  apiUrl: envUrl(),
  apiKey: envKey(),
  model: envModel(),
} as const;

/** 三槽共用同一 Grsai draw 提交地址（路由按槽位 `provider` 区分 JSON 体形态） */
const GRS_DRAW_COMPLETIONS = "https://grsai.dakka.com.cn/v1/draw/completions";

const GRS_IMAGE_API_KEY = BAKED_LLM_SETTINGS.apiKey;

export const BAKED_IMAGE_MODEL_DEFAULTS = {
  "gpt-image-2": {
    endpointUrl: GRS_DRAW_COMPLETIONS,
    apiKey: GRS_IMAGE_API_KEY,
    modelName: "gpt-image-2",
  },
  "nano-banana-2": {
    endpointUrl: GRS_DRAW_COMPLETIONS,
    apiKey: GRS_IMAGE_API_KEY,
    modelName: "nano-banana-2",
  },
  "nano-banana-pro": {
    endpointUrl: GRS_DRAW_COMPLETIONS,
    apiKey: GRS_IMAGE_API_KEY,
    modelName: "nano-banana-pro",
  },
} as const;
