import "dotenv/config";
import http from "node:http";
import { getLarkClient, type LarkField, type LarkRecord } from "./app/lib/lark-client";

interface ToolRequest {
  tool: string;
  args?: {
    query?: string;
  };
}

interface ToolResponse {
  success: boolean;
  tool?: string;
  result?: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
}

type QueryOperator = ">" | ">=" | "<" | "<=" | "=" | "!=" | "contains" | "date_after" | "date_before";
type QueryValueType = "number" | "string" | "date";

type ParsedQuery = {
  fieldTerm?: string;
  operator: QueryOperator;
  value: string | number | Date;
  valueType: QueryValueType;
  rawQuery: string;
};

const KNOWN_MONEY_FIELD_CANDIDATES = [
  "Tổng tiền",
  "Tổng ngân sách",
  "Tổng chi",
  "Tổng chi phí",
  "Số tiền",
  "Tiền",
];

const MONEY_UNIT_FACTORS: Record<string, number> = {
  triệu: 1_000_000,
  trieu: 1_000_000,
  t: 1_000_000,
  m: 1_000_000,
  tỷ: 1_000_000_000,
  ty: 1_000_000_000,
  k: 1_000,
  nghìn: 1_000,
  nghin: 1_000,
  ngan: 1_000,
  ngàn: 1_000,
};

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-3.5-turbo";

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function parseNumericValue(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[^\d.,-]/g, "").replace(/,/g, "");
  const num = Number(cleaned);
  return Number.isNaN(num) ? null : num;
}

function parseMoneyValue(value: string): number | null {
  const normalized = normalizeText(value).replace(/đ|vnd|vnđ/g, "");
  const match = normalized.match(/([\d.,]+)\s*(triệu|trieu|tỷ|ty|t|m|k|nghìn|nghin|ngàn|ngan)?/i);
  if (!match) return null;

  const rawNumber = match[1].replace(/[.,]/g, "");
  const unit = match[2]?.toLowerCase();
  const numeric = Number(rawNumber);
  if (Number.isNaN(numeric)) return null;
  return unit && MONEY_UNIT_FACTORS[unit] ? numeric * MONEY_UNIT_FACTORS[unit] : numeric;
}

function parseDateValue(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value !== "string") return null;

  const normalized = value.trim();
  if (/^\d{13}$/.test(normalized)) {
    const date = new Date(Number(normalized));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (/^\d{10}$/.test(normalized)) {
    const date = new Date(Number(normalized) * 1000);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const dateMatch = normalized.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dateMatch) {
    let [, d, m, y] = dateMatch;
    if (y.length === 2) y = `20${y}`;
    const date = new Date(`${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const isoMatch = normalized.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    const date = new Date(`${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

function cleanFieldTerm(fieldTerm: string): string {
  return fieldTerm
    .replace(/^.*?(?:record|bản ghi|bai ghi|có|voi|với|mà)\s+/i, "")
    .replace(/^tìm(?:.*?\s)?/i, "")
    .trim();
}

function extractJsonObject(text: string): string | null {
  const trimmed = text.trim();
  const fenced = trimmed.replace(/^```(?:json)?\s*/, "").replace(/```$/g, "");
  const match = fenced.match(/\{[\s\S]*\}$/);
  return match ? match[0] : fenced;
}

async function parseQueryWithLLM(query: string, fieldNames: string[]): Promise<ParsedQuery | null> {
  if (!OPENAI_API_KEY) return null;

  const fieldList = fieldNames.map((name) => `- ${name}`).join("\n");
  const prompt = `You are a Vietnamese query parser for a Lark Base table. The table has these fields:\n${fieldList}\n\nParse the user query into JSON with exactly these fields:\n- fieldTerm: exact field name, alias, or null if the query is a generic phrase without a specific field\n- operator: one of >, >=, <, <=, =, !=, contains, date_after, date_before\n- value: a number, a string, or a date in YYYY-MM-DD format\n- valueType: number, string, or date\n- rawQuery: original user query\n\nExamples:\nQuery: Tìm tất cả record có Tổng ngân sách > 50 triệu\n{"fieldTerm":"Tổng ngân sách","operator":">=","value":50000000,"valueType":"number","rawQuery":"Tìm tất cả record có Tổng ngân sách > 50 triệu"}\n\nQuery: Tìm record có Trạng thái chứa Đã duyệt\n{"fieldTerm":"Trạng thái","operator":"contains","value":"Đã duyệt","valueType":"string","rawQuery":"Tìm record có Trạng thái chứa Đã duyệt"}\n\nQuery: Tìm tất cả record có từ ngày 1/7/2026\n{"fieldTerm":"Từ ngày","operator":">=","value":"2026-07-01","valueType":"date","rawQuery":"Tìm tất cả record có từ ngày 1/7/2026"}\n\nQuery: Tìm tất cả record Marketing Q3\n{"fieldTerm":null,"operator":"contains","value":"Marketing Q3","valueType":"string","rawQuery":"Tìm tất cả record Marketing Q3"}\n\nOnly return valid JSON with no markdown or extra text. If the query cannot be parsed, return null.`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: `Query: ${query}` },
      ],
      max_tokens: 300,
      temperature: 0,
    }),
  });

  const data = await response.json();
  if (!data || !data.choices || !data.choices[0] || !data.choices[0].message?.content) {
    return null;
  }

  const content = String(data.choices[0].message.content || "");
  const jsonText = extractJsonObject(content);
  if (!jsonText) return null;

  try {
    const parsed = JSON.parse(jsonText) as ParsedQuery;
    if (!parsed.operator || !parsed.valueType || parsed.value == null) return null;
    return { ...parsed, rawQuery: query };
  } catch {
    return null;
  }
}

