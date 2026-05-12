import { NextRequest, NextResponse } from "next/server";

const SITE_AUTH_COOKIE = "script_agent_site_auth";
const DEFAULT_SITE_PASSWORD = "x)r)y.Yg6J4wnM\\";
const SITE_AUTH_PEPPER = "script-agent-site-auth-v1";

async function createSiteAuthToken(): Promise<string> {
  const password = process.env.SCRIPT_AGENT_SITE_PASSWORD || DEFAULT_SITE_PASSWORD;
  const data = new TextEncoder().encode(`${SITE_AUTH_PEPPER}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname === "/api/auth/login" ||
    pathname === "/favicon.ico" ||
    pathname.startsWith("/_next/")
  );
}

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();

  const expected = await createSiteAuthToken();
  const authed = req.cookies.get(SITE_AUTH_COOKIE)?.value === expected;
  if (authed) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "请先输入访问密码" }, { status: 401 });
  }

  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  loginUrl.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};

