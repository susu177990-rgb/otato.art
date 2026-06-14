import { NextResponse, type NextRequest } from "next/server";

const PROJECT_LIST_REDIRECTS = new Set([
  "/studio",
  "/chat",
  "/image",
  "/video",
  "/canvas",
  "/image/gallery",
]);

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const url = request.nextUrl.clone();

  const studioMatch = pathname.match(/^\/studio\/([^/]+)$/);
  if (studioMatch) {
    url.pathname = `/projects/${studioMatch[1]}/script`;
    url.search = "";
    return NextResponse.redirect(url);
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
    "/studio",
    "/studio/:path*",
    "/project/:path*/onboarding",
    "/chat",
    "/image",
    "/video",
    "/canvas",
    "/image/gallery",
  ],
};