async function parseUserQuery(query: string, fieldNames: string[]): Promise<ParsedQuery | null> {
  const llmParsed = await parseQueryWithLLM(query, fieldNames);
  if (llmParsed) {
    return llmParsed;
  }

  const parsedVietnamese = parseVietnameseQuery(query, fieldNames);
  if (parsedVietnamese) {
    return parsedVietnamese;
  }

  const normalizedQuery = normalizeText(query);
  const fuzzyField = fieldNames
    .map((fieldName) => ({
      fieldName,
      score: normalizeText(fieldName)
        .split(/\s+/)
        .reduce((score, token) => score + (normalizedQuery.includes(token) ? 1 : 0), 0),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)[0];

  if (fuzzyField) {
    const phrase = query.replace(/.*(?:có|co|chứa|chua|của|cua)\s+/i, "").trim() || query;
    return {
      fieldTerm: fuzzyField.fieldName,
      operator: "contains",
      value: phrase,
      valueType: "string",
      rawQuery: query,
    };
  }

  return {
    fieldTerm: undefined,
    operator: "contains",
    value: query,
    valueType: "string",
    rawQuery: query,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findKnownFieldInText(text: string, fieldNames: string[]): string | undefined {
  const normalizedText = normalizeText(text);
  return fieldNames.find((field) => normalizeText(field).split(/\s+/).every((token) => token && normalizedText.includes(token)));
}

function parseVietnameseQuery(query: string, fieldNames: string[]): ParsedQuery | null {
  const cleanedQuery = query.replace(/[“”]/g, '"').trim();
  const normalized = normalizeText(cleanedQuery);

  const explicitOperatorPattern = /\b(lon hon hoac bang|khong nho hon|>=|≥|lon hon|>|nho hon hoac bang|khong lon hon|<=|≤|nho hon|<|bang|=|la|chua|khong chua|truoc|sau|khac voi)\b/i;
  const genericMatch = cleanedQuery.match(/^(?:.*?\b(?:tìm|tim|xem|hiển thị|hien thi|lấy|lay)\b\s+)?(?:tất cả\s+)?(?:record|bản ghi|ban ghi|dữ liệu)\s*(?:có\s+)?(.+)$/i);
  if (genericMatch) {
    const rawPhrase = genericMatch[1].trim();
    if (rawPhrase && !explicitOperatorPattern.test(rawPhrase)) {
      const phrase = rawPhrase.replace(/^(?:có|co)\s+/i, "").trim();
      if (phrase) {
        const knownField = findKnownFieldInText(phrase, fieldNames);
        if (knownField) {
          const fieldRegex = new RegExp(`\\b${escapeRegExp(normalizeText(knownField))}\\b`, "i");
          const rawValue = phrase.replace(fieldRegex, "").trim() || phrase;
          const numericValue = parseMoneyValue(rawValue) ?? parseNumericValue(rawValue);
          const dateValue = parseDateValue(rawValue);

          if (dateValue) {
            return {
              fieldTerm: knownField,
              operator: "date_after",
              value: dateValue,
              valueType: "date",
              rawQuery: query,
            };
          }

          if (numericValue !== null) {
            return {
              fieldTerm: knownField,
              operator: ">=",
              value: numericValue,
              valueType: "number",
              rawQuery: query,
            };
          }

          return {
            fieldTerm: knownField,
            operator: "contains",
            value: rawValue.replace(/^"|"$/g, ""),
            valueType: "string",
            rawQuery: query,
          };
        }

        return {
          fieldTerm: undefined,
          operator: "contains",
          value: phrase.replace(/^"|"$/g, ""),
          valueType: "string",
          rawQuery: query,
        };
      }
    }
  }

  const dateOnlyMatcher = normalized.match(
    /^(?:.*?(?:co|voi|ma)\s+)?(tu ngay|den ngay|truoc ngay|sau ngay)\s+(.+)$/i
  );
  if (dateOnlyMatcher) {
    let rawField = cleanFieldTerm(dateOnlyMatcher[1]).trim();
    const rawValue = dateOnlyMatcher[2].trim();
    const dateValue = parseDateValue(rawValue);
    if (!dateValue) return null;

    let operator: QueryOperator;
    if (/^tu ngay$/i.test(rawField)) {
      operator = ">=";
      rawField = "Từ ngày";
    } else if (/^den ngay$/i.test(rawField)) {
      operator = "<=";
      rawField = "Đến ngày";
    } else if (/^truoc ngay$/i.test(rawField)) {
      operator = "date_before";
      rawField = "Từ ngày";
    } else {
      operator = "date_after";
      rawField = "Từ ngày";
    }

    return {
      fieldTerm: rawField,
      operator,
      value: dateValue,
      valueType: "date",
      rawQuery: query,
    };
  }

  const matcher = normalized.match(
    /^(?:.*?(?:co|voi|ma)\s+)?(.+?)\s+(lon hon hoac bang|khong nho hon|>=|≥|lon hon|>|nho hon hoac bang|khong lon hon|<=|≤|nho hon|<|bang|=|la|chua|khong chua|truoc|sau|khac voi)\s+(.+)$/i
  );
  if (!matcher) return null;

  let [, rawField, rawOperator, rawValue] = matcher;
  rawField = cleanFieldTerm(rawField).trim();
  rawValue = rawValue.trim();

  const operatorText = rawOperator.toLowerCase();
  let operator: QueryOperator;

  if (["lớn hơn hoặc bằng", "không nhỏ hơn", "lon hon hoac bang", "khong nho hon", ">=", "≥"].includes(operatorText)) {
    operator = ">=";
  } else if (["lớn hơn", "lon hon", ">"].includes(operatorText)) {
    operator = ">";
  } else if (["nhỏ hơn hoặc bằng", "không lớn hơn", "nho hon hoac bang", "khong lon hon", "<=", "≤"].includes(operatorText)) {
    operator = "<=";
  } else if (["nhỏ hơn", "nho hon", "<"].includes(operatorText)) {
    operator = "<";
  } else if (["bằng", "bang", "=", "là", "la"].includes(operatorText)) {
    operator = "=";
  } else if (["chứa", "chua"].includes(operatorText)) {
    operator = "contains";
  } else if (["không chứa", "khong chua"].includes(operatorText)) {
    operator = "!=";
  } else if (["khác với", "khac voi"].includes(operatorText)) {
    operator = "!=";
  } else if (["sau"].includes(operatorText)) {
    operator = "date_after";
  } else if (["trước", "truoc"].includes(operatorText)) {
    operator = "date_before";
  } else {
    return null;
  }

  const numericValue = parseMoneyValue(rawValue) ?? parseNumericValue(rawValue);
  const dateValue = parseDateValue(rawValue);

  if (dateValue && ["date_after", "date_before", "=", "!="].includes(operator)) {
    return {
      fieldTerm: rawField || undefined,
      operator,
      value: dateValue,
      valueType: "date",
      rawQuery: query,
    };
  }

  if (numericValue !== null && [">", ">=", "<", "<=", "=", "!="].includes(operator)) {
    return {
      fieldTerm: rawField || undefined,
      operator,
      value: numericValue,
      valueType: "number",
      rawQuery: query,
    };
  }

  return {
    fieldTerm: rawField || undefined,
    operator,
    value: rawValue.replace(/^"|"$/g, ""),
    valueType: "string",
    rawQuery: query,
  };
}

function inferFieldCandidates(fieldNames: string[], fieldTerm?: string): string[] {
  if (!fieldTerm) {
    return fieldNames;
  }

  const normalizedTerm = normalizeText(fieldTerm);
  const fieldTokens = normalizedTerm.split(/\s+/).filter(Boolean);

  const standardFieldTerm = normalizedTerm
    .replace(/^(tên\s+)?(ngân\s+sách|ngân sách|tên ngân sách)$/i, "tên ngân sách")
    .trim();

  const directMatches = fieldNames.filter((name) => {
    const normalizedName = normalizeText(name);
    return (
      normalizedName === normalizedTerm ||
      normalizedName.includes(normalizedTerm) ||
      normalizedTerm.includes(normalizedName) ||
      normalizedName === standardFieldTerm ||
      normalizedName.includes(standardFieldTerm)
    );
  });

  if (directMatches.length > 0) {
    return directMatches;
  }

  const tokenMatches = fieldNames.filter((name) => {
    const normalizedName = normalizeText(name);
    return fieldTokens.every((token) => normalizedName.includes(token));
  });

  if (tokenMatches.length > 0) {
    return tokenMatches;
  }

  const exactNormalizedMatch = fieldNames.filter((name) => normalizeText(name) === normalizedTerm);
  if (exactNormalizedMatch.length > 0) {
    return exactNormalizedMatch;
  }

  const containsNormalizedMatch = fieldNames.filter((name) => normalizeText(name).includes(normalizedTerm));
  if (containsNormalizedMatch.length > 0) {
    return containsNormalizedMatch;
  }

  const overlapMatches = fieldNames
    .map((name) => {
      const normalizedName = normalizeText(name);
      const tokens = normalizedName.split(/\s+/).filter(Boolean);
      let score = 0;
      for (const token of tokens) {
        if (normalizedTerm.includes(token)) {
          score += 1;
        }
      }
      if (normalizedName.includes(normalizedTerm) || normalizedTerm.includes(normalizedName)) {
        score += 5;
      }
      return { name, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (overlapMatches.length > 0) {
    return [overlapMatches[0].name];
  }

  const knownMoneyMatches = fieldNames.filter((name) =>
    KNOWN_MONEY_FIELD_CANDIDATES.some((candidate) =>
      normalizeText(name).includes(normalizeText(candidate)) || normalizeText(candidate).includes(normalizeText(name))
    )
  );

  if (knownMoneyMatches.length > 0) {
    return knownMoneyMatches;
  }

  return fieldNames;
}

function compareValues(left: number, operator: QueryOperator, right: number): boolean {
  switch (operator) {
    case ">":
      return left > right;
    case ">=":
      return left >= right;
    case "<":
      return left < right;
    case "<=":
      return left <= right;
    case "=":
      return left === right;
    case "!=":
      return left !== right;
    default:
      return false;
  }
}

function compareDates(left: Date, operator: QueryOperator, right: Date): boolean {
  const leftTime = left.getTime();
  const rightTime = right.getTime();
  switch (operator) {
    case "date_after":
      return leftTime > rightTime;
    case "date_before":
      return leftTime < rightTime;
    case "=":
      return leftTime === rightTime;
    case "!=":
      return leftTime !== rightTime;
    default:
      return false;
  }
}

function recordMatchesQuery(record: LarkRecord, parsed: ParsedQuery, candidateFields: string[]): boolean {
  for (const fieldName of candidateFields) {
    const rawValue = record.fields[fieldName];
    if (rawValue == null) continue;

    if (parsed.valueType === "number") {
      const numeric = parseNumericValue(rawValue);
      if (numeric === null) continue;
      if (compareValues(numeric, parsed.operator, parsed.value as number)) {
        return true;
      }
      continue;
    }

    if (parsed.valueType === "date") {
      const rawDate = parseDateValue(rawValue);
      if (!rawDate) continue;
      if (compareDates(rawDate, parsed.operator, parsed.value as Date)) {
        return true;
      }
      continue;
    }

    const rawText = String(rawValue).toLowerCase();
    const targetText = String(parsed.value).toLowerCase();

    if (parsed.operator === "=") {
      if (rawText === targetText) return true;
    } else if (parsed.operator === "!=") {
      if (rawText !== targetText) return true;
    } else if (parsed.operator === "contains") {
      if (rawText.includes(targetText)) return true;
    } else if ([">", ">=", "<", "<="].includes(parsed.operator)) {
      const numeric = parseNumericValue(rawValue);
      if (numeric !== null && compareValues(numeric, parsed.operator, Number(parsed.value))) {
        return true;
      }
    }
  }

  return false;
}

function buildLarkFilter(fieldName: string, parsed: ParsedQuery): string | null {
  if (parsed.valueType === "number" && [">", ">=", "<", "<=", "=", "!="].includes(parsed.operator)) {
    return `CurrentValue.[${fieldName}] ${parsed.operator} ${parsed.value}`;
  }

  if (parsed.valueType === "string" && parsed.operator === "=") {
    const escaped = String(parsed.value).replace(/"/g, '\\"');
    return `CurrentValue.[${fieldName}] = "${escaped}"`;
  }

  if (parsed.valueType === "string" && parsed.operator === "contains") {
    const escaped = String(parsed.value).replace(/"/g, '\\"');
    return `CONTAINS(CurrentValue.[${fieldName}], "${escaped}")`;
  }

  if (parsed.valueType === "date" && ["date_after", "date_before", ">=", "<=", "=", "!="].includes(parsed.operator)) {
    const dateValue = parsed.value as Date;
    if (parsed.operator === "date_after") {
      return `CurrentValue.[${fieldName}] > "${dateValue.toISOString().slice(0, 10)}"`;
    }
    if (parsed.operator === "date_before") {
      return `CurrentValue.[${fieldName}] < "${dateValue.toISOString().slice(0, 10)}"`;
    }
    return `CurrentValue.[${fieldName}] ${parsed.operator} "${dateValue.toISOString().slice(0, 10)}"`;
  }

  if (parsed.valueType === "date" && parsed.operator === "contains") {
    const dateValue = parsed.value as Date;
    return `CONTAINS(CurrentValue.[${fieldName}], "${dateValue.toISOString().slice(0, 10)}")`;
  }

  return null;
}

async function scanRecords(client: ReturnType<typeof getLarkClient>, parsed: ParsedQuery, candidateFields: string[]) {
  const matches: LarkRecord[] = [];
  let pageToken: string | undefined;
  let iteration = 0;

  do {
    const result = await client.listRecords({ pageSize: 100, pageToken });
    for (const record of result.items) {
      if (recordMatchesQuery(record, parsed, candidateFields)) {
        matches.push(record);
        if (matches.length >= 100) break;
      }
    }
    pageToken = result.hasMore ? result.pageToken : undefined;
    iteration += 1;
  } while (pageToken && iteration < 20 && matches.length < 100);

  return matches;
}

async function searchRecords(args: { query?: string }): Promise<ToolResponse> {
  const query = String(args.query || "").trim();
  if (!query) {
    return { success: false, error: "Thiếu tham số query." };
  }

  const client = getLarkClient();
  const fields = await client.listFields();
  const fieldNames = fields.map((field) => field.field_name);
  const parsed = await parseUserQuery(query, fieldNames);
  if (!parsed) {
    return {
      success: false,
      error:
        "Không hiểu truy vấn. Hỗ trợ ví dụ: 'Tìm tất cả record có Tổng tiền > 50 triệu' hoặc 'Tìm tất cả record có Trạng thái chứa Đã duyệt'.",
    };
  }

  const candidateFields = inferFieldCandidates(fieldNames, parsed.fieldTerm).slice(0, 10);

  for (const fieldName of candidateFields) {
    const filter = buildLarkFilter(fieldName, parsed);
    if (!filter) continue;

    try {
      const result = await client.listRecords({ filter, pageSize: 50 });
      if (result.total > 0) {
        return {
          success: true,
          tool: "search_records",
          result: {
            filter,
            total: result.total,
            records: result.items.map((record) => ({
              record_id: record.record_id,
              fields: record.fields,
            })),
          },
        };
      }
    } catch {
      continue;
    }
  }

  const manualRecords = await scanRecords(client, parsed, candidateFields);
  return {
    success: true,
    tool: "search_records",
    result: {
      filter: `manual scan over fields: ${candidateFields.join(", ")}`,
      total: manualRecords.length,
      records: manualRecords.map((record) => ({
        record_id: record.record_id,
        fields: record.fields,
      })),
    },
  };
}

async function parseBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf-8");
  if (!raw) return undefined;
  return JSON.parse(raw);
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== "POST" || req.url !== "/tool") {
    res.writeHead(404);
    res.end(JSON.stringify({ success: false, error: "Chỉ hỗ trợ POST /tool" }));
    return;
  }

  try {
    const body = (await parseBody(req)) as ToolRequest;
    if (!body || typeof body.tool !== "string") {
      throw new Error("Yêu cầu phải có trường tool.");
    }

    let response: ToolResponse;
    switch (body.tool) {
      case "search_records":
        response = await searchRecords(body.args || {});
        break;
      default:
        response = { success: false, error: `Tool không tồn tại: ${body.tool}` };
        break;
    }

    res.writeHead(response.success ? 200 : 400);
    res.end(JSON.stringify(response, null, 2));
  } catch (err) {
    res.writeHead(500);
    res.end(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : "Lỗi không xác định",
      }, null, 2)
    );
  }
});

const port = Number(process.env.PORT || 4001);
server.listen(port, () => {
  console.log(`MCP server chạy tại http://localhost:${port}`);
  console.log(`Gọi tool bằng POST /tool với body { tool: 'search_records', args: { query: 'Tìm tất cả record có Tổng tiền > 50 triệu' } }`);
});
