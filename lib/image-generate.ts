import type { NextRequest } from "next/server";
import { extractImageFromUpstreamResponse } from "@/lib/image-generation-response";
import {
  type GptImageQuality,
  type ImageAspectRatio,
  type ImageModelSettings,
  type ImageSizeTier,
} from "@/lib/image-workspace";

type GenerateBody = {
  prompt?: string;
  model?: ImageModelSettings;
  aspectRatio?: ImageAspectRatio;
  imageSize?: ImageSizeTier;
  /** gpt-image-* 专用：auto | low | medium | high；缺省时按清晰度档位映射 */
  gptImageQuality?: GptImageQuality;
  refImages?: string[];
};

export type ImageGenerationFailureStage =
  | "request_parse"
  | "model_config"
  | "upstream_submit"
  | "upstream_poll"
  | "upstream_parse"
  | "upstream_timeout"
  | "storage"
  | "unknown";

export type ImageGenerationErrorDetails = {
  stage: ImageGenerationFailureStage;
  routeKind?: string;
  endpoint?: string;
  status?: number;
  taskId?: string;
  upstreamBody?: string;
};

export class ImageGenerationError extends Error {
  readonly details: ImageGenerationErrorDetails;

  constructor(message: string, details: ImageGenerationErrorDetails, cause?: unknown) {
    super(message);
    this.name = "ImageGenerationError";
    this.details = details;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

function endpointForDiagnostics(url: string): string {
  const raw = url.trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return raw.replace(/[?#].*$/, "");
  }
}

function textSnippet(value: string, max = 700): string {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

async function responseTextSnippet(response: Response): Promise<string> {
  return textSnippet(await response.text().catch(() => ""));
}

function networkErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return "网络请求失败";
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const buf = Buffer.from(await blob.arrayBuffer());
  const mime = blob.type || "application/octet-stream";
  return `data:${mime};base64,${buf.toString("base64")}`;
}

async function parseGenerateRequest(req: NextRequest): Promise<{ ok: false; response: Response } | { ok: true; body: GenerateBody }> {
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("multipart/form-data")) {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return {
        ok: false,
        response: Response.json(
          { error: "无法解析 multipart 请求（体积过大或传输中断）。", code: "FORM_PARSE_FAILED" },
          { status: 400 },
        ),
      };
    }
    const metaField = form.get("meta");
    if (typeof metaField !== "string" || !metaField.trim()) {
      return {
        ok: false,
        response: Response.json({ error: "multipart 请求缺少 meta JSON。", code: "META_MISSING" }, { status: 400 }),
      };
    }
    let metaObj: unknown;
    try {
      metaObj = JSON.parse(metaField);
    } catch {
      return {
        ok: false,
        response: Response.json({ error: "meta 字段不是合法 JSON。", code: "META_JSON_INVALID" }, { status: 400 }),
      };
    }
    const meta = metaObj && typeof metaObj === "object" ? (metaObj as Record<string, unknown>) : {};
    const refImages: string[] = Array.isArray(meta.refImages)
      ? meta.refImages.filter((x): x is string => typeof x === "string" && x.length > 0)
      : [];
    for (const part of form.getAll("ref")) {
      if (part instanceof Blob && part.size > 0) {
        refImages.push(await blobToDataUrl(part));
      }
    }
    const gq = meta.gptImageQuality;
    const body: GenerateBody = {
      prompt: typeof meta.prompt === "string" ? meta.prompt : undefined,
      model: meta.model as ImageModelSettings | undefined,
      aspectRatio: meta.aspectRatio as ImageAspectRatio | undefined,
      imageSize: meta.imageSize as ImageSizeTier | undefined,
      gptImageQuality:
        gq === "auto" || gq === "low" || gq === "medium" || gq === "high" ? (gq as GptImageQuality) : undefined,
      refImages,
    };
    return { ok: true, body };
  }

  const raw = (await req.json().catch(() => null)) as GenerateBody | null;
  if (!raw || typeof raw !== "object") {
    return {
      ok: false,
      response: Response.json(
        {
          error:
            "请求正文无法解析为 JSON。若包含多张高清参考图，请使用本站作图页的默认提交（multipart 原图）；仍失败时请减少参考图数量或检查反向代理的 client_max_body_size。",
          code: "BODY_PARSE_FAILED",
        },
        { status: 400 },
      ),
    };
  }
  const refImages = Array.isArray(raw.refImages)
    ? raw.refImages.filter((x): x is string => typeof x === "string" && x.length > 0)
    : [];
  return { ok: true, body: { ...raw, refImages } };
}

/** OpenAI GPT Image：moderation 省略（默认 auto），避免劣质中转把枚举误解析成数字。 */
/** Grsai `/draw/completions`（gpt-image）仍传 moderation，与常见中转示例一致 */
const GRSAI_GPT_IMAGE_MODERATION = "low";
const POLL_INTERVAL_MS = 1500;
const POLL_MAX_TRIES = 120; // ~3 分钟

const STANDARD_IMAGE_SIZE_BY_RATIO: Record<Exclude<ImageAspectRatio, "auto">, Record<ImageSizeTier, string>> = {
  "1:1": { "1K": "1280x1280", "2K": "1920x1920", "4K": "3840x3840" },
  "3:4": { "1K": "960x1280", "2K": "1440x1920", "4K": "2880x3840" },
  "4:3": { "1K": "1280x960", "2K": "1920x1440", "4K": "3840x2880" },
  "9:16": { "1K": "720x1280", "2K": "1080x1920", "4K": "2160x3840" },
  "16:9": { "1K": "1280x720", "2K": "1920x1080", "4K": "3840x2160" },
  "21:9": { "1K": "1280x549", "2K": "1920x823", "4K": "3840x1646" },
  "3:2": { "1K": "1280x853", "2K": "1920x1280", "4K": "3840x2560" },
  "2:3": { "1K": "853x1280", "2K": "1280x1920", "4K": "2560x3840" },
};

const isGptImageModel = (m: string) => /^gpt-image-/i.test(m.trim());
const usesGptImage2StyleResolution = (m: string) => /^gpt-image-2(-vip)?$/i.test(m.trim());

function floorTo16(n: number): number {
  return Math.max(16, Math.floor(n / 16) * 16);
}

function clampWxHForGptImage2(wxh: string): string {
  const [w0, h0] = wxh.split("x").map((v) => Number(v));
  let w = w0, h = h0;
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return wxh;
  let scale = 1;
  if (Math.max(w, h) > 3840) scale = Math.min(scale, 3840 / Math.max(w, h));
  if (w * h > 8_294_400) scale = Math.min(scale, Math.sqrt(8_294_400 / (w * h)));
  w = floorTo16(w * scale);
  h = floorTo16(h * scale);
  for (let i = 0; i < 32; i += 1) {
    if (Math.max(w, h) <= 3840 && w * h <= 8_294_400) break;
    const shrink = Math.min(3840 / Math.max(w, h), Math.sqrt(8_294_400 / Math.max(w * h, 1)), 0.999);
    w = floorTo16(w * shrink);
    h = floorTo16(h * shrink);
  }
  return `${w}x${h}`;
}

function resolveOpenAiSize(ratio: ImageAspectRatio, imageSize: ImageSizeTier, modelName: string): string {
  if (ratio === "auto") return "auto";
  const wxh = STANDARD_IMAGE_SIZE_BY_RATIO[ratio][imageSize];
  if (usesGptImage2StyleResolution(modelName)) return clampWxHForGptImage2(wxh);
  return wxh;
}

function resolveGrsaiGptImageAspectRatio(ratio: ImageAspectRatio, imageSize: ImageSizeTier, modelName: string): string {
  if (ratio === "auto") return "auto";
  if (usesGptImage2StyleResolution(modelName)) return clampWxHForGptImage2(STANDARD_IMAGE_SIZE_BY_RATIO[ratio][imageSize]);
  if (isGptImageModel(modelName)) return STANDARD_IMAGE_SIZE_BY_RATIO[ratio][imageSize];
  return ratio;
}

function gptImageQualityFromTier(t: ImageSizeTier): "low" | "medium" | "high" {
  if (t === "4K") return "high";
  if (t === "2K") return "medium";
  return "low";
}

function buildNanoBananaImageConfig(aspectRatio: ImageAspectRatio, imageSize: ImageSizeTier): Record<string, unknown> {
  return aspectRatio === "auto" ? { imageSize } : { aspectRatio, imageSize };
}

function buildNanoBananaGenerationConfig(
  aspectRatio: ImageAspectRatio,
  imageSize: ImageSizeTier,
): Record<string, unknown> {
  const imageConfig = buildNanoBananaImageConfig(aspectRatio, imageSize);
  return {
    responseModalities: ["Image"],
    responseFormat: {
      image: imageConfig,
    },
    imageConfig,
  };
}

function buildGrsaiNanoBananaPayload(
  modelName: string,
  prompt: string,
  aspectRatio: ImageAspectRatio,
  imageSize: ImageSizeTier,
): Record<string, unknown> {
  const imageConfig = buildNanoBananaImageConfig(aspectRatio, imageSize);
  const generationConfig = buildNanoBananaGenerationConfig(aspectRatio, imageSize);
  return {
    model: modelName,
    prompt,
    /** Grsai draw endpoint legacy fields. */
    aspectRatio,
    imageSize,
    /** Gemini image-generation compatible fields used by newer Nano Banana gateways. */
    generationConfig,
    config: generationConfig,
    responseFormat: {
      image: imageConfig,
    },
    imageConfig,
  };
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, data] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)?.[1] || "image/jpeg";
  return new Blob([Buffer.from(data, "base64")], { type: mime });
}

