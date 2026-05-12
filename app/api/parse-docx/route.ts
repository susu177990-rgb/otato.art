import { NextRequest } from "next/server";
import mammoth from "mammoth";

export const runtime = "nodejs";

const MAX_BYTES = 15 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!file || !(file instanceof Blob)) {
      return Response.json({ error: "缺少 file 字段" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return Response.json({ error: "文件过大（上限约 15MB）" }, { status: 400 });
    }
    const buf = Buffer.from(await file.arrayBuffer());
    const result = await mammoth.extractRawText({ buffer: buf });
    const text = result.value?.trim() ?? "";
    return Response.json({ text, messages: result.messages });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "解析 docx 失败" },
      { status: 400 }
    );
  }
}
