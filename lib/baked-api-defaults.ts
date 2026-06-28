/**
 * 打包默认 API：首次访问、清空存储或 localStorage 某字段为空时，回落到此处。
 * 生图各槽 apiKey 若留空字符串，则在 `DEFAULT_IMAGE_SETTINGS` 组装时用 LLM API 的同一把 Key 回填。
 *
 * ⚠️ 安全须知：
 * - 此处不允许硬编码真实 API Key。Key 从 `NEXT_PUBLIC_BAKED_API_KEY` 环境变量读取。
 * - 没有环境变量时回退到空字符串，由后台系统 API 配置补齐。
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

/** 系统生图默认走 CRUN 统一任务接口。 */
const CRUN_CREATE_TASK = "https://api.crun.ai/api/v1/client/job/CreateTask";

const CRUN_IMAGE_API_KEY = BAKED_LLM_SETTINGS.apiKey;

export const BAKED_IMAGE_MODEL_DEFAULTS = {
  "gpt-image-2": {
    endpointUrl: CRUN_CREATE_TASK,
    apiKey: CRUN_IMAGE_API_KEY,
    modelName: "openai/gpt-image-2-premium",
  },
  "nano-banana-2": {
    endpointUrl: CRUN_CREATE_TASK,
    apiKey: CRUN_IMAGE_API_KEY,
    modelName: "google/nano-banana-2",
  },
  "nano-banana-pro": {
    endpointUrl: CRUN_CREATE_TASK,
    apiKey: CRUN_IMAGE_API_KEY,
    modelName: "google/nano-banana-pro",
  },
  "grok-imagine-i2i": {
    endpointUrl: CRUN_CREATE_TASK,
    apiKey: CRUN_IMAGE_API_KEY,
    modelName: "grok-imagine/i2i",
  },
  "z-image": {
    endpointUrl: CRUN_CREATE_TASK,
    apiKey: CRUN_IMAGE_API_KEY,
    modelName: "z-image",
  },
} as const;

const CRUN_VIDEO_API_KEY = BAKED_LLM_SETTINGS.apiKey;

export const BAKED_VIDEO_MODEL_DEFAULTS = {
  "seedance-2.0": {
    baseUrl: CRUN_CREATE_TASK,
    apiKey: CRUN_VIDEO_API_KEY,
  },
  "seedance-2.0-fast": {
    baseUrl: CRUN_CREATE_TASK,
    apiKey: CRUN_VIDEO_API_KEY,
  },
  "seedance-2.0-mini": {
    baseUrl: CRUN_CREATE_TASK,
    apiKey: CRUN_VIDEO_API_KEY,
  },
  "seedance-1.5-pro": {
    baseUrl: CRUN_CREATE_TASK,
    apiKey: CRUN_VIDEO_API_KEY,
  },
  "doubao-seedance-1.0-pro-fast": {
    baseUrl: CRUN_CREATE_TASK,
    apiKey: CRUN_VIDEO_API_KEY,
  },
  "seedance-1.0-pro": {
    baseUrl: CRUN_CREATE_TASK,
    apiKey: CRUN_VIDEO_API_KEY,
  },
  "kling-3.0": {
    baseUrl: CRUN_CREATE_TASK,
    apiKey: CRUN_VIDEO_API_KEY,
  },
  "kling-3.0-motion": {
    baseUrl: CRUN_CREATE_TASK,
    apiKey: CRUN_VIDEO_API_KEY,
  },
  "kling-2.6-motion": {
    baseUrl: CRUN_CREATE_TASK,
    apiKey: CRUN_VIDEO_API_KEY,
  },
  "happyhorse-1.1": {
    baseUrl: CRUN_CREATE_TASK,
    apiKey: CRUN_VIDEO_API_KEY,
  },
  "happyhorse-1.0": {
    baseUrl: CRUN_CREATE_TASK,
    apiKey: CRUN_VIDEO_API_KEY,
  },
  "grok-imagine": {
    baseUrl: CRUN_CREATE_TASK,
    apiKey: CRUN_VIDEO_API_KEY,
  },
  "veo-3.1": {
    baseUrl: CRUN_CREATE_TASK,
    apiKey: CRUN_VIDEO_API_KEY,
  },
  "veo-3.1-fast": {
    baseUrl: CRUN_CREATE_TASK,
    apiKey: CRUN_VIDEO_API_KEY,
  },
  "veo-3.1-lite": {
    baseUrl: CRUN_CREATE_TASK,
    apiKey: CRUN_VIDEO_API_KEY,
  },
  "gemini-omni": {
    baseUrl: CRUN_CREATE_TASK,
    apiKey: CRUN_VIDEO_API_KEY,
  },
} as const;
