import axios, { AxiosInstance } from "axios";
import { getConfig, isConfigComplete } from "./config";
export interface LarkRecord {
  record_id: string; // bỏ dấu ? — Lark luôn trả về field này với record đã tồn tại
  fields: Record<string, unknown>;
}

export interface LarkField {
  field_id: string;
  field_name: string;
  type: number;
  property?: { options?: { id?: string; name: string }[] } | null;
}

export interface ListRecordsResult {
  items: LarkRecord[];
  hasMore: boolean;
  pageToken?: string;
  total: number;
}

/** Tên hiển thị dễ hiểu cho loại field của Lark Base */
export const FIELD_TYPE_LABEL: Record<number, string> = {
  1: "Văn bản",
  2: "Số",
  3: "Lựa chọn đơn",
  4: "Lựa chọn nhiều",
  5: "Ngày giờ",
  7: "Checkbox",
  11: "Người dùng",
  13: "Số điện thoại",
  15: "Liên kết",
  17: "Tệp đính kèm",
  18: "Lookup",
  19: "Công thức",
  20: "Công thức/Rollup",
  1001: "Người tạo",
  1002: "Thời gian tạo",
  1003: "Người sửa cuối",
  1004: "Thời gian sửa cuối",
  1005: "Số tự động",
};

class LarkApiError extends Error { }
/** Hàm dọn dẹp và chuẩn hóa dữ liệu để tránh lỗi TextFieldConvFail */
// // type: kiểu field thật lấy từ listFields() — 2 = Số, còn lại mặc định coi là Văn bản
// function sanitizeFieldValue(value: unknown, fieldType?: number): unknown {
//   if (value === null || value === undefined) {
//     return "";
//   }

//   if (typeof value === "object") {
//     if (Array.isArray(value) && value.length > 0 && "type" in value[0]) {
//       return value;
//     }
//     return JSON.stringify(value);
//   }

//   // Field Số (type 2): ép về number thật, không để lọt string
//   if (fieldType === 2) {
//     if (typeof value === "number") return value;
//     const num = Number(value);
//     return Number.isFinite(num) ? num : value;
//   }

//   // Field khác (mặc định coi là Text): ép về string
//   return String(value);
// }
/** Chuẩn hóa null/undefined và object — áp dụng cho MỌI trường hợp, không phụ thuộc field type. */
function normalizeRawValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "object") {
    if (Array.isArray(value) && value.length > 0 && "type" in value[0]) {
      return value; // Rich Text Array của Lark — giữ nguyên
    }
    return JSON.stringify(value);
  }
  return value; // number/string/boolean — GIỮ NGUYÊN kiểu gốc, không đoán
}


/** Ép kiểu theo field type THẬT — chỉ áp dụng khi caller biết chắc field type (có fieldTypeMap).
 * Không dùng làm default, để tránh phá vỡ các luồng vốn đã tự parse đúng kiểu (import Excel, v.v.) */
function coerceByFieldType(value: unknown, fieldType: number): unknown {
  if (typeof value === "object") return value; // rich text array/json string đã xử lý ở normalizeRawValue

  if (fieldType === 2) {
    // Field Số: ép về number thật
    if (typeof value === "number") return value;
    const num = Number(value);
    return Number.isFinite(num) ? num : value;
  }

  // Field khác (Văn bản...): ép về string
  return typeof value === "string" ? value : String(value);
}

function sanitizeFieldValue(value: unknown, fieldType?: number): unknown {
  const normalized = normalizeRawValue(value);
  if (fieldType === undefined) return normalized; // KHÔNG đoán kiểu nếu không biết field type thật
  return coerceByFieldType(normalized, fieldType);
}
export class LarkBaseClient {
  private http: AxiosInstance;
  private accessToken = "";
  private tokenExpiry = 0;

  constructor() {
    const { apiBaseUrl } = getConfig();
    this.http = axios.create({
      baseURL: apiBaseUrl,
      headers: { "Content-Type": "application/json" },
    });
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) return this.accessToken;

    const { appId, appSecret } = getConfig();
    if (!appId || !appSecret) {
      throw new LarkApiError("Chưa cấu hình App ID / App Secret. Vào trang Cài đặt để nhập.");
    }

    const res = await this.http.post("/auth/v3/tenant_access_token/internal", {
      app_id: appId,
      app_secret: appSecret,
    });

