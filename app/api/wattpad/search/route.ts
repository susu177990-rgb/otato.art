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
  const keyword = typeof b.keyword === "string" ? b.keyword.trim() : "";
  if (!keyword) {
    return NextResponse.json({ error: "keyword is required" }, { status: 400 });
  }

  const payload = {
    keyword,
    max_results: typeof b.maxResults === "number" ? b.maxResults : Number(b.max_results) || 20,
    page_size: typeof b.pageSize === "number" ? b.pageSize : Number(b.page_size) || 50,
    include_mature: Boolean(b.includeMature ?? b.include_mature),
    include_paywalled: Boolean(b.includePaywalled ?? b.include_paywalled),
  };

  try {
    const res = await fetch(`${baseUrl()}/v1/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(120_000),
    });
    const text = await res.text();
    return new NextResponse(text, {
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
