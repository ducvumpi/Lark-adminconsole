import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, getExpectedSessionValue } from "@/app/lib/auth";

function withFramePolicy(response: NextResponse) {
  const ancestors = (process.env.FRAME_ANCESTORS || "'self'")
    .split(/[\s,]+/)
    .filter(Boolean)
    .join(" ");
  response.headers.set("Content-Security-Policy", `frame-ancestors ${ancestors}`);
  response.headers.delete("X-Frame-Options");
  return response;
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Bỏ qua middleware auth cookie cho route dành riêng cho bot/Botpress —
  // các route này tự xác thực bằng header x-api-key trong route handler.
  if (pathname.startsWith("/api/bot")) {
    return withFramePolicy(NextResponse.next());
  }

  if (pathname === "/login") {
    return withFramePolicy(NextResponse.next());
  }

  const expected = getExpectedSessionValue();
  const cookieValue = req.cookies.get(SESSION_COOKIE)?.value;

  const isLoggedIn = Boolean(expected) && cookieValue === expected;

  if (!isLoggedIn) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("from", pathname);
    return withFramePolicy(NextResponse.redirect(loginUrl));
  }

  return withFramePolicy(NextResponse.next());
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