function imageExt(mime: string): string {
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  return "jpg";
}

type Route =
  | { kind: "grsai-nano-banana"; submitUrl: string; resultUrl: string }
  | { kind: "grsai-gpt-image"; submitUrl: string; resultUrl: string }
  | { kind: "openai-images"; baseUrl: string }
  | { kind: "chat-completions"; url: string };

/**
 * 文档：异步绘画提交为 POST `/v1/draw/{nano-banana|completions|...}`，
 * 单独取结果：POST `/v1/draw/result`，Body `{ "id": "<任务 id>" }`，
 * 响应 `{ code, msg, data }`，其中 `data` 内含 `status`、`progress`、`results[].url`（code 0 成功，-22 任务不存在）。
 */
function grsaiDrawResultUrl(submitUrl: string): string {
  const raw = submitUrl.trim();
  try {
    const parsed = new URL(raw);
    const path = parsed.pathname.replace(/\/+$/, "") || "/";
    if (/\/draw\/result$/i.test(path)) return parsed.toString();
    const replaced = path.replace(/\/draw\/[^/]+$/i, "/draw/result");
    if (replaced !== path) {
      parsed.pathname = replaced;
      return parsed.toString();
    }
  } catch {
    // 非绝对 URL 时退回字符串替换
  }
  return raw.replace(/\/draw\/[^/?#]+(\?.*)?$/i, "/draw/result$1");
}

function inferRoute(endpointUrl: string, provider: ImageModelSettings["provider"]): Route {
  const url = endpointUrl.trim();
  const lower = url.toLowerCase();

  /**
   * 路由优先看「你填的 URL」路径；不向用户规定必须填哪条地址。
   * `provider` 仅在路径无法区分异步 draw 的两种 JSON 体时使用（用户选的预设槽位）。
   */
  if (/\/draw\/nano-banana(\?|$)/i.test(url)) {
    return { kind: "grsai-nano-banana", submitUrl: url, resultUrl: grsaiDrawResultUrl(url) };
  }
  if (/\/draw\/completions(\?|$)/i.test(url)) {
    return provider === "gpt-image"
      ? { kind: "grsai-gpt-image", submitUrl: url, resultUrl: grsaiDrawResultUrl(url) }
      : { kind: "grsai-nano-banana", submitUrl: url, resultUrl: grsaiDrawResultUrl(url) };
  }
  if (/\/chat(\/|$)/i.test(url)) {
    return { kind: "chat-completions", url };
  }
  if (/\/images\//i.test(url)) {
    return { kind: "openai-images", baseUrl: url };
  }
  if (/(grsai|dakka)/i.test(lower)) {
    return provider === "gpt-image"
      ? { kind: "grsai-gpt-image", submitUrl: url, resultUrl: grsaiDrawResultUrl(url) }
      : { kind: "grsai-nano-banana", submitUrl: url, resultUrl: grsaiDrawResultUrl(url) };
  }
  return { kind: "chat-completions", url };
}

// ---------- Grsai 异步出图 ----------

/** 中转返回的成功状态多样，不能只认 succeeded */
function grsaiTerminalSuccessStatus(status: unknown): boolean {
  if (status === undefined || status === null || status === "") return false;
  const s = String(status).trim().toLowerCase();
  return s === "succeeded" || s === "success" || s === "completed" || s === "complete" || s === "done" || s === "finished";
}

/** code：官方示例为 0；不少中转用 200 表示成功 */
function grsaiResponseOk(code: unknown): boolean {
  if (code === undefined || code === null) return true;
  if (typeof code !== "number") return true;
  return code === 0 || code === 200;
}

function pickNonEmptyUrl(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

function parseGrsaiImageUrl(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  const o = data as Record<string, unknown>;
  /** 顶层常有 `"url": ""` 占位；必须先跳过空串再查 results */
  const topUrl = pickNonEmptyUrl(o.url);
  if (topUrl) return topUrl;
  const iu = pickNonEmptyUrl(o.image_url) ?? pickNonEmptyUrl(o.imageUrl);
  if (iu) return iu;
  if (typeof o.output === "string" && (o.output.startsWith("http") || o.output.startsWith("data:"))) return o.output.trim();
  if (typeof o.result === "string" && (o.result.startsWith("http") || o.result.startsWith("data:"))) return o.result.trim();
  if (o.result && typeof o.result === "object") {
    const nested = parseGrsaiImageUrl(o.result);
    if (nested) return nested;
  }
  if (typeof o.b64_json === "string") return `data:image/png;base64,${o.b64_json}`;
  if (Array.isArray(o.results) && o.results.length > 0) {
    const first = o.results[0];
    if (typeof first === "string") return pickNonEmptyUrl(first);
    if (first && typeof first === "object") {
      const f = first as Record<string, unknown>;
      const u = pickNonEmptyUrl(f.url) ?? pickNonEmptyUrl(f.image_url);
      if (u) return u;
      if (typeof f.b64_json === "string") return `data:image/png;base64,${f.b64_json}`;
    }
  }
  if (Array.isArray(o.data) && o.data.length > 0) return parseGrsaiImageUrl(o.data[0]);
  if (o.data && typeof o.data === "object") {
    const inner = parseGrsaiImageUrl(o.data);
    if (inner) return inner;
  }
  return undefined;
}

async function readGrsaiBody(response: Response): Promise<Record<string, unknown> | null> {
  const text = await response.text();
  const trimmed = text.trim();
  if (!trimmed) return null;

  /** 优先整块解析：上游常返回 pretty-print 多行 JSON，按行 parse 会全部失败 */
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    // 再走 SSE / NDJSON 兜底
  }

  const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const payloads = lines.length ? lines : [trimmed];
  let last: Record<string, unknown> | null = null;
  for (const line of payloads) {
    const norm = line.startsWith("data:") ? line.slice(5).trim() : line;
    if (!norm || norm === "[DONE]") continue;
    try {
      const parsed = JSON.parse(norm) as Record<string, unknown>;
      last = parsed;
      const dataObj = (parsed.data as Record<string, unknown> | undefined) || undefined;
      const st = parsed.status ?? dataObj?.status;
      if (parsed.progress === 100 || grsaiTerminalSuccessStatus(st)) {
        return parsed;
      }
    } catch {
      // ignore
    }
  }
  return last;
}

async function generateViaGrsai(
  apiKey: string,
  route: Route & { kind: "grsai-nano-banana" | "grsai-gpt-image" },
  modelName: string,
  prompt: string,
  aspectRatio: ImageAspectRatio,
  imageSize: ImageSizeTier,
  gptImageQuality: GptImageQuality | undefined,
  refImages: string[],
): Promise<string> {
  const urls = refImages.filter((r) => r && (r.startsWith("http") || r.startsWith("data:")));

  const grsaiGptQuality: "low" | "medium" | "high" =
    gptImageQuality === "auto"
      ? gptImageQualityFromTier(imageSize)
      : gptImageQuality ?? gptImageQualityFromTier(imageSize);

  const body: Record<string, unknown> =
    route.kind === "grsai-gpt-image"
      ? {
          model: modelName,
          prompt,
          aspectRatio: resolveGrsaiGptImageAspectRatio(aspectRatio, imageSize, modelName),
          quality: grsaiGptQuality,
          moderation: GRSAI_GPT_IMAGE_MODERATION,
        }
      : {
          ...buildGrsaiNanoBananaPayload(modelName, prompt, aspectRatio, imageSize),
        };
  if (urls.length > 0) body.urls = urls;

  const diagnosticBase = {
    routeKind: route.kind,
    endpoint: endpointForDiagnostics(route.submitUrl),
  };

  let submit: Response;
  try {
    submit = await fetch(route.submitUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new ImageGenerationError(
      `未能连接到 API 中转站：${networkErrorMessage(error)}`,
      { ...diagnosticBase, stage: "upstream_submit" },
      error,
    );
  }

  if (!submit.ok) {
    const err = await responseTextSnippet(submit);
    throw new ImageGenerationError(
      `API 中转站提交失败 (${submit.status})${err ? `: ${err}` : ""}`,
      { ...diagnosticBase, stage: "upstream_submit", status: submit.status, upstreamBody: err },
    );
  }

  const initData = await readGrsaiBody(submit);
  const immediate = parseGrsaiImageUrl(initData);
  if (immediate) return immediate;

  if (initData && typeof initData.code === "number" && !grsaiResponseOk(initData.code)) {
    const upstreamBody = textSnippet(JSON.stringify(initData));
    throw new ImageGenerationError(
      (initData.msg as string) || `API 中转站返回错误码 ${initData.code}`,
      { ...diagnosticBase, stage: "upstream_submit", upstreamBody },
    );
  }

  const dataObj = (initData?.data as Record<string, unknown> | undefined) || {};
  const taskIdRaw =
    (dataObj.id as string) ||
    (initData?.id as string) ||
    (initData?.taskId as string) ||
    (typeof initData?.task_id === "string" ? initData.task_id : "");
  const taskId = typeof taskIdRaw === "string" ? taskIdRaw.trim() : "";
  if (!taskId) {
    const upstreamBody = initData ? textSnippet(JSON.stringify(initData)) : "";
    throw new ImageGenerationError(
      (initData?.msg as string) || "API 中转站已响应，但没有返回任务 ID；后台可能没有真正创建绘图任务。",
      { ...diagnosticBase, stage: "upstream_parse", upstreamBody },
    );
  }

  /** POST `route.resultUrl`（一般为 `/v1/draw/result`），与文档一致：`{ "id": taskId }` */
  for (let i = 0; i < POLL_MAX_TRIES; i += 1) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    let res: Response;
    try {
      res = await fetch(route.resultUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ id: taskId }),
      });
    } catch (error) {
      throw new ImageGenerationError(
        `查询绘图结果失败：${networkErrorMessage(error)}`,
        { stage: "upstream_poll", routeKind: route.kind, endpoint: endpointForDiagnostics(route.resultUrl), taskId },
        error,
      );
    }
    if (!res.ok) {
      const err = await responseTextSnippet(res);
      throw new ImageGenerationError(
        `查询绘图结果失败 (${res.status})${err ? `: ${err}` : ""}`,
        {
          stage: "upstream_poll",
          routeKind: route.kind,
          endpoint: endpointForDiagnostics(route.resultUrl),
          status: res.status,
          taskId,
          upstreamBody: err,
        },
      );
    }
    const r = await readGrsaiBody(res);
    if (!r) continue;
    if (r.code === -22) {
      throw new ImageGenerationError("API 中转站提示任务不存在。", {
        stage: "upstream_poll",
        routeKind: route.kind,
        endpoint: endpointForDiagnostics(route.resultUrl),
        taskId,
        upstreamBody: textSnippet(JSON.stringify(r)),
      });
    }
    if (typeof r.code === "number" && !grsaiResponseOk(r.code)) {
      throw new ImageGenerationError((r.msg as string) || "获取绘图结果失败", {
        stage: "upstream_poll",
        routeKind: route.kind,
        endpoint: endpointForDiagnostics(route.resultUrl),
        taskId,
        upstreamBody: textSnippet(JSON.stringify(r)),
      });
    }

    const data = (r.data as Record<string, unknown>) || r;
    const statusStr = data.status ?? r.status;
    if (
      typeof statusStr === "string" &&
      /^(failed|failure|error|canceled|cancelled)$/i.test(statusStr.trim()) &&
      !grsaiTerminalSuccessStatus(statusStr)
    ) {
      const reason = (data.failure_reason as string) || (data.error as string) || statusStr || "未知错误";
      const message = reason.includes("output_moderation")
        ? "输出违规"
        : reason.includes("input_moderation")
          ? "输入违规"
          : reason;
      throw new ImageGenerationError(message, {
        stage: "upstream_poll",
        routeKind: route.kind,
        endpoint: endpointForDiagnostics(route.resultUrl),
        taskId,
        upstreamBody: textSnippet(JSON.stringify(r)),
      });
    }
    if (data.status === "failed") {
      const reason = (data.failure_reason as string) || (data.error as string) || "未知错误";
      const message = reason === "output_moderation" ? "输出违规" : reason === "input_moderation" ? "输入违规" : reason;
      throw new ImageGenerationError(message, {
        stage: "upstream_poll",
        routeKind: route.kind,
        endpoint: endpointForDiagnostics(route.resultUrl),
        taskId,
        upstreamBody: textSnippet(JSON.stringify(r)),
      });
    }

    const imgUrl = parseGrsaiImageUrl(data) ?? parseGrsaiImageUrl(r);
    /** progress 已为 100 且能解析出图址时直接返回，避免异常 status 文案卡住轮询 */
    if (imgUrl && (Number(r.progress) === 100 || Number(data.progress) === 100)) return imgUrl;
    const pending =
      typeof statusStr === "string" &&
      /pending|queued|processing|running|waiting|submitted|progress/i.test(statusStr) &&
      !grsaiTerminalSuccessStatus(statusStr);
    if (imgUrl && !pending) return imgUrl;
    if (imgUrl && grsaiTerminalSuccessStatus(statusStr)) return imgUrl;
  }

  throw new ImageGenerationError("生成超时，请稍后重试", {
    stage: "upstream_timeout",
    routeKind: route.kind,
    endpoint: endpointForDiagnostics(route.resultUrl),
    taskId,
  });
}

