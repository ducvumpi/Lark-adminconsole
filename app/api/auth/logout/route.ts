// app/api/auth/logout/route.ts
import { NextResponse } from "next/server";

export async function POST() {
    const res = NextResponse.json({ success: true });
    res.cookies.set("session", "", {
        httpOnly: true,
        expires: new Date(0),
        path: "/",
    });
    return res;
}