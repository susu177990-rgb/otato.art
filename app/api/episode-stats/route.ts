import { NextRequest } from "next/server";
import { analyzeEpisodeMarkdown } from "@/lib/episode-stats";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: { text?: string; opts?: { wps?: number; minActs?: number; maxChars?: number; maxSeconds?: number } };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text : "";
  if (!text.trim()) {
    return Response.json({ error: "缺少非空字段 text" }, { status: 400 });
  }

  const result = analyzeEpisodeMarkdown(text, body.opts);
  return Response.json(result);
}
