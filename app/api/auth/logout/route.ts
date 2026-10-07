// app/api/auth/logout/route.ts
import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/app/lib/auth";

export async function POST() {
    const res = NextResponse.json({ success: true });
    res.cookies.set(SESSION_COOKIE, "", {
        httpOnly: true,
        sameSite: "none",
        secure: true,
        expires: new Date(0),
        path: "/",
    });
    return res;
}
