import { LarkBaseClient, type LarkField } from "./lark-client";
import { BaseQueryError } from "./lark-ai-query";
import { getBotConfig } from "./lark-bot-config";

export type BotTable = { baseToken: string; tableId: string; name: string };
export type BotDataClient = Pick<LarkBaseClient, "listFields" | "listRecords" | "searchRecords" | "createRecord" | "updateRecord">;
export interface BotTableAccess {
  listTables(): Promise<BotTable[]>;
  openTable(input: unknown): Promise<{ table: BotTable; fields: LarkField[]; client: BotDataClient }>;
}

export function baseLinksFromText(text: string): { baseToken: string; tableId?: string }[] {
  const links: { baseToken: string; tableId?: string }[] = [];
  for (const match of text.matchAll(/https:\/\/[^\s<>"']+/g)) {
    try {
      const url = new URL(match[0]);
      if (!["larksuite.com", "feishu.cn"].some(domain => url.hostname === domain || url.hostname.endsWith("." + domain))) continue;
      const path = url.pathname.match(/^\/base\/([a-zA-Z0-9]+)\/?$/);
      if (!path) continue;
      const table = url.searchParams.get("table");
      links.push({ baseToken: path[1], ...(table && /^tbl[a-zA-Z0-9]+$/.test(table) ? { tableId: table } : {}) });
    } catch { /* Ignore text which is not a valid Base link. */ }
  }
  return links;
}

export function createBotTableAccess(config: ReturnType<typeof getBotConfig>, question: string, signal: AbortSignal): BotTableAccess {
  // Additional Bases must come from an explicit user link, never model arguments
  // or untrusted cell contents. Lark enforces application access on each API call.
  const links = baseLinksFromText(question);
  const baseTokens = [...new Set([...config.baseTokens, ...links.map(link => link.baseToken)])];
  let cache: BotTable[] | undefined;
  const listTables = async () => {
    if (cache) return cache;
    if (!baseTokens.length) throw new BaseQueryError("Hãy gửi link Base dạng https://tenant.larksuite.com/base/TOKEN, hoặc cấu hình LARK_BOT_BASE_APP_TOKENS.");
    const tables: BotTable[] = [];
    for (const baseToken of baseTokens) {
      signal.throwIfAborted();
      const client = new LarkBaseClient({ config: { ...config, baseAppToken: baseToken, tableId: "" }, signal });
      for (const table of await client.listTables()) tables.push({ baseToken, tableId: table.table_id, name: table.name });
    }
    cache = tables;
    return tables;
  };
  return {
    listTables,
    async openTable(input) {
      if (!input || typeof input !== "object" || Array.isArray(input)) throw new BaseQueryError("Cần tên bảng hoặc tableId.");
      const args = input as Record<string, unknown>;
      if (typeof args.table !== "string" || args.table.length > 200 || Object.keys(args).some(key => !["table", "baseToken"].includes(key)) || (args.baseToken != null && typeof args.baseToken !== "string")) throw new BaseQueryError("Tham số chọn bảng không hợp lệ.");
      const all = await listTables();
      const normalize = (name: string) => name.normalize("NFC").trim().toLocaleLowerCase("vi");
      const name = normalize(args.table);
      const candidates = args.baseToken ? all.filter(table => table.baseToken === args.baseToken)
        : links.length ? all.filter(table => links.some(link => link.baseToken === table.baseToken)) : all;
      let matches = candidates.filter(table => table.tableId === args.table || normalize(table.name) === name);
      if (!matches.length && /^[a-z]\d{2}$/i.test(name)) matches = candidates.filter(table => new RegExp(`^${name}(?:[.\\s_–—-]|$)`, "i").test(normalize(table.name)));
      // An explicit link may choose a table, but never silently choose the first
      // table of a Base or the table last used by an import administrator.
      if (!name) {
        const explicit = links.filter(link => link.tableId);
        matches = candidates.filter(table => explicit.some(link => link.baseToken === table.baseToken && link.tableId === table.tableId));
        if (!matches.length && config.tableId) matches = candidates.filter(table => table.tableId === config.tableId);
        if (!matches.length && candidates.length === 1) matches = candidates;
      }
      if (matches.length !== 1) throw new BaseQueryError(matches.length ? "Có nhiều bảng trùng tên. Chỉ rõ tableId và Base." : "Chưa xác định được bảng. Dùng list_tables rồi chọn tên hoặc tableId chính xác.");
      const table = matches[0];
      const client = new LarkBaseClient({ config: { ...config, baseAppToken: table.baseToken, tableId: table.tableId }, signal });
      const fields = await client.listFields();
      return { table, fields, client };
    },
  };
}

export function formatBotTables(tables: BotTable[]) {
  if (!tables.length) return "Không tìm thấy bảng nào mà bot có thể truy cập trong các Base đã cung cấp.";
  return ("Các bảng bot có thể truy cập:\n" + tables.slice(0, 80).map(table => `${table.name} | ${table.tableId} | Base ${table.baseToken}`).join("\n") + (tables.length > 80 ? "\nDanh sách được rút gọn còn 80 bảng." : "") + "\n\nGửi: base A03 hoặc hỏi kèm tên bảng/tableId. Không phụ thuộc bảng import đang chọn.").slice(0, 8000);
}
