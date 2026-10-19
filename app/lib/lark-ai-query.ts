import type { LarkBaseClient, LarkField, LarkRecord } from "./lark-client";

export type BaseReader = Pick<LarkBaseClient, "listFields" | "listRecords">;
export class BaseQueryError extends Error {}
type Operator = "equals" | "contains" | "gt" | "gte" | "lt" | "lte";
type Condition = { field: string; operator: Operator; value: string };
type Query = { action: "list" | "count" | "sum"; filters: Condition[]; sumField: string | null; columns: string[] };

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function display(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) {
    const isRichText = value.every(part => object(part) && typeof part.text === "string");
    return value.map(display).join(isRichText ? "" : ", ");
  }
  if (object(value)) return display(value.text ?? value.name ?? value.link ?? "");
  return String(value);
}

function numeric(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !/^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

const NUMERIC_TYPES = [2, 19, 20];
const TEXT_TYPES = [1, 3, 4, 13, 15];

function validateQuery(input: unknown, fields: LarkField[]): Query {
  if (!object(input) || !["list", "count", "sum"].includes(String(input.action))
    || !Array.isArray(input.filters) || input.filters.length > 8
    || !Array.isArray(input.columns) || input.columns.length > 8) throw new BaseQueryError("Yêu cầu truy vấn không hợp lệ.");
  const findField = (name: unknown) => fields.find(field => field.field_name === name);
  for (const name of input.columns) if (typeof name !== "string" || !findField(name)) throw new BaseQueryError("Tên cột hiển thị không hợp lệ.");
  if (input.action === "sum") {
    const field = findField(input.sumField);
    if (!field || !NUMERIC_TYPES.includes(field.type)) throw new BaseQueryError("Cần chọn đúng cột số để tính tổng.");
  } else if (input.sumField !== null) throw new BaseQueryError("sumField phải là null khi không tính tổng.");
  for (const filter of input.filters) {
    if (!object(filter) || typeof filter.field !== "string" || typeof filter.value !== "string"
      || filter.value.length > 200 || !["equals", "contains", "gt", "gte", "lt", "lte"].includes(String(filter.operator))) {
      throw new BaseQueryError("Điều kiện lọc không hợp lệ.");
    }
    const field = findField(filter.field);
    if (!field) throw new BaseQueryError("Không tìm thấy cột lọc.");
    const isNumeric = NUMERIC_TYPES.includes(field.type);
    const isDate = [5, 1002, 1004].includes(field.type);
    if (!isNumeric && !isDate && !TEXT_TYPES.includes(field.type)) throw new BaseQueryError("Chưa hỗ trợ lọc kiểu cột này.");
    if ((isNumeric || isDate) && (filter.operator === "contains" || numeric(filter.value) === null)) {
      throw new BaseQueryError("Cột số/ngày cần giá trị số; ngày dùng Unix milliseconds.");
    }
    if (!isNumeric && !isDate && !["equals", "contains"].includes(String(filter.operator))) {
      throw new BaseQueryError("Cột văn bản chỉ hỗ trợ equals/contains.");
    }
  }
  return input as unknown as Query;
}

function matches(record: LarkRecord, filter: Condition, field: LarkField) {
  const raw = record.fields[filter.field];
  if (NUMERIC_TYPES.includes(field.type) || [5, 1002, 1004].includes(field.type)) {
    const left = numeric(raw);
    const right = numeric(filter.value);
    if (left === null || right === null) {
      if (raw == null || raw === "") return false;
      throw new BaseQueryError("Cột lọc chứa dữ liệu không phải số; chưa thể lọc chính xác.");
    }
    switch (filter.operator) {
      case "equals": return left === right;
      case "gt": return left > right;
      case "gte": return left >= right;
      case "lt": return left < right;
      case "lte": return left <= right;
      default: return false;
    }
  }
  const normalize = (value: unknown) => display(value).normalize("NFC").toLocaleLowerCase("vi").trim();
  const values = field.type === 4 && Array.isArray(raw) ? raw.map(normalize) : [normalize(raw)];
  const target = normalize(filter.value);
  return values.some(value => filter.operator === "equals" ? value === target : value.includes(target));
}

// Never returns a partial total/count when the scan budget is exhausted.
export async function queryBase(client: BaseReader, fields: LarkField[], input: unknown, signal?: AbortSignal) {
  const query = validateQuery(input, fields);
  const selected = query.columns.length ? query.columns : fields.slice(0, 8).map(field => field.field_name);
  const requested = [...new Set([
    ...query.filters.map(filter => filter.field),
    ...(query.action === "list" ? selected : []),
    ...(query.sumField ? [query.sumField] : []),
  ])];
  let pageToken: string | undefined;
  let count = 0;
  let sum = 0;
  let compensation = 0;
  let numericCount = 0;
  const rows: { recordId: string; fields: Record<string, string> }[] = [];
  const pageTokens = new Set<string>();
  for (let page = 0; page < 10; page++) {
    signal?.throwIfAborted();
    const result = await client.listRecords({ pageSize: 500, pageToken, fieldNames: requested.length ? requested : [fields[0].field_name] });
    for (const record of result.items) {
      if (!query.filters.every(filter => matches(record, filter, fields.find(field => field.field_name === filter.field)!))) continue;
      count++;
      if (query.action === "sum") {
        const raw = record.fields[query.sumField!];
        if (raw != null && raw !== "") {
          const value = numeric(raw);
          if (value === null) throw new BaseQueryError("Cột tính tổng có dữ liệu không phải số; không thể trả tổng chính xác.");
          const adjusted = value - compensation;
          const next = sum + adjusted;
          compensation = (next - sum) - adjusted;
          sum = next;
          numericCount++;
          if (!Number.isFinite(sum)) throw new BaseQueryError("Tổng vượt giới hạn tính toán.");
        }
      }
      if (query.action === "list") {
        if (rows.length === 10) return { action: "list", rows, hasMore: true, valuesTruncatedAt: 300 };
        rows.push({ recordId: record.record_id, fields: Object.fromEntries(selected.map(name => [name, display(record.fields[name]).slice(0, 300)])) });
      }
    }
    if (!result.hasMore) {
      if (query.action === "list") return { action: "list", rows, hasMore: false, valuesTruncatedAt: 300 };
      return { action: query.action, count, ...(query.action === "sum" ? { field: query.sumField, sum, numericCount, emptyCount: count - numericCount } : {}) };
    }
    if (!result.pageToken || pageTokens.has(result.pageToken)) throw new BaseQueryError("Phân trang Base lỗi; không trả kết quả chưa đầy đủ.");
    pageTokens.add(result.pageToken);
    pageToken = result.pageToken;
  }
  throw new BaseQueryError("Bảng vượt giới hạn quét 5.000 dòng; chưa có kết quả đầy đủ. Hãy dùng bảng nhỏ hơn hoặc tạo view/bảng tổng hợp.");
}
