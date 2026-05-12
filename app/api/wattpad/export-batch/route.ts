export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { describeUpstreamFetchError } from "@/lib/upstream-fetch-error";

function baseUrl() {
  return process.env.WATTPAD_API_URL?.replace(/\/$/, "") || "http://127.0.0.1:8765";
}

export const maxDuration = 300;

export async function POST(req: Request) {
  const ct = req.headers.get("content-type") || "";
  if (!ct.includes("multipart/form-data")) {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const form = await req.formData();
  const payload = form.get("payload");
  if (typeof payload !== "string") {
    return NextResponse.json({ error: "payload field required" }, { status: 400 });
  }

  const upstream = new FormData();
  upstream.set("payload", payload);
  const cookies = form.get("cookies");
  if (cookies instanceof File && cookies.size > 0) {
    upstream.set("cookies", cookies, cookies.name || "cookies.txt");
  }

  try {
    const res = await fetch(`${baseUrl()}/v1/export/batch`, {
      method: "POST",
      body: upstream,
      signal: AbortSignal.timeout(300_000),
    });
    if (!res.ok) {
      const t = await res.text();
      return new NextResponse(t, {
        status: res.status,
        headers: { "Content-Type": res.headers.get("content-type") || "text/plain" },
      });
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const headers = new Headers();
    const upstreamCt = res.headers.get("content-type") || "";
    const logB64 = res.headers.get("x-wattpad-log-b64");
    if (logB64) headers.set("X-Wattpad-Log-B64", logB64);
    if (upstreamCt.includes("application/zip")) {
      headers.set("Content-Type", "application/zip");
      const cd = res.headers.get("content-disposition");
      if (cd) headers.set("Content-Disposition", cd);
    } else {
      headers.set("Content-Type", "application/json; charset=utf-8");
    }
    return new NextResponse(buf, { status: 200, headers });
  } catch (e) {
    const { message, code } = describeUpstreamFetchError(e);
    return NextResponse.json(
      {
        error: message,
        code,
        hint: "请使用 npm run dev 启动（会自动拉起 Wattpad API）",
      },
      { status: 502 }
    );
  }
}
