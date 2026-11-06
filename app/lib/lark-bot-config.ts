import type { LarkConfig } from "./config";

// Deliberately never read data/config.json or the import UI's active table.
export function getBotConfig(): LarkConfig & { baseTokens: string[] } {
  const baseTokens = [...new Set((process.env.LARK_BOT_BASE_APP_TOKENS || process.env.LARK_BOT_BASE_APP_TOKEN || process.env.LARK_BASE_APP_TOKEN || "")
    .split(",").map(value => value.trim()).filter(Boolean))];
  if (baseTokens.some(token => !/^[a-zA-Z0-9]+$/.test(token))) throw new Error("Invalid bot Base token");
  return {
    appId: (process.env.LARK_BOT_APP_ID || process.env.LARK_APP_ID || "").trim(),
    appSecret: (process.env.LARK_BOT_APP_SECRET || process.env.LARK_APP_SECRET || "").trim(),
    apiBaseUrl: (process.env.LARK_BOT_API_BASE_URL || process.env.LARK_API_BASE_URL || "https://open.larksuite.com/open-apis").trim(),
    baseAppToken: baseTokens[0] || "",
    tableId: process.env.LARK_BOT_TABLE_ID?.trim() || "",
    baseTokens,
  };
}