    if (res.data.code !== 0) {
      throw new LarkApiError(`Lark auth lỗi (code ${res.data.code}): ${res.data.msg}`);
    }

    this.accessToken = res.data.tenant_access_token;
    this.tokenExpiry = Date.now() + (res.data.expire - 300) * 1000;
    return this.accessToken;
  }

  private async authHeader() {
    const token = await this.getAccessToken();
    return { Authorization: `Bearer ${token}` };
  }

  private tablePath(suffix = "") {
    const { baseAppToken, tableId } = getConfig();
    if (!baseAppToken || !tableId) {
      throw new LarkApiError("Chưa cấu hình Base App Token / Table ID. Vào trang Cài đặt để nhập.");
    }
    return `/bitable/v1/apps/${baseAppToken}/tables/${tableId}${suffix}`;
  }

  async listFields(): Promise<LarkField[]> {
    const headers = await this.authHeader();

    const allFields: LarkField[] = [];
    let pageToken: string | undefined;

    do {
      const params: Record<string, unknown> = { page_size: 100 };
      if (pageToken) params.page_token = pageToken;

      const res = await this.http.get<any>(this.tablePath("/fields"), { headers, params });
      if (res.data.code !== 0) {
        throw new LarkApiError(`Lấy danh sách field lỗi (code ${res.data.code}): ${res.data.msg}`);
      }

      const d = res.data.data;
      allFields.push(...(d.items ?? []));
      pageToken = d.has_more ? d.page_token : undefined;
    } while (pageToken);

    console.dir(allFields, { depth: null });

    return allFields;
  }

  async listRecords(options?: {
    filter?: string;
    pageSize?: number;
    pageToken?: string;
    fieldNames?: string[];
  }): Promise<ListRecordsResult> {
    const headers = await this.authHeader();
    const params: Record<string, unknown> = {
      page_size: options?.pageSize ?? 20,
      // Bắt buộc để Lark TÍNH và trả về giá trị các field loại Lookup/Formula/Rollup/
      // CreatedTime/ModifiedTime — thiếu param này, các field đó luôn về rỗng dù có
      // liệt kê tên trong field_names, và Lark KHÔNG báo lỗi gì cả.
      automatic_fields: true,
    };
    if (options?.filter) params.filter = options.filter;
    if (options?.pageToken) params.page_token = options.pageToken;
    if (options?.fieldNames?.length) {
      params.field_names = JSON.stringify(options.fieldNames);
    }

    const res = await this.http.get<any>(this.tablePath("/records"), { headers, params });
    if (res.data.code !== 0) {
      throw new LarkApiError(`Lấy danh sách record lỗi (code ${res.data.code}): ${res.data.msg}`);
    }
    const d = res.data.data;
    return {
      items: d.items ?? [],
      hasMore: Boolean(d.has_more),
      pageToken: d.page_token,
      total: d.total ?? 0,
    };
  }
  /** Lấy CHÍNH XÁC 1 record theo record_id — dùng để xác minh trực tiếp record có tồn tại trong
   * đúng Base/Table đang cấu hình hay không (hữu ích khi debug "audit log có, nhưng Base không thấy"). */
 async getRecord(recordId: string): Promise<LarkRecord | null> {
  const headers = await this.authHeader();
  try {
    const res = await this.http.get<any>(this.tablePath(`/records/${recordId}`), {
      headers,
      params: { automatic_fields: true }, // như trên — cần cho Lookup/Formula
    });
    if (res.data.code !== 0) {
      throw new LarkApiError(`Lấy record lỗi (code ${res.data.code}): ${res.data.msg}`);
    }
    return res.data.data.record;
  } catch (err: any) {
    if (err.response?.status === 404 || err.response?.data?.code === 1254043) {
      return null;
    }
    throw err;
  }
}
  async createRecord(
    fields: Record<string, unknown>,
    fieldTypeMap?: Map<string, number>
  ): Promise<LarkRecord> {
    const headers = await this.authHeader();

    const sanitizedFields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      sanitizedFields[key] = sanitizeFieldValue(value, fieldTypeMap?.get(key));
    }

    const res = await this.http.post<any>(this.tablePath("/records"), { fields: sanitizedFields }, { headers });
    if (res.data.code !== 0) {
      throw new LarkApiError(`Tạo record lỗi (code ${res.data.code}): ${res.data.msg}`);
    }
    return res.data.data.record;
  }

  async batchCreateRecords(
    recordsFields: Record<string, unknown>[],
    fieldTypeMap?: Map<string, number>
  ): Promise<LarkRecord[]> {
    const headers = await this.authHeader();

    const sanitizedRecords = recordsFields.map((f) => {
      const sanitizedFields: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(f)) {
        sanitizedFields[key] = sanitizeFieldValue(value, fieldTypeMap?.get(key));
      }
      return { fields: sanitizedFields };
    });

    const res = await this.http.post(this.tablePath("/records/batch_create"), { records: sanitizedRecords }, { headers });
    if (res.data.code !== 0) {
      throw new LarkApiError(`Tạo hàng loạt record lỗi (code ${res.data.code}): ${res.data.msg}`);
    }
    return res.data.data.records;
  }


  async updateRecord(
    recordId: string,
    fields: Record<string, unknown>,
    fieldTypeMap?: Map<string, number>
  ): Promise<LarkRecord> {
    const headers = await this.authHeader();

    const sanitizedFields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      sanitizedFields[key] = sanitizeFieldValue(value, fieldTypeMap?.get(key));
    }

    const res = await this.http.put<any>(
      this.tablePath(`/records/${recordId}`),
      { fields: sanitizedFields },
      { headers }
    );

    if (res.data.code !== 0) {
      throw new LarkApiError(`Cập nhật record lỗi (code ${res.data.code}): ${res.data.msg}`);
    }
    return res.data.data.record;
  }

  async deleteRecord(recordId: string): Promise<void> {
    const headers = await this.authHeader();
    const res = await this.http.delete<any>(this.tablePath(`/records/${recordId}`), { headers });
    if (res.data.code !== 0) {
      throw new LarkApiError(`Xóa record lỗi (code ${res.data.code}): ${res.data.msg}`);
    }
  }
  /**
 * Đọc TẤT CẢ record khớp điều kiện filter (Lark filter syntax), tự động phân trang.
 * filter ví dụ: `CurrentValue.[Số tiền TGĐ duyệt]<0`
 */
  async findRecordsByFilter(
    filter: string,
    fieldNames?: string[]
  ): Promise<LarkRecord[]> {
    const all: LarkRecord[] = [];
    let pageToken: string | undefined;

    do {
      const result = await this.listRecords({
        filter,
        pageSize: 100,
        pageToken,
        fieldNames,
      });
      all.push(...result.items);
      pageToken = result.hasMore ? result.pageToken : undefined;
    } while (pageToken);

    return all;
  }

  /**
   * Xóa hàng loạt record theo record_id, tự chia batch tối đa 500/lần (giới hạn của Lark).
   * Trả về danh sách id xóa thành công / thất bại để dễ log lại.
   */
  async batchDeleteRecords(
    recordIds: string[]
  ): Promise<{ deleted: string[]; failed: string[] }> {
    const headers = await this.authHeader();
    const deleted: string[] = [];
    const failed: string[] = [];

    for (let i = 0; i < recordIds.length; i += 500) {
      const chunk = recordIds.slice(i, i + 500);
      try {
        const res = await this.http.post<any>(
          this.tablePath("/records/batch_delete"),
          { records: chunk },
          { headers }
        );
        if (res.data.code !== 0) {
          throw new LarkApiError(
            `Xóa hàng loạt record lỗi (code ${res.data.code}): ${res.data.msg}`
          );
        }
        deleted.push(...chunk);
      } catch (err) {
        failed.push(...chunk);
      }
    }

    return { deleted, failed };
  }

  /**
   * Hàm tiện ích cấp cao: tìm các record có field "Số tiền TGĐ duyệt" âm.
   * fieldName truyền vào phòng trường hợp tên cột khác đi ở base khác.
   */
  async findNegativeApprovedAmountRecords(
    fieldName = "Số tiền TGĐ duyệt"
  ): Promise<LarkRecord[]> {
    return this.findRecordsByFilter(`CurrentValue.[${fieldName}]<0`, [
      fieldName,
    ]);
  }
}

export function getLarkClient(): LarkBaseClient {
  const cfg = getConfig();
  if (!isConfigComplete(cfg)) {
    throw new LarkApiError(
      "Chưa cấu hình đầy đủ App ID / App Secret / Base Token / Table ID. Vào trang Cài đặt để nhập."
    );
  }
  return new LarkBaseClient();
}