// ---------- OpenAI Images（/v1/images/generations 与 /v1/images/edits） ----------

async function generateViaOpenAIImages(
  apiKey: string,
  endpointUrl: string,
  modelName: string,
  prompt: string,
  aspectRatio: ImageAspectRatio,
  imageSize: ImageSizeTier,
  gptImageQuality: GptImageQuality | undefined,
  refImages: string[],
): Promise<string> {
  const isGpt = isGptImageModel(modelName);
  const size = resolveOpenAiSize(aspectRatio, imageSize, modelName);
  /** 中转常见 bug：无法处理 quality「auto」字符串；对外只发 low/medium/high */
  const quality: "low" | "medium" | "high" =
    gptImageQuality === undefined || gptImageQuality === "auto"
      ? gptImageQualityFromTier(imageSize)
      : gptImageQuality;

  if (refImages.length === 0) {
    const payload: Record<string, unknown> = { model: modelName, prompt, n: 1, size };
    if (isGpt) {
      payload.quality = quality;
      payload.output_format = "png";
      /** 不传 moderation / response_format：减少与 OpenAI 子集不兼容的中转冲突 */
    } else {
      payload.image_size = imageSize;
    }
    let r: Response;
    try {
      r = await fetch(endpointUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      throw new ImageGenerationError(
        `未能连接到图片 API：${networkErrorMessage(error)}`,
        { stage: "upstream_submit", routeKind: "openai-images", endpoint: endpointForDiagnostics(endpointUrl) },
        error,
      );
    }
    if (!r.ok) {
      const err = await responseTextSnippet(r);
      throw new ImageGenerationError(
        `图片 API 提交失败 (${r.status})${err ? `: ${err}` : ""}`,
        {
          stage: "upstream_submit",
          routeKind: "openai-images",
          endpoint: endpointForDiagnostics(endpointUrl),
          status: r.status,
          upstreamBody: err,
        },
      );
    }
    return readImageOrThrow(r);
  }

  const editsUrl = endpointUrl.replace(/\/generations(?:\?.*)?$/, "/edits");
  const fd = new FormData();

  /** OpenAI 官方 curl：model → image[] → prompt → …（参见 image-generation 指南 Edit Images） */
  fd.append("model", modelName);

  let appended = 0;
  let idx = 0;
  for (const raw of refImages) {
    const image = typeof raw === "string" ? raw.trim() : "";
    if (!image) continue;
    try {
      if (image.startsWith("data:")) {
        const blob = dataUrlToBlob(image);
        fd.append("image[]", blob, `ref_${idx}.${imageExt(blob.type)}`);
        idx += 1;
        appended += 1;
      } else if (/^https?:\/\//i.test(image)) {
        const imgRes = await fetch(image, { signal: AbortSignal.timeout(45_000) });
        if (!imgRes.ok) continue;
        const blob = await imgRes.blob();
        const mime = blob.type || "image/jpeg";
        fd.append("image[]", blob, `ref_${idx}.${imageExt(mime)}`);
        idx += 1;
        appended += 1;
      }
    } catch {
      // 单张失败则跳过，继续其余参考图
    }
  }
  if (appended === 0) {
    throw new Error(
      "没有可用的参考图：请上传本地图片，或确保参考图为可直连下载的 http(s) 链接（本地图对应官方文档中的 Base64 data URL / 文件上传流程）。",
    );
  }

  fd.append("prompt", prompt);
  fd.append("n", "1");
  fd.append("size", size === "auto" ? "1024x1024" : size);
  if (isGpt) {
    fd.append("quality", quality);
    fd.append("output_format", "png");
  } else {
    fd.append("image_size", imageSize);
  }

  let r: Response;
  try {
    r = await fetch(editsUrl, { method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: fd });
  } catch (error) {
    throw new ImageGenerationError(
      `未能连接到图片编辑 API：${networkErrorMessage(error)}`,
      { stage: "upstream_submit", routeKind: "openai-images", endpoint: endpointForDiagnostics(editsUrl) },
      error,
    );
  }
  if (!r.ok) {
    const err = await responseTextSnippet(r);
    throw new ImageGenerationError(
      `图片编辑 API 提交失败 (${r.status})${err ? `: ${err}` : ""}`,
      {
        stage: "upstream_submit",
        routeKind: "openai-images",
        endpoint: endpointForDiagnostics(editsUrl),
        status: r.status,
        upstreamBody: err,
      },
    );
  }
  return readImageOrThrow(r);
}

// ---------- /v1/chat/completions（多模态） ----------

async function generateViaChatCompletions(
  apiKey: string,
  endpointUrl: string,
  modelName: string,
  prompt: string,
  aspectRatio: ImageAspectRatio,
  imageSize: ImageSizeTier,
  refImages: string[],
): Promise<string> {
  const userContent: Array<Record<string, unknown>> = [{ type: "text", text: prompt }];
  for (const ref of refImages) {
    if (ref.startsWith("data:") || ref.startsWith("http")) {
      userContent.push({ type: "image_url", image_url: { url: ref } });
    }
  }
  const useGoogleStyle = /gemini/i.test(modelName) || /^nano-banana/i.test(modelName);
  const payload: Record<string, unknown> = {
    model: modelName,
    prompt,
    messages: [{ role: "user", content: refImages.length ? userContent : prompt }],
  };
  if (useGoogleStyle) {
    payload.generationConfig = buildNanoBananaGenerationConfig(aspectRatio, imageSize);
    payload.safetySettings = [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
    ];
  }
  let r: Response;
  try {
    r = await fetch(endpointUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    throw new ImageGenerationError(
      `未能连接到 Chat Completions API：${networkErrorMessage(error)}`,
      { stage: "upstream_submit", routeKind: "chat-completions", endpoint: endpointForDiagnostics(endpointUrl) },
      error,
    );
  }
  if (!r.ok) {
    const err = await responseTextSnippet(r);
    throw new ImageGenerationError(
      `Chat Completions API 提交失败 (${r.status})${err ? `: ${err}` : ""}`,
      {
        stage: "upstream_submit",
        routeKind: "chat-completions",
        endpoint: endpointForDiagnostics(endpointUrl),
        status: r.status,
        upstreamBody: err,
      },
    );
  }
  return readImageOrThrow(r);
}

// ---------- 通用：解析响应里的图片 ----------

async function readImageOrThrow(response: Response): Promise<string> {
  const cloned = response.clone();
  const result = await extractImageFromUpstreamResponse(response);
  if (result.imageUrl) return result.imageUrl.trim();
  if (result.errorMessage) throw new Error(result.errorMessage);

  const rawText = await cloned.text();
  let parsed: unknown = null;
  try {
    parsed = rawText.trim() ? JSON.parse(rawText) : null;
  } catch {
    parsed = null;
  }
  if (parsed && typeof parsed === "object") {
    const o = parsed as Record<string, unknown>;
    if (typeof o.code === "number" && o.code !== 0) {
      throw new Error((o.msg as string) || (o.message as string) || `上游错误码 ${o.code}`);
    }
  }
  const ct = cloned.headers.get("content-type") || "(无 Content-Type)";
  const snippet =
    parsed !== null && typeof parsed === "object"
      ? JSON.stringify(parsed).replace(/\s+/g, " ").slice(0, 320)
      : rawText.replace(/\s+/g, " ").slice(0, 320);
  throw new Error(
    snippet
      ? `未在上游响应中找到图片地址。Content-Type=${ct}，响应片段：${snippet}`
      : `未在上游响应中找到图片地址。Content-Type=${ct}`,
  );
}

export type GenerateImageParams = {
  model: ImageModelSettings;
  prompt: string;
  aspectRatio?: ImageAspectRatio;
  imageSize?: ImageSizeTier;
  gptImageQuality?: GptImageQuality;
  refImages?: string[];
};

export async function generateImage(params: GenerateImageParams): Promise<{ imageUrl: string; payloadKind: string }> {
  const model = params.model;
  const prompt = params.prompt?.trim() || "";
  if (!prompt) throw new Error("prompt 必填");

  const aspectRatio = params.aspectRatio || "4:3";
  const imageSize = params.imageSize || "1K";
  const gptImageQuality = params.gptImageQuality;
  const refImages = Array.isArray(params.refImages) ? params.refImages.filter(Boolean) : [];

  const endpointUrl = model.endpointUrl.trim();
  const modelName = model.modelName.trim();

  const route = inferRoute(endpointUrl, model.provider);
  let imageUrl: string;
  if (route.kind === "grsai-nano-banana" || route.kind === "grsai-gpt-image") {
    imageUrl = await generateViaGrsai(
      model.apiKey,
      route,
      modelName,
      prompt,
      aspectRatio,
      imageSize,
      gptImageQuality,
      refImages,
    );
  } else if (route.kind === "openai-images") {
    imageUrl = await generateViaOpenAIImages(
      model.apiKey,
      route.baseUrl,
      modelName,
      prompt,
      aspectRatio,
      imageSize,
      gptImageQuality,
      refImages,
    );
  } else {
    imageUrl = await generateViaChatCompletions(
      model.apiKey,
      route.url,
      modelName,
      prompt,
      aspectRatio,
      imageSize,
      refImages,
    );
  }

  return { imageUrl, payloadKind: route.kind };
}

export { buildGrsaiNanoBananaPayload, parseGenerateRequest, type GenerateBody };
