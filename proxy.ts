import { NextResponse, type NextRequest } from "next/server";

const PROJECT_LIST_REDIRECTS = new Set([
  "/chat",
  "/image",
  "/video",
  "/canvas",
  "/image/gallery",
]);

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const url = request.nextUrl.clone();

  if (pathname === "/") {
    const projectId = request.nextUrl.searchParams.get("project")?.trim();
    if (projectId) {
      url.pathname = `/projects/${encodeURIComponent(projectId)}/script`;
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  const onboardingMatch = pathname.match(/^\/project\/([^/]+)\/onboarding$/);
  if (onboardingMatch) {
    url.pathname = `/projects/${onboardingMatch[1]}/script`;
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (!PROJECT_LIST_REDIRECTS.has(pathname)) {
    return NextResponse.next();
  }

  url.pathname = "/projects";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/",
    "/project/:path*/onboarding",
    "/chat",
    "/image",
    "/video",
    "/canvas",
    "/image/gallery",
  ],
};
