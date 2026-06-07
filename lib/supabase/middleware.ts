import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabasePublicEnv } from "./env";

function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === "/login" ||
    pathname === "/reset-password" ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/api/auth/") ||
    pathname === "/favicon.ico" ||
    pathname.startsWith("/_next/")
  );
}

function missingEnvResponse(request: NextRequest): NextResponse {
  const hint =
    "请在仓库根目录创建 .env.local（参考 .env.example），或在 Zeabur 配置 NEXT_PUBLIC_SUPABASE_URL、NEXT_PUBLIC_SUPABASE_ANON_KEY 后重新部署。";

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Supabase 未配置", hint }, { status: 503 });
  }

  const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"/><title>需要配置 Supabase</title>
<style>body{font-family:system-ui,sans-serif;max-width:36rem;margin:4rem auto;padding:0 1rem;line-height:1.6;color:#e4e4e7;background:#09090b}
code{background:#27272a;padding:.15em .4em;border-radius:4px;font-size:.9em}</style></head><body>
<h1>Supabase 环境变量未配置</h1>
<p>${hint}</p>
<p>本地开发：复制 <code>.env.example</code> → <code>.env.local</code>，填好三项 Supabase 变量后<strong>重启</strong> <code>npm run dev</code>。</p>
</body></html>`;

  return new NextResponse(html, {
    status: 503,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const env = getSupabasePublicEnv();
  if (!env) {
    return missingEnvResponse(request);
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        supabaseResponse = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          supabaseResponse.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return supabaseResponse;
  }

  if (user) {
    return supabaseResponse;
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  loginUrl.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}
