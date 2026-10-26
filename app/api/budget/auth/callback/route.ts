import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { budgetCredentials, lark, publicOrigin } from "@/app/lib/budget/lark";
import { saveSession } from "@/app/lib/budget/storage";

export async function GET(request: Request) {
  const jar = await cookies(), url = new URL(request.url);
  const saved = jar.get("budget_oauth_state")?.value || "", [state, verifier] = saved.split(".");
  jar.delete("budget_oauth_state");
  const supplied = url.searchParams.get("state") || "";
  try {
    if (!state || !verifier || supplied.length !== state.length || !timingSafeEqual(Buffer.from(state), Buffer.from(supplied)) || !url.searchParams.get("code")) throw Error("Invalid OAuth state");
    const credentials = budgetCredentials();
    const response = await fetch("https://open.larksuite.com/open-apis/authen/v2/oauth/token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ grant_type: "authorization_code", client_id: credentials.appId, client_secret: credentials.appSecret, code: url.searchParams.get("code"), redirect_uri: publicOrigin() + "/api/budget/auth/callback", code_verifier: verifier }), cache: "no-store", signal: AbortSignal.timeout(20000) });
    const token = await response.json() as { code?: number; access_token?: string; expires_in?: number };
    if (!response.ok || (token.code !== undefined && token.code !== 0) || !token.access_token) throw Error("OAuth exchange failed");
    const user = await lark<{ open_id: string; name: string; tenant_key: string }>(token.access_token, "/open-apis/authen/v1/user_info");
    if (!user.open_id || !user.tenant_key) throw Error("Missing verified identity");
    const id = await saveSession({ openId: user.open_id, name: user.name, tenantKey: user.tenant_key, token: token.access_token, expiresAt: Date.now() + Math.min(token.expires_in || 7200, 7200) * 1000, appId: credentials.appId });
    const result = NextResponse.redirect(publicOrigin() + "/ngan-sach");
    result.cookies.set("budget_session", id, { httpOnly: true, sameSite: "lax", secure: publicOrigin().startsWith("https:"), path: "/", maxAge: Math.min(token.expires_in || 7200, 7200) });
    return result;
  } catch { return NextResponse.redirect(new URL("/ngan-sach?auth_error=login", request.url)); }
}
