/**
 * 打包默认 API：首次访问、清空存储或 localStorage 某字段为空时，回落到此处。
 * 修改 LLM / 生图网关请改本文件后保存并部署；勿依赖单个浏览器里的 localStorage。
 *
 * 生图各槽 apiKey 若留空字符串，则在 `DEFAULT_IMAGE_SETTINGS` 组装时用 LLM API 的同一把 Key 回填。
 */

export const BAKED_LLM_SETTINGS = {
  apiUrl: "https://grsai.dakka.com.cn/v1/chat/completions",
  apiKey: "sk-47c1db55f16d4200b0e69228c9881792",
  model: "gpt-5.4",
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
