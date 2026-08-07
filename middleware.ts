import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, getExpectedSessionValue } from "@/app/lib/auth";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Bỏ qua middleware auth cookie cho route dành riêng cho bot/Botpress —
  // các route này tự xác thực bằng header x-api-key trong route handler.
  if (pathname.startsWith("/api/bot")) {
    return NextResponse.next();
  }

  if (pathname === "/login") {
    return NextResponse.next();
  }

  const expected = getExpectedSessionValue();
  const cookieValue = req.cookies.get(SESSION_COOKIE)?.value;

  const isLoggedIn = Boolean(expected) && cookieValue === expected;

  if (!isLoggedIn) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};