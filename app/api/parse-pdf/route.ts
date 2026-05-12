import { NextRequest } from "next/server";
import pdfParse from "pdf-parse";

export const runtime = "nodejs";

const MAX_BYTES = 15 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") {
      return Response.json({ error: "缺少 file 字段" }, { status: 400 });
    }
    if (!(file instanceof Blob)) {
      return Response.json({ error: "无效的文件字段" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return Response.json({ error: "文件过大（上限约 15MB）" }, { status: 400 });
    }
    const buf = Buffer.from(await file.arrayBuffer());
    // pdf-parse@1.x 在 Node 中稳定，避免 v2 + pdfjs worker 在 Next 打包后挂起/无响应
    const data = await pdfParse(buf);
    const text = (data.text ?? "").trim();
    return Response.json({ text, pages: data.numpages });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "解析 PDF 失败" },
      { status: 400 }
    );
  }
}
