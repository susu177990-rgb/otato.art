import type { Settings } from "@/lib/types";
import type { LiveActionAssetBundle, LiveActionImageAsset } from "@/lib/ai-live-action/types";

type MessagePart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

function imagePart(asset: LiveActionImageAsset): MessagePart[] {
  return [
    { type: "text", text: `图片素材：${asset.id}｜${asset.label}${asset.name ? `｜文件名：${asset.name}` : ""}` },
    { type: "image_url", image_url: { url: asset.dataUrl } },
  ];
}

export function buildAssetSummary(bundle: LiveActionAssetBundle): string {
  const characters = bundle.characters.length
    ? bundle.characters.map((item) => `- ${item.name}：${item.image.id}${item.notes ? `｜${item.notes}` : ""}`).join("\n")
    : "- 无目标角色图";
  const props = bundle.props.length
    ? bundle.props
        .map((item) => {
          const binding = item.boundCharacterName ? `｜关联角色：${item.boundCharacterName}` : "";
          return `- ${item.name}：${item.image.id}${binding}${item.notes ? `｜${item.notes}` : ""}`;
        })
        .join("\n")
    : "- 无目标道具图";

  return `【素材索引】
- SRC_FIRST_FRAME：原实拍视频片段首帧图
- SCENE_GRID：目标场景资产宫格图
${bundle.markedSceneGridImage ? "- MARKED_SCENE_GRID：带位置/角色标识的目标场景资产宫格图" : "- MARKED_SCENE_GRID：未提供"}

【角色图】
${characters}

【道具图】
${props}

【用户意图/注意事项】
${bundle.userIntent}

【比例策略】
${bundle.aspectRatio}（按照原实拍首帧图的比例确定；如果为 auto，请根据原实拍首帧推断最接近比例）`;
}

function buildImageParts(bundle: LiveActionAssetBundle): MessagePart[] {
  const parts: MessagePart[] = [];
  parts.push(...imagePart(bundle.sourceFirstFrameImage));
  parts.push(...imagePart(bundle.sceneGridImage));
  if (bundle.markedSceneGridImage) parts.push(...imagePart(bundle.markedSceneGridImage));
  for (const character of bundle.characters) parts.push(...imagePart(character.image));
  for (const prop of bundle.props) parts.push(...imagePart(prop.image));
  return parts;
}

export async function runLiveActionLlm(params: {
  settings: Settings;
  systemPrompt: string;
  taskText: string;
  bundle: LiveActionAssetBundle;
  temperature?: number;
  includeImages?: boolean;
  timeoutMs?: number;
}): Promise<string> {
  const endpointUrl = params.settings.apiUrl?.trim();
  const apiKey = params.settings.apiKey?.trim();
  const model = params.settings.model?.trim();
  if (!endpointUrl || !apiKey || !model) {
    throw new Error("请先在设置 → LLM API 中填写 API URL、模型与 API Key");
  }

  const content: MessagePart[] = [
    { type: "text", text: `${params.taskText}\n\n${buildAssetSummary(params.bundle)}` },
    ...(params.includeImages === false ? [] : buildImageParts(params.bundle)),
  ];

  const controller = new AbortController();
  const timeoutMs = params.timeoutMs ?? 600_000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(endpointUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: params.systemPrompt },
          { role: "user", content },
        ],
        stream: false,
        temperature: params.temperature ?? 0.2,
      }),
      signal: controller.signal,
    });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error(`LLM API 请求超时（${Math.round(timeoutMs / 1000)}s）。中转若显示成功，通常是本站在响应读回前先超时；请稍后重试，或减少/压缩参考图。`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();
  if (!response.ok) throw new Error(`LLM API 错误 (${response.status}): ${text.slice(0, 700)}`);

  const parsed = JSON.parse(text) as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  const contentText = parsed.choices?.[0]?.message?.content;
  if (typeof contentText === "string" && contentText.trim()) return contentText.trim();
  if (Array.isArray(contentText)) {
    const joined = contentText
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) {
          const textPart = (part as { text?: unknown }).text;
          return typeof textPart === "string" ? textPart : "";
        }
        return "";
      })
      .filter(Boolean)
      .join("\n")
      .trim();
    if (joined) return joined;
  }
  throw new Error("LLM 未返回可用文本");
}
