import { NextResponse, type NextRequest } from "next/server";

/**
 * Coarse route guard: unauthenticated users are sent to /login for app pages.
 * Cryptographic session verification happens server-side in requireSession();
 * this proxy only checks cookie presence for fast redirects.
 */
const PUBLIC_PREFIXES = ["/login", "/s/", "/i/", "/api/respond", "/api/import/firecrawl", "/_next", "/favicon"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }
  const hasSession = request.cookies.has("cx_session");
  if (!hasSession && pathname !== "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
