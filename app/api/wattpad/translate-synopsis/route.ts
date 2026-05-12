export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { describeUpstreamFetchError } from "@/lib/upstream-fetch-error";

function baseUrl() {
  return process.env.WATTPAD_API_URL?.replace(/\/$/, "") || "http://127.0.0.1:8765";
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Expected object body" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  const text = typeof b.text === "string" ? b.text : "";

  try {
    const res = await fetch(`${baseUrl()}/v1/translate/synopsis`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        source_lang: typeof b.sourceLang === "string" ? b.sourceLang : typeof b.source_lang === "string" ? b.source_lang : "auto",
      }),
      signal: AbortSignal.timeout(120_000),
    });
    const textOut = await res.text();
    /** FastAPI 对未注册路由固定返回 {"detail":"Not Found"} —— 多为旧版 wattpad-api 进程未重启 */
    if (res.status === 404) {
      return NextResponse.json(
        {
          error:
            "Wattpad API 返回 404：当前进程里没有 /v1/translate/synopsis（多为旧代码或未重启）。请在仓库根执行 npm run dev，或在 services/wattpad-api 下重新运行 uvicorn main:app --host 127.0.0.1 --port 8765，并确认 WATTPAD_API_URL 指向该服务。",
        },
        { status: 502 }
      );
    }
    return new NextResponse(textOut, {
      status: res.status,
      headers: { "Content-Type": res.headers.get("content-type") || "application/json" },
    });
  } catch (e) {
    const { message, code } = describeUpstreamFetchError(e);
    return NextResponse.json(
      {
        error: message,
        code,
        hint: "请使用 npm run dev 启动（会自动拉起 Wattpad API）；若只用前端可 npm run dev:web 并另配 WATTPAD_API_URL",
      },
      { status: 502 }
    );
  }
}
