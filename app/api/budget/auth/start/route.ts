import { randomBytes, createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { budgetCredentials, publicOrigin } from "@/app/lib/budget/lark";

export async function GET(request: Request) {
  try {
    const { appId } = budgetCredentials();
    if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 24) throw Error("Cần cấu hình SESSION_SECRET tối thiểu 24 ký tự.");
    const state = randomBytes(24).toString("base64url"), verifier = randomBytes(32).toString("base64url");
    const workflow = new URL(request.url).searchParams.get("mode") === "workflow";
    const scopes = workflow
      ? "base:record:retrieve base:record:update base:record:create base:field:read approval:approval:read approval:instance:read approval:instance:write sheets:spreadsheet:readonly"
      : "base:record:retrieve base:field:read";
    const url = new URL("https://accounts.larksuite.com/open-apis/authen/v1/authorize");
    url.search = new URLSearchParams({ client_id: appId, response_type: "code", redirect_uri: publicOrigin() + "/api/budget/auth/callback", state, scope: scopes, code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256" }).toString();
    const response = NextResponse.redirect(url);
    response.cookies.set("budget_oauth_state", state + "." + verifier, { httpOnly: true, sameSite: "lax", secure: publicOrigin().startsWith("https:"), path: "/api/budget/auth", maxAge: 600 });
    return response;
  } catch {
    return NextResponse.redirect(new URL("/ngan-sach?auth_error=setup", request.url));
  }
}
