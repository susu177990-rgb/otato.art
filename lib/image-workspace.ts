export type ImageModeId = "real-character-asset" | "free";

/** 作图页左侧模式顺序与展示名 */
export const IMAGE_MODES: ReadonlyArray<{ id: ImageModeId; label: string }> = [
  { id: "free", label: "自由模式" },
  { id: "real-character-asset", label: "真实角色资产" },
];
export type ImageModelId = "gpt-image-2" | "nano-banana-2" | "nano-banana-pro";
export type ImageAspectRatio = "auto" | "1:1" | "2:3" | "3:2" | "3:4" | "4:3" | "9:16" | "16:9" | "21:9";
export type ImageSizeTier = "1K" | "2K" | "4K";
export type ImageGenerationStatus = "success" | "error";

export const IMAGE_SETTINGS_STORAGE_KEY = "script-agent-image-settings";
export const IMAGE_GALLERY_STORAGE_KEY = "script-agent-image-gallery";

export const REAL_CHARACTER_ASSET_PROMPT = `# 任务目标：生成超写实真人角色视觉档案底图（全性别通用宫格版）
# 执行背景：基于多重参考图与下方“## 5. 角色设定”文本描述，生成极度真实的商业级角色基础设定图，用于后续角色一致性与换装生成。

## 1. 风格基调与摄影质感
* 风格基调：极度写实的电影级商业摄影与原相机直出质感结合。必须看起来是在高端专业影棚中拍摄的真人模特照片，杜绝任何CG感、AI绘画感、3D建模感或美颜滤镜感。
* 质感要求：重点展现极度自然的真实皮肤纹理（毛孔、微瑕疵、胡茬或绒毛、真实的肤色过渡）和发丝细节。严禁添加任何不真实的泛红或水光油腻感。
* 镜头透视：真实 iPhone 原相机直出感。摄影背景必须保持全景深清晰，杜绝背景虚化，维持绝对客观的真实镜头空间感。若涉及第一人称视角，必须严格隐藏拍摄设备。

## 2. 背景与光影设定
    * 环境：真实室内白墙背景，干净无杂物，无家具干扰。
    * 光线：柔和均匀白光，接近平光，干净自然，轻微立体感，清楚表现五官骨相、白嫩肤质和上半身曲线，不要硬光，不要脏阴影，不要过曝。
    * 成像质感：Raw-style iPhone native camera photo, iPhone straight-out-of-camera look, realistic smartphone optics, natural skin texture, subtle sensor detail, real person photography, not CGI, not 3D, not illustration, not overly retouched.


## 3. 多重参考图融合指令
* 面部参考图分析执行：严格抓取并映射上传的面部参考图中的五官特征、骨相结构、肤色和年龄感。在宫格的所有画面中，人物必须是绝对的同一个人，保持百分之百的面部身份一致性。在后续使用强变化时，必须严格维持该角色的视觉基因。
* 服装参考图分析执行：严格复刻上传的服装参考图的具体设计款式、面料材质、颜色细节和整体版型。确保服装在正面半身、头部肖像以及全身的三视图（正面、侧面、背面）中的穿着效果是连贯且物理正确的。

## 4. 排版与构图标准
* 构图布局：4:3横屏画幅。采用精密的宫格构图结构：
    * 左侧大图，占画面约百分之四十：正面 waist-up 半身照主图，完整保留头顶，下边缘截取在肚脐下方到胯骨上方之间，人物站立身体摆正直视镜头，重点展示面部、肩颈线条与上半身服装比例。
    * 右上排宫格，面部肖像三视图：
\t1.  画面左侧：0度正视图（完全正面，直视镜头）
\t2.  画面中间：45度侧脸（微侧向左前方，展示面部立体感）
\t3.  画面右侧：90度正侧面（完全侧向左侧，展示侧颜剪影和下颌线）
    * 右下排宫格，全身三视图：
\t1.  画面左侧：正视图（全身，面向镜头）
\t2.  画面中间：侧视图（全身，90度转向侧面）
\t3.  画面右侧：后视图（全身，背对镜头）

## 5. 角色设定
{{用户输入}}`;

export interface ImageModelSettings {
  id: ImageModelId;
  label: string;
  modelName: string;
  endpointUrl: string;
  apiKey: string;
  provider: "gpt-image" | "nano-banana";
}

export interface ImageWorkspaceSettings {
  prompts: Record<ImageModeId, string>;
  models: Record<ImageModelId, ImageModelSettings>;
}

export interface ImageGalleryRecord {
  id: string;
  createdAt: string;
  modeId: ImageModeId;
  modeName: string;
  modelId: ImageModelId;
  modelName: string;
  finalPrompt: string;
  userInput: string;
  aspectRatio: ImageAspectRatio;
  imageSize: ImageSizeTier;
  imageUrl?: string;
  refImageCount: number;
  status: ImageGenerationStatus;
  error?: string;
}

export const IMAGE_MODEL_ORDER: ImageModelId[] = ["gpt-image-2", "nano-banana-2", "nano-banana-pro"];

export const DEFAULT_IMAGE_SETTINGS: ImageWorkspaceSettings = {
  prompts: {
    "real-character-asset": REAL_CHARACTER_ASSET_PROMPT,
    /** 自由模式：不使用固定模版，最终提示词 = 用户输入（可留空由校验拦截） */
    free: "",
  },
  models: {
    "gpt-image-2": {
      id: "gpt-image-2",
      label: "gpt-image-2",
      modelName: "gpt-image-2",
      endpointUrl: "",
      apiKey: "",
      provider: "gpt-image",
    },
    "nano-banana-2": {
      id: "nano-banana-2",
      label: "nano-banana-2",
      modelName: "gemini-3.1-flash-image-preview",
      endpointUrl: "",
      apiKey: "",
      provider: "nano-banana",
    },
    "nano-banana-pro": {
      id: "nano-banana-pro",
      label: "nano-banana-pro",
      modelName: "nano-banana-pro",
      endpointUrl: "",
      apiKey: "",
      provider: "nano-banana",
    },
  },
};

export function mergeImageSettings(raw: unknown): ImageWorkspaceSettings {
  const source = raw && typeof raw === "object" ? (raw as Partial<ImageWorkspaceSettings>) : {};
  const sourcePrompts = source.prompts && typeof source.prompts === "object" ? source.prompts : {};
  const sourceModels = source.models && typeof source.models === "object" ? source.models : {};

  return {
    prompts: {
      ...DEFAULT_IMAGE_SETTINGS.prompts,
      ...sourcePrompts,
    },
    models: IMAGE_MODEL_ORDER.reduce((acc, id) => {
      acc[id] = {
        ...DEFAULT_IMAGE_SETTINGS.models[id],
        ...(sourceModels as Partial<Record<ImageModelId, Partial<ImageModelSettings>>>)[id],
        id,
        provider: DEFAULT_IMAGE_SETTINGS.models[id].provider,
      };
      return acc;
    }, {} as Record<ImageModelId, ImageModelSettings>),
  };
}

export function buildImagePrompt(template: string, userInput: string): string {
  const trimmedUser = userInput.trim();
  if (!template.trim()) return trimmedUser;
  if (template.includes("{{用户输入}}")) {
    return template.replaceAll("{{用户输入}}", trimmedUser);
  }
  return `${template.trim()}\n\n## 5. 角色设定\n${trimmedUser}`;
}
