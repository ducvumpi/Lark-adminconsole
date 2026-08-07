export const SESSION_COOKIE = "lark_web_session";

/** Giá trị cookie hợp lệ = SESSION_SECRET trong .env (chỉ server biết, không suy ra được từ mật khẩu) */
export function getExpectedSessionValue(): string {
  return process.env.SESSION_SECRET || "";
}