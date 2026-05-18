/**
 * 打包默认 API：首次访问、清空存储或 localStorage 某字段为空时，回落到此处。
 * 修改 LLM / 生图网关请改本文件后保存并部署；勿依赖单个浏览器里的 localStorage。
 *
 * 生图各槽 apiKey 若留空字符串，则在 `DEFAULT_IMAGE_SETTINGS` 组装时用 LLM API 的同一把 Key 回填（同网关时常共用）。
 */

export const BAKED_LLM_SETTINGS = {
  apiUrl: "https://api.bltcy.ai/v1/chat/completions",
  apiKey: "sk-jxPGXe4BdXYbsYbweWRUHTkNMiS6fm3OTTOgfssStrLKiN6S",
  model: "gpt-5.4-mini",
} as const;

function gatewayOrigin(): string {
  try {
    return new URL(BAKED_LLM_SETTINGS.apiUrl).origin;
  } catch {
    return "https://api.bltcy.ai";
  }
}

const G = gatewayOrigin();

/**
 * 与 `inferRoute` 对齐：gpt-image 槽走 draw/completions；nano 槽走 draw/nano-banana。
 * 若你方网关路径不同，请直接改这里的字符串。
 */
export const BAKED_IMAGE_MODEL_DEFAULTS = {
  "gpt-image-2": {
    endpointUrl: `${G}/v1/draw/completions`,
    apiKey: "",
    modelName: "gpt-image-2",
  },
  "nano-banana-2": {
    endpointUrl: `${G}/v1/draw/nano-banana`,
    apiKey: "",
    modelName: "gemini-3.1-flash-image-preview",
  },
  "nano-banana-pro": {
    endpointUrl: `${G}/v1/draw/nano-banana`,
    apiKey: "",
    modelName: "nano-banana-pro",
  },
} as const;
