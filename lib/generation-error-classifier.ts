export type GenerationReasonCode =
  | "CONTENT_REJECTED"
  | "INVALID_PROMPT"
  | "AUTH_OR_KEY"
  | "QUOTA_OR_BILLING"
  | "ACCOUNT_LIMIT"
  | "PROVIDER_UNAVAILABLE"
  | "TIMEOUT"
  | "STORAGE_FAILED"
  | "UNKNOWN_PROVIDER_FAILURE";

export type ClassifiedGenerationError = {
  reasonCode: GenerationReasonCode;
  userMessage: string;
};

const USER_MESSAGES: Record<GenerationReasonCode, string> = {
  CONTENT_REJECTED: "内容可能触发安全审核，请降低敏感、身体强化、身份复刻或暴力等描述。",
  INVALID_PROMPT: "提示词参数不符合模型限制，请缩短提示词或调整比例、参考图数量。",
  AUTH_OR_KEY: "系统 API 鉴权失败，请联系管理员检查密钥。",
  QUOTA_OR_BILLING: "上游额度不足或账户不可用，请联系管理员检查余额。",
  ACCOUNT_LIMIT: "当前账号生成受限，请等待已有任务完成或联系管理员。",
  PROVIDER_UNAVAILABLE: "上游服务暂不可用，请稍后重试或换模型。",
  TIMEOUT: "任务等待超时，请稍后重试。",
  STORAGE_FAILED: "生成结果保存失败，请稍后重试。",
  UNKNOWN_PROVIDER_FAILURE: "上游生成失败，未返回具体原因；如果普通提示词可成功，通常是内容策略或模型侧拒绝。",
};

function normalizedHaystack(parts: Array<unknown>): string {
  return parts
    .map((part) => {
      if (part === null || part === undefined) return "";
      if (typeof part === "string") return part;
      try {
        return JSON.stringify(part);
      } catch {
        return String(part);
      }
    })
    .join("\n")
    .toLowerCase();
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return value;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
}

function extractValidationErrors(value: unknown): string[] {
  const parsed = parseMaybeJson(value);
  if (!parsed || typeof parsed !== "object") return [];
  if (Array.isArray(parsed)) {
    return parsed.flatMap(extractValidationErrors);
  }
  const row = parsed as Record<string, unknown>;
  const direct = row.errors;
  if (Array.isArray(direct)) {
    return direct
      .map((item) => typeof item === "string" ? item.trim() : JSON.stringify(item))
      .filter(Boolean)
      .slice(0, 3);
  }
  return [
    ...extractValidationErrors(row.error),
    ...extractValidationErrors(row.data),
    ...extractValidationErrors(row.details),
  ].slice(0, 3);
}

function formatValidationMessage(errors: string[]): string | undefined {
  if (errors.length === 0) return undefined;
  return `参数校验失败：${errors.join("；")}`;
}

export function messageForGenerationReason(reasonCode: GenerationReasonCode): string {
  return USER_MESSAGES[reasonCode];
}

export function formatGenerationErrorForDisplay(params: {
  code?: string;
  reasonCode?: string;
  userMessage?: string;
  fallbackCode?: string;
  fallbackMessage?: string;
}): string {
  const reasonCode = params.reasonCode?.trim();
  const userMessage = params.userMessage?.trim();
  if (reasonCode && userMessage) return `${userMessage}（${reasonCode}）`;
  const code = params.code?.trim() || params.fallbackCode?.trim();
  if (code) return code;
  return params.fallbackMessage?.trim() || "UNKNOWN_PROVIDER_FAILURE";
}

export function classifyGenerationError(params: {
  message?: unknown;
  upstreamBody?: unknown;
  status?: unknown;
  stage?: unknown;
  fallbackReasonCode?: GenerationReasonCode;
}): ClassifiedGenerationError {
  const status = Number(params.status);
  const stage = String(params.stage ?? "");
  const text = normalizedHaystack([params.message, params.upstreamBody]);

  let reasonCode: GenerationReasonCode = params.fallbackReasonCode ?? "UNKNOWN_PROVIDER_FAILURE";
  let userMessage: string | undefined;
  if (stage === "storage" || stage === "storage_persist_failed") {
    reasonCode = "STORAGE_FAILED";
  } else if (stage === "upstream_timeout" || stage === "provider_timeout" || /timeout|timed out|超时/.test(text)) {
    reasonCode = "TIMEOUT";
  } else if (
    /moderation|input_moderation|output_moderation|safety|policy|content policy|blocked|rejected|sensitive|violate|违规|审核|安全/.test(text)
  ) {
    reasonCode = "CONTENT_REJECTED";
  } else if (
    !params.fallbackReasonCode &&
    (status === 400 ||
      status === 422 ||
      /missing params|type error|invalid input|invalid param|validation|maximum|maxlength|max length|too long|at most|参数|比例|参考图|提示词.*字符/.test(text))
  ) {
    reasonCode = "INVALID_PROMPT";
    userMessage = formatValidationMessage(extractValidationErrors(params.upstreamBody));
  } else if (status === 401 || status === 403 || /unauthori[sz]ed|forbidden|api key|apikey|invalid key|鉴权|密钥|未授权/.test(text)) {
    reasonCode = "AUTH_OR_KEY";
  } else if (status === 402 || /insufficient|quota|credit|billing|balance|余额|额度|积分/.test(text)) {
    reasonCode = "QUOTA_OR_BILLING";
  } else if (!params.fallbackReasonCode && (status === 429 || status === 455 || status === 500 || status === 501 || status === 502 || status === 503 || status === 504)) {
    reasonCode = "PROVIDER_UNAVAILABLE";
  }

  return {
    reasonCode,
    userMessage: userMessage ?? USER_MESSAGES[reasonCode],
  };
}
