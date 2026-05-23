import sharp from "sharp";

export const MODE_COVER_INPUT_MAX_BYTES = 5 * 1024 * 1024;
/** 缩略图最长边上限；fit inside，不裁切、不放大 */
export const MODE_COVER_THUMB_MAX_WIDTH = 480;
export const MODE_COVER_THUMB_MAX_HEIGHT = 480;
export const MODE_COVER_WEBP_QUALITY = 82;
export const MODE_COVER_OUTPUT_MIME = "image/webp";

const ALLOWED_INPUT_MIME = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export function assertModeCoverInput(contentType: string, byteLength: number): void {
  const mime = contentType.toLowerCase().split(";")[0]?.trim() || "";
  if (!ALLOWED_INPUT_MIME.has(mime)) {
    throw new Error("仅支持 PNG / JPEG / WebP / GIF 封面图");
  }
  if (!byteLength) throw new Error("封面图为空");
  if (byteLength > MODE_COVER_INPUT_MAX_BYTES) {
    throw new Error(`封面图不能超过 ${Math.round(MODE_COVER_INPUT_MAX_BYTES / (1024 * 1024))}MB`);
  }
}

export async function prepareModeCoverThumbnail(input: Uint8Array): Promise<Uint8Array> {
  try {
    const out = await sharp(Buffer.from(input), { failOn: "none" })
      .rotate()
      .resize(MODE_COVER_THUMB_MAX_WIDTH, MODE_COVER_THUMB_MAX_HEIGHT, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: MODE_COVER_WEBP_QUALITY })
      .toBuffer();
    if (!out.byteLength) throw new Error("封面图处理后为空");
    return new Uint8Array(out);
  } catch (e) {
    if (e instanceof Error && e.message === "封面图处理后为空") throw e;
    throw new Error("无法解析或处理封面图，请换一张图片");
  }
}
