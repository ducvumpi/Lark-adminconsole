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
function sanitizeTextField(value: unknown): unknown {
  // Nếu là null hoặc undefined, trả về chuỗi rỗng để xóa trắng ô
  if (value === null || value === undefined) {
    return ""; 
  }
  
  // Nếu vô tình truyền vào Object (ví dụ: dữ liệu từ API khác chứa ngày tháng, nested object)
  if (typeof value === "object") {
    // Kiểm tra nếu đã đúng cấu trúc Rich Text Array của Lark thì giữ nguyên
    if (Array.isArray(value) && value.length > 0 && "type" in value[0]) {
      return value;
    }
    // Nếu là object khác, ép kiểu về chuỗi JSON để tránh crash
    return JSON.stringify(value);
  }
  
  // Chuyển các kiểu dữ liệu khác (như boolean, số) thành string nếu mapping nhầm vào ô chữ
  return String(value);
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
  }): Promise<ListRecordsResult> {
    const headers = await this.authHeader();
    const params: Record<string, unknown> = { page_size: options?.pageSize ?? 20 };
    if (options?.filter) params.filter = options.filter;
    if (options?.pageToken) params.page_token = options.pageToken;

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
      const res = await this.http.get<any>(this.tablePath(`/records/${recordId}`), { headers });
      if (res.data.code !== 0) {
        throw new LarkApiError(`Lấy record lỗi (code ${res.data.code}): ${res.data.msg}`);
      }
      return res.data.data.record;
    } catch (err: any) {
      // Lark trả 404 nếu record không tồn tại trong Base/Table đang trỏ tới
      if (err.response?.status === 404 || err.response?.data?.code === 1254043) {
        return null;
      }
      throw err;
    }
  }

   async createRecord(fields: Record<string, unknown>): Promise<LarkRecord> {
    const headers = await this.authHeader();
    
    // Chuẩn hóa fields trước khi gửi
    const sanitizedFields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      sanitizedFields[key] = sanitizeTextField(value);
    }

    const res = await this.http.post<any>(this.tablePath("/records"), { fields: sanitizedFields }, { headers });
    if (res.data.code !== 0) {
      throw new LarkApiError(`Tạo record lỗi (code ${res.data.code}): ${res.data.msg}`);
    }
    return res.data.data.record;
  }

  async batchCreateRecords(recordsFields: Record<string, unknown>[]): Promise<LarkRecord[]> {
    const headers = await this.authHeader();
    
    // Chuẩn hóa cho chuỗi hàng loạt
    const sanitizedRecords = recordsFields.map((f) => {
      const sanitizedFields: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(f)) {
        sanitizedFields[key] = sanitizeTextField(value);
      }
      return { fields: sanitizedFields };
    });

    const res = await this.http.post(
      this.tablePath("/records/batch_create"),
      { records: sanitizedRecords },
      { headers }
    );

    console.dir(res.data, { depth: null });

    if (res.data.code !== 0) {
      throw new LarkApiError(`Tạo hàng loạt record lỗi (code ${res.data.code}): ${res.data.msg}`);
    }
    return res.data.data.records;
  }


  async updateRecord(recordId: string, fields: Record<string, unknown>): Promise<LarkRecord> {
    const headers = await this.authHeader();
    const res = await this.http.put<any>(
      this.tablePath(`/records/${recordId}`),
      { fields },
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