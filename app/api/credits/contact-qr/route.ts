import { NextResponse } from "next/server";
import sharp from "sharp";
import { requireAdmin } from "@/lib/api/admin-auth";
import { putMediaObject } from "@/lib/media-storage";

const CONTACT_QR_STORAGE_PATH = "site/contact/recharge-wechat-qr.jpg";
const MAX_CONTACT_QR_BYTES = 8 * 1024 * 1024;
const OUTPUT_SIZE = 1024;

function imageUrl() {
  return `/api/credits/contact-qr/image?v=${Date.now()}`;
}

export async function GET() {
  const auth = await requireAdmin();
  const isAdmin = !("error" in auth);
  return NextResponse.json({
    imageUrl: imageUrl(),
    canUpload: isAdmin,
  });
}

export async function POST(req: Request) {
  try {
    const auth = await requireAdmin("manageSystem");
    if ("error" in auth) return auth.error;

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: "请上传二维码图片" }, { status: 400 });
    }
    if (file.size <= 0) {
      return NextResponse.json({ error: "二维码图片为空" }, { status: 400 });
    }
    if (file.size > MAX_CONTACT_QR_BYTES) {
      return NextResponse.json({ error: "二维码图片不能超过 8MB" }, { status: 400 });
    }

    const inputType = (file.type || "").toLowerCase().split(";")[0]?.trim() || "";
    if (inputType && !inputType.startsWith("image/")) {
      return NextResponse.json({ error: "请上传图片文件" }, { status: 400 });
    }

    const input = Buffer.from(await file.arrayBuffer());
    const output = await sharp(input)
      .rotate()
      .resize(OUTPUT_SIZE, OUTPUT_SIZE, { fit: "cover", position: "centre" })
      .jpeg({ quality: 92 })
      .toBuffer();

    await putMediaObject({
      key: CONTACT_QR_STORAGE_PATH,
      bytes: output,
      contentType: "image/jpeg",
    });

    return NextResponse.json({
      imageUrl: imageUrl(),
      canUpload: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "上传二维码失败";
    console.error("[credits/contact-qr POST]", error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
