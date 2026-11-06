// One-time migration only. Runtime bot code never reads import settings.
const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");
const root = path.resolve(__dirname, "..");
const target = path.join(root, ".env.local");
let current = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
const local = dotenv.parse(current);
const defaults = fs.existsSync(path.join(root, ".env")) ? dotenv.parse(fs.readFileSync(path.join(root, ".env"), "utf8")) : {};
const env = { ...defaults, ...local, ...process.env };
try {
  const stored = JSON.parse(fs.readFileSync(path.join(root, "data", "config.json"), "utf8"));
  const bases = Array.isArray(stored.bases) ? stored.bases : [stored];
  const appId = env.LARK_BOT_APP_ID || env.LARK_APP_ID;
  const initial = appId ? bases.find(base => base.appId === appId) : bases.find(base => base.id === stored.activeBaseId) ?? bases[0];
  const id = appId || initial?.appId;
  const secret = env.LARK_BOT_APP_SECRET || env.LARK_APP_SECRET || initial?.appSecret;
  if (!id || !secret) throw Error("Missing credentials");
  const tokens = [...new Set(bases.filter(base => base.appId === id).map(base => base.baseAppToken).filter(Boolean))];
  const settings = {
    LARK_BOT_APP_ID: id,
    LARK_BOT_APP_SECRET: secret,
    LARK_BOT_BASE_APP_TOKENS: env.LARK_BOT_BASE_APP_TOKENS || env.LARK_BOT_BASE_APP_TOKEN || env.LARK_BASE_APP_TOKEN || tokens.join(","),
    LARK_BOT_API_BASE_URL: env.LARK_BOT_API_BASE_URL || env.LARK_API_BASE_URL || initial?.apiBaseUrl || "https://open.larksuite.com/open-apis",
  };
  for (const [key, value] of Object.entries(settings)) {
    if (env[key] || !value) continue;
    const line = `${key}=${JSON.stringify(value)}`;
    const pattern = new RegExp(`^${key}=.*$`, "m");
    current = pattern.test(current) ? current.replace(pattern, () => line) : current.replace(/\s*$/, "") + "\n" + line + "\n";
  }
  fs.writeFileSync(target, current, { mode: 0o600 });
  console.log("Independent Lark bot settings saved to .env.local. No table selection copied. For Vercel, set LARK_BOT_APP_ID, LARK_BOT_APP_SECRET and LARK_BOT_BASE_APP_TOKENS in Production environment variables.");
} catch {
  console.error("Could not initialize bot settings. Configure LARK_BOT_APP_ID, LARK_BOT_APP_SECRET and LARK_BOT_BASE_APP_TOKENS manually. No credentials were printed.");
  process.exitCode = 1;
}
