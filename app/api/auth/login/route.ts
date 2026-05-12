import { NextRequest, NextResponse } from "next/server";
import { createSiteAuthToken, getSitePassword, SITE_AUTH_COOKIE } from "@/lib/site-auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { password?: string };
  const password = typeof body.password === "string" ? body.password : "";

  if (password !== getSitePassword()) {
    return NextResponse.json({ error: "密码错误" }, { status: 401 });
  }

  const token = await createSiteAuthToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SITE_AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}

