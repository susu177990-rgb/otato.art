import { NextRequest } from "next/server";
import { extractImageFromUpstreamResponse } from "@/lib/image-generation-response";
import type { ImageAspectRatio, ImageModelSettings, ImageSizeTier } from "@/lib/image-workspace";

type GenerateBody = {
  prompt?: string;
  model?: ImageModelSettings;
  aspectRatio?: ImageAspectRatio;
  imageSize?: ImageSizeTier;
  refImages?: string[];
};

const GPT_IMAGE_MODERATION = "low";
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

function inferRoute(endpointUrl: string, modelName: string, providerHint: string | undefined): Route {
  const url = endpointUrl.trim();
  const lower = url.toLowerCase();
  const replaceDrawTail = (u: string) => u.replace(/\/draw\/[^/?#]+(\?.*)?$/, "/draw/result");

  if (/\/draw\/nano-banana(\?|$)/i.test(url)) {
    return { kind: "grsai-nano-banana", submitUrl: url, resultUrl: replaceDrawTail(url) };
  }
  if (/\/draw\/completions(\?|$)/i.test(url)) {
    return isGptImageModel(modelName)
      ? { kind: "grsai-gpt-image", submitUrl: url, resultUrl: replaceDrawTail(url) }
      : { kind: "grsai-nano-banana", submitUrl: url, resultUrl: replaceDrawTail(url) };
  }
  if (/(grsai|dakka)/i.test(lower)) {
    return isGptImageModel(modelName)
      ? { kind: "grsai-gpt-image", submitUrl: url, resultUrl: replaceDrawTail(url) }
      : { kind: "grsai-nano-banana", submitUrl: url, resultUrl: replaceDrawTail(url) };
  }
  if (/\/chat(\/|$)/i.test(url)) {
    return { kind: "chat-completions", url };
  }
  if (/\/images\//i.test(url) || providerHint === "gpt-image") {
    return { kind: "openai-images", baseUrl: url };
  }
  return { kind: "chat-completions", url };
}

// ---------- Grsai 异步出图 ----------

function parseGrsaiImageUrl(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  const o = data as Record<string, unknown>;
  if (typeof o.url === "string") return o.url;
  if (typeof o.b64_json === "string") return `data:image/png;base64,${o.b64_json}`;
  if (Array.isArray(o.results) && o.results.length > 0) {
    const first = o.results[0];
    if (typeof first === "string") return first;
    if (first && typeof first === "object") {
      const f = first as Record<string, unknown>;
      if (typeof f.url === "string") return f.url;
      if (typeof f.b64_json === "string") return `data:image/png;base64,${f.b64_json}`;
    }
  }
  if (Array.isArray(o.data) && o.data.length > 0) return parseGrsaiImageUrl(o.data[0]);
  return undefined;
}

async function readGrsaiBody(response: Response): Promise<Record<string, unknown> | null> {
  const text = await response.text();
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const payloads = lines.length ? lines : [text.trim()];
  let last: Record<string, unknown> | null = null;
  for (const line of payloads) {
    const norm = line.startsWith("data:") ? line.slice(5).trim() : line;
    if (!norm || norm === "[DONE]") continue;
    try {
      const parsed = JSON.parse(norm) as Record<string, unknown>;
      last = parsed;
      const dataObj = (parsed.data as Record<string, unknown> | undefined) || undefined;
      if (parsed.progress === 100 || parsed.status === "succeeded" || dataObj?.status === "succeeded") {
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
  refImages: string[],
): Promise<string> {
  const urls = refImages.filter((r) => r && (r.startsWith("http") || r.startsWith("data:")));

  const body: Record<string, unknown> =
    route.kind === "grsai-gpt-image"
      ? {
          model: modelName,
          prompt,
          aspectRatio: resolveGrsaiGptImageAspectRatio(aspectRatio, imageSize, modelName),
          quality: gptImageQualityFromTier(imageSize),
          moderation: GPT_IMAGE_MODERATION,
          webHook: "-1",
        }
      : {
          model: modelName,
          prompt,
          aspectRatio,
          imageSize,
          webHook: "-1",
          shutProgress: true,
        };
  if (urls.length > 0) body.urls = urls;

  const submit = await fetch(route.submitUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!submit.ok) {
    const err = await submit.text();
    throw new Error(`API 错误 (${submit.status}): ${err}`);
  }

  const initData = await readGrsaiBody(submit);
  const immediate = parseGrsaiImageUrl((initData?.data as unknown) ?? initData);
  if (immediate) return immediate;

  if (initData && typeof initData.code === "number" && initData.code !== 0) {
    throw new Error((initData.msg as string) || `上游错误码 ${initData.code}`);
  }

  const dataObj = (initData?.data as Record<string, unknown> | undefined) || {};
  const taskId = (dataObj.id as string) || (initData?.id as string) || (initData?.taskId as string);
  if (!taskId) throw new Error((initData?.msg as string) || "未返回任务 ID");

  for (let i = 0; i < POLL_MAX_TRIES; i += 1) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const res = await fetch(route.resultUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ id: taskId }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`获取结果失败 (${res.status}): ${err}`);
    }
    const r = await readGrsaiBody(res);
    if (!r) continue;
    if (r.code === -22) throw new Error("任务不存在");
    if (typeof r.code === "number" && r.code !== 0) throw new Error((r.msg as string) || "获取结果失败");

    const data = (r.data as Record<string, unknown>) || r;
    if (data.status === "failed") {
      const reason = (data.failure_reason as string) || (data.error as string) || "未知错误";
      if (reason === "output_moderation") throw new Error("输出违规");
      if (reason === "input_moderation") throw new Error("输入违规");
      throw new Error(reason);
    }
    const imgUrl = parseGrsaiImageUrl(data);
    if (imgUrl && (!data.status || data.status === "succeeded")) return imgUrl;
  }

  throw new Error("生成超时，请稍后重试");
}

// ---------- OpenAI Images（/v1/images/generations 与 /v1/images/edits） ----------

async function generateViaOpenAIImages(
  apiKey: string,
  endpointUrl: string,
  modelName: string,
  prompt: string,
  aspectRatio: ImageAspectRatio,
  imageSize: ImageSizeTier,
  refImages: string[],
): Promise<string> {
  const isGpt = isGptImageModel(modelName);
  const size = resolveOpenAiSize(aspectRatio, imageSize, modelName);
  const quality = gptImageQualityFromTier(imageSize);

  if (refImages.length === 0) {
    const payload: Record<string, unknown> = { model: modelName, prompt, n: 1, size };
    if (isGpt) {
      payload.quality = quality;
      payload.output_format = "png";
      payload.moderation = GPT_IMAGE_MODERATION;
    } else {
      payload.image_size = imageSize;
    }
    const r = await fetch(endpointUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      const err = await r.text();
      throw new Error(`API 错误 (${r.status}): ${err}`);
    }
    return readImageOrThrow(r);
  }

  const editsUrl = endpointUrl.replace(/\/generations(?:\?.*)?$/, "/edits");
  const fd = new FormData();
  fd.append("model", modelName);
  fd.append("prompt", prompt);
  fd.append("n", "1");
  fd.append("size", size === "auto" ? "1024x1024" : size);
  if (isGpt) {
    fd.append("quality", quality);
    fd.append("output_format", "png");
    fd.append("moderation", GPT_IMAGE_MODERATION);
  } else {
    fd.append("image_size", imageSize);
  }
  refImages.forEach((image, idx) => {
    if (!image.startsWith("data:")) return;
    const blob = dataUrlToBlob(image);
    fd.append("image[]", blob, `ref_${idx}.${imageExt(blob.type)}`);
  });
  const r = await fetch(editsUrl, { method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: fd });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`API 错误 (${r.status}): ${err}`);
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
    payload.generationConfig = {
      imageConfig: aspectRatio === "auto" ? { imageSize } : { imageSize, aspectRatio },
    };
    payload.safetySettings = [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
    ];
  }
  const r = await fetch(endpointUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`API 错误 (${r.status}): ${err}`);
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

// ---------- 路由入口 ----------

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as GenerateBody | null;
  const prompt = body?.prompt?.trim() || "";
  const model = body?.model;
  const aspectRatio = body?.aspectRatio || "4:3";
  const imageSize = body?.imageSize || "1K";
  const refImages = Array.isArray(body?.refImages) ? body.refImages.filter(Boolean) : [];

  if (!prompt) return Response.json({ error: "缺少提示词" }, { status: 400 });
  if (!model?.endpointUrl?.trim() || !model.apiKey?.trim() || !model.modelName?.trim()) {
    return Response.json({ error: "请先在生图设置里填写当前模型的 URL、API Key 和模型名" }, { status: 400 });
  }

  const endpointUrl = model.endpointUrl.trim();
  const modelName = model.modelName.trim();

  try {
    const route = inferRoute(endpointUrl, modelName, model.provider);
    let imageUrl: string;
    if (route.kind === "grsai-nano-banana" || route.kind === "grsai-gpt-image") {
      imageUrl = await generateViaGrsai(model.apiKey, route, modelName, prompt, aspectRatio, imageSize, refImages);
    } else if (route.kind === "openai-images") {
      imageUrl = await generateViaOpenAIImages(
        model.apiKey,
        route.baseUrl,
        modelName,
        prompt,
        aspectRatio,
        imageSize,
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

    return Response.json({ imageUrl, payloadKind: route.kind });
  } catch (error) {
    const message = error instanceof Error ? error.message : "生图失败";
    return Response.json({ error: message }, { status: 500 });
  }
}
