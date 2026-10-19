import type { LarkBaseClient, LarkField, LarkRecord, LarkSearchCondition } from "./lark-client";

export type BaseReader = Pick<LarkBaseClient, "listFields" | "listRecords"> & Partial<Pick<LarkBaseClient, "searchRecords">>;
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
const COMPUTED_TYPES = [19, 20];
const TEXT_TYPES = [1, 3, 4, 13, 15];

// Formula/lookup columns can return text, numbers, or wrapped scalar values.
// A multi-value lookup is ambiguous for aggregation: never silently add it up.
function computedScalar(value: unknown, fieldName: string): unknown {
  for (let depth = 0; depth < 8; depth++) {
    if (Array.isArray(value)) {
      if (!value.length) return null;
      if (value.length !== 1) throw new BaseQueryError(`Cột “${fieldName}” trả nhiều giá trị lookup/công thức; chưa thể lọc hoặc tính tổng như một giá trị đơn.`);
      value = value[0];
    } else if (object(value)) {
      if ("value" in value) value = value.value;
      else if (typeof value.text === "string") value = value.text;
      else throw new BaseQueryError(`Cột “${fieldName}” trả cấu trúc công thức/lookup chưa được hỗ trợ.`);
    } else return value;
  }
  throw new BaseQueryError(`Cột “${fieldName}” có cấu trúc công thức/lookup quá sâu.`);
}

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
    const isNumeric = field.type === 2;
    const isComputed = COMPUTED_TYPES.includes(field.type);
    const isDate = [5, 1002, 1004].includes(field.type);
    if (!isNumeric && !isComputed && !isDate && !TEXT_TYPES.includes(field.type)) throw new BaseQueryError(`Chưa hỗ trợ lọc kiểu cột “${field.field_name}”.`);
    if ((isNumeric || isDate) && (filter.operator === "contains" || numeric(filter.value) === null)) {
      throw new BaseQueryError(`Điều kiện lọc cột “${field.field_name}” cần giá trị số${isDate ? " theo Unix milliseconds" : ""}. Đây là lỗi bộ lọc, không phải lỗi hỗ trợ cột tính tổng.`);
    }
    if (isComputed && !["equals", "contains"].includes(String(filter.operator)) && numeric(filter.value) === null) {
      throw new BaseQueryError(`Điều kiện so sánh cột công thức/lookup “${field.field_name}” cần giá trị số; văn bản dùng equals/contains.`);
    }
    if (!isNumeric && !isComputed && !isDate && !["equals", "contains"].includes(String(filter.operator))) {
      throw new BaseQueryError("Cột văn bản chỉ hỗ trợ equals/contains.");
    }
  }
  return input as unknown as Query;
}

function matches(record: LarkRecord, filter: Condition, field: LarkField) {
  const isComputed = COMPUTED_TYPES.includes(field.type);
  const raw = isComputed ? computedScalar(record.fields[filter.field], field.field_name) : record.fields[filter.field];
  const computedNumericComparison = isComputed && (
    !["equals", "contains"].includes(filter.operator) || (filter.operator === "equals" && typeof raw === "number" && numeric(filter.value) !== null));
  if (field.type === 2 || [5, 1002, 1004].includes(field.type) || computedNumericComparison) {
    const left = numeric(raw);
    const right = numeric(filter.value);
    if (left === null || right === null) {
      if (raw == null || raw === "") return false;
      throw new BaseQueryError(`Cột lọc “${field.field_name}” chứa dữ liệu không phải số; chưa thể thực hiện so sánh số.`);
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
  const sumField = fields.find(field => field.field_name === query.sumField);
  // Push down exact single-select filters, resolving the canonical option name
  // so case-insensitive matching remains unchanged. Other types stay local:
  // formula/text/date API semantics can differ from our scalar comparisons.
  const conditions: LarkSearchCondition[] = [];
  for (const filter of query.filters) {
    const field = fields.find(field => field.field_name === filter.field)!;
    if (field.type !== 3 || filter.operator !== "equals" || !filter.value.trim()) continue;
    const normalize = (value: string) => value.normalize("NFC").toLocaleLowerCase("vi").trim();
    const options = field.property?.options?.filter(option => normalize(option.name) === normalize(filter.value));
    if (options?.length === 1) conditions.push({ field_name: field.field_name, operator: "is", value: [options[0].name] });
  }
  const useSearch = conditions.length > 0 && Boolean(client.searchRecords);
  let pageToken: string | undefined;
  let count = 0;
  let sum = 0;
  let compensation = 0;
  let numericCount = 0;
  const rows: { recordId: string; fields: Record<string, string> }[] = [];
  const pageTokens = new Set<string>();
  for (let page = 0; page < 10; page++) {
    signal?.throwIfAborted();
    const options = { pageSize: 500, pageToken, fieldNames: requested.length ? requested : [fields[0].field_name] };
    const result = useSearch
      ? await client.searchRecords!({ ...options, conditions })
      : await client.listRecords(options);
    for (const record of result.items) {
      if (!query.filters.every(filter => matches(record, filter, fields.find(field => field.field_name === filter.field)!))) continue;
      count++;
      if (query.action === "sum") {
        const stored = record.fields[query.sumField!];
        const raw = sumField && COMPUTED_TYPES.includes(sumField.type) ? computedScalar(stored, sumField.field_name) : stored;
        if (raw != null && raw !== "") {
          const value = numeric(raw);
          if (value === null) throw new BaseQueryError(`Cột tính tổng “${query.sumField}” có dữ liệu không phải số; không thể trả tổng chính xác. Cột công thức/lookup chỉ tính tổng khi kết quả là số.`);
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
  throw new BaseQueryError("Truy vấn vượt giới hạn đọc 5.000 dòng ứng viên; chưa có kết quả đầy đủ. Hãy thu hẹp bộ lọc lựa chọn đơn hoặc dùng bảng tổng hợp.");
}
