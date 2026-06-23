import { fetchWithRetry } from "@/lib/fetch-with-retry";
import type { ApiUsageMode, WorkspaceSnapshot } from "@/lib/db/workspace-settings-store";
import type { ImageModelId, ImageModelSettings } from "@/lib/image-workspace";
import { resolveLlmModel } from "@/lib/llm-models";
import type { LlmModelConfig } from "@/lib/types";
import type { VideoModelId, VideoModelSettings } from "@/lib/video-workspace";

export type PersonalApiModule = keyof ApiUsageMode;

export type PersonalApiTestRequest = {
  module?: PersonalApiModule;
  modelId?: string;
};

export type PersonalApiTestResult = {
  ok: boolean;
  code: string;
  module: PersonalApiModule;
  modelId?: string;
  stage: "mode" | "model_config" | "upstream_submit" | "upstream_response";
  message: string;
  safeEndpoint?: string;
  status?: number;
};

const MODULE_LABELS: Record<PersonalApiModule, string> = {
  llm: "LLM",
  image: "图片",
  video: "视频",
};

function safeEndpoint(url: string | undefined): string | undefined {
  const raw = url?.trim();
  if (!raw) return undefined;
  try {
    const parsed = new URL(raw);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return raw.replace(/[?#].*$/, "");
  }
}

function hasValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function result(params: PersonalApiTestResult): PersonalApiTestResult {
  return params;
}

function requireUserMode(snapshot: WorkspaceSnapshot, module: PersonalApiModule, modelId?: string): PersonalApiTestResult | null {
  if (snapshot.apiUsageMode?.[module] === "user") return null;
  return result({
    ok: false,
    code: "API_MODE_NOT_USER",
    module,
    modelId,
    stage: "mode",
    message: `当前${MODULE_LABELS[module]}仍在使用公共配置。请先保存个人配置后再测试。`,
  });
}

function validateLlmConfig(model: LlmModelConfig): PersonalApiTestResult | null {
  const endpoint = safeEndpoint(model.apiUrl);
  if (!model.apiUrl.trim() || !model.apiKey.trim() || !model.modelName.trim()) {
    return result({
      ok: false,
      code: "MODEL_CONFIG_INCOMPLETE",
      module: "llm",
      modelId: model.id,
      stage: "model_config",
      message: `LLM 模型「${model.label || model.id}」缺少 API URL / API Key / 模型 ID。`,
      safeEndpoint: endpoint,
    });
  }
  if (!hasValidUrl(model.apiUrl)) {
    return result({
      ok: false,
      code: "ENDPOINT_INVALID",
      module: "llm",
      modelId: model.id,
      stage: "model_config",
      message: `LLM 模型「${model.label || model.id}」的 API URL 不是有效的 http(s) 地址。`,
      safeEndpoint: endpoint,
    });
  }
  return null;
}

function validateImageConfig(model: ImageModelSettings): PersonalApiTestResult {
  const endpoint = safeEndpoint(model.endpointUrl);
  if (!model.endpointUrl.trim() || !model.apiKey.trim() || !model.modelName.trim()) {
    return result({
      ok: false,
      code: "MODEL_CONFIG_INCOMPLETE",
      module: "image",
      modelId: model.id,
      stage: "model_config",
      message: `图片模型「${model.label || model.id}」缺少 Endpoint / API Key / 模型名。`,
      safeEndpoint: endpoint,
    });
  }
  if (!hasValidUrl(model.endpointUrl)) {
    return result({
      ok: false,
      code: "ENDPOINT_INVALID",
      module: "image",
      modelId: model.id,
      stage: "model_config",
      message: `图片模型「${model.label || model.id}」的 Endpoint 不是有效的 http(s) 地址。`,
      safeEndpoint: endpoint,
    });
  }
  return result({
    ok: true,
    code: "CONFIG_READY",
    module: "image",
    modelId: model.id,
    stage: "model_config",
    message: `图片模型「${model.label || model.id}」配置完整。为避免消耗额度，本测试未提交真实生图任务。`,
    safeEndpoint: endpoint,
  });
}

function isAutoDispatchedVideoModel(modelId: string): boolean {
  return modelId === "seedance-2.0" ||
    modelId === "seedance-2.0-fast" ||
    modelId === "seedance-1.5-pro" ||
    modelId === "doubao-seedance-1.0-pro-fast" ||
    modelId === "kling-3.0" ||
    modelId === "kling-2.6-motion" ||
    modelId === "happyhorse-1.1" ||
    modelId === "happyhorse-1.0" ||
    modelId === "grok-imagine" ||
    modelId === "veo-3.1" ||
    modelId === "veo-3.1-fast";
}

function validateVideoConfig(model: VideoModelSettings): PersonalApiTestResult {
  const endpoint = safeEndpoint(model.baseUrl);
  if (!model.enabled) {
    return result({
      ok: false,
      code: "MODEL_DISABLED",
      module: "video",
      modelId: model.id,
      stage: "model_config",
      message: `视频模型「${model.label || model.id}」当前未启用。`,
      safeEndpoint: endpoint,
    });
  }
  const apiModelNameRequired = !isAutoDispatchedVideoModel(model.id);
  if (!model.baseUrl.trim() || !model.apiKey.trim() || (apiModelNameRequired && !model.apiModelName.trim())) {
    return result({
      ok: false,
      code: "MODEL_CONFIG_INCOMPLETE",
      module: "video",
      modelId: model.id,
      stage: "model_config",
      message: apiModelNameRequired
        ? `视频模型「${model.label || model.id}」缺少 Base URL / API Key / API Model Name。`
        : `视频模型「${model.label || model.id}」缺少 Base URL / API Key。`,
      safeEndpoint: endpoint,
    });
  }
  if (!hasValidUrl(model.baseUrl)) {
    return result({
      ok: false,
      code: "ENDPOINT_INVALID",
      module: "video",
      modelId: model.id,
      stage: "model_config",
      message: `视频模型「${model.label || model.id}」的 Base URL 不是有效的 http(s) 地址。`,
      safeEndpoint: endpoint,
    });
  }
  return result({
    ok: true,
    code: "CONFIG_READY",
    module: "video",
    modelId: model.id,
    stage: "model_config",
    message: `视频模型「${model.label || model.id}」配置完整。为避免消耗额度，本测试未提交真实视频任务。`,
    safeEndpoint: endpoint,
  });
}

function upstreamFailure(module: PersonalApiModule, modelId: string, endpoint: string | undefined, status: number, text: string): PersonalApiTestResult {
  if (status === 401 || status === 403) {
    return result({
      ok: false,
      code: "AUTH_FAILED",
      module,
      modelId,
      stage: "upstream_response",
      status,
      message: "上游拒绝认证，请检查 API Key 是否正确或是否有权限访问该模型。",
      safeEndpoint: endpoint,
    });
  }
  if (status === 429) {
    return result({
      ok: false,
      code: "RATE_LIMITED",
      module,
      modelId,
      stage: "upstream_response",
      status,
      message: "上游返回限流或额度不足，请检查账号余额、额度或稍后重试。",
      safeEndpoint: endpoint,
    });
  }
  const hint = text.replace(/\s+/g, " ").trim().slice(0, 180);
  return result({
    ok: false,
    code: "UPSTREAM_REJECTED",
    module,
    modelId,
    stage: "upstream_response",
    status,
    message: hint ? `上游返回错误：${hint}` : `上游返回 HTTP ${status}。`,
    safeEndpoint: endpoint,
  });
}

export async function testPersonalApiConnection(snapshot: WorkspaceSnapshot, request: PersonalApiTestRequest): Promise<PersonalApiTestResult> {
  const apiModule = request.module;
  if (apiModule !== "llm" && apiModule !== "image" && apiModule !== "video") {
    return result({
      ok: false,
      code: "MODULE_INVALID",
      module: "llm",
      stage: "model_config",
      message: "测试类型无效，请刷新设置页后重试。",
    });
  }

  const modeError = requireUserMode(snapshot, apiModule, request.modelId);
  if (modeError) return modeError;

  if (apiModule === "image") {
    const model = snapshot.imageWorkspace.models[request.modelId as ImageModelId];
    if (!model) {
      return result({
        ok: false,
        code: "MODEL_NOT_FOUND",
        module: apiModule,
        modelId: request.modelId,
        stage: "model_config",
        message: "图片模型不存在，请刷新设置页后重试。",
      });
    }
    return validateImageConfig(model);
  }

  if (apiModule === "video") {
    const model = snapshot.videoWorkspace.models[request.modelId as VideoModelId];
    if (!model) {
      return result({
        ok: false,
        code: "MODEL_NOT_FOUND",
        module: apiModule,
        modelId: request.modelId,
        stage: "model_config",
        message: "视频模型不存在，请刷新设置页后重试。",
      });
    }
    return validateVideoConfig(model);
  }

  const model = resolveLlmModel(snapshot.llm, request.modelId);
  const configError = validateLlmConfig(model);
  if (configError) return configError;

  const endpoint = safeEndpoint(model.apiUrl);
  try {
    const upstream = await fetchWithRetry(
      model.apiUrl,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${model.apiKey}`,
        },
        body: JSON.stringify({
          model: model.modelName,
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 1,
          stream: false,
        }),
        signal: AbortSignal.timeout(12_000),
      },
      { maxAttempts: 1 },
    );

    if (!upstream.ok) {
      return upstreamFailure("llm", model.id, endpoint, upstream.status, await upstream.text().catch(() => ""));
    }

    return result({
      ok: true,
      code: "CONNECTION_OK",
      module: "llm",
      modelId: model.id,
      stage: "upstream_response",
      status: upstream.status,
      message: `LLM 模型「${model.label || model.id}」连接成功。`,
      safeEndpoint: endpoint,
    });
  } catch (error) {
    return result({
      ok: false,
      code: "UPSTREAM_UNREACHABLE",
      module: "llm",
      modelId: model.id,
      stage: "upstream_submit",
      message: error instanceof Error && error.message.trim()
        ? `无法连接上游：${error.message.trim()}`
        : "无法连接上游，请检查 API URL 或网络。",
      safeEndpoint: endpoint,
    });
  }
}
