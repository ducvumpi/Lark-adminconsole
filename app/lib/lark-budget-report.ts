import type { BudgetReport } from "./lark-ai-query";

function clean(value: string, maxLength = 90): string {
  const text = value.replace(/[\p{Cc}\p{Cf}]/gu, " ").replace(/`/g, "'").replace(/\|/g, "/").replace(/</g, "‹").replace(/>/g, "›").trim();
  return text.length > maxLength ? text.slice(0, maxLength - 1) + "…" : text;
}

/** Fixed-width text works even when the chat renderer does not support tables.
 * The workflow's existing Send reply handles delivery; this never sends a message.
 */
export function formatBudgetReport(report: BudgetReport, filters: unknown, title?: string): string {
  const number = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });
  const integer = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });
  const conditions = Array.isArray(filters) ? filters.map(filter => {
    if (!filter || typeof filter !== "object") return "";
    const entry = filter as Record<string, unknown>;
    const operators: Record<string, string> = { equals: "=", contains: "chứa", gt: ">", gte: "≥", lt: "<", lte: "≤" };
    return `${clean(String(entry.field))} ${operators[String(entry.operator)] ?? "?"} ${clean(String(entry.value))}`;
  }).filter(Boolean) : [];
  const matrix = [
    [...report.groupBy.map(name => clean(name, 24)), "Bản ghi", "Tổng"],
    ...report.groups.map(group => [...group.values.map(value => clean(value || "(Trống)", 24)), integer.format(group.count), number.format(group.sum)]),
  ];
  if (report.hasMoreGroups) {
    matrix.push([`Khác (${report.other.groupCount} nhóm)`, ...report.groupBy.slice(1).map(() => ""), integer.format(report.other.count), number.format(report.other.sum)]);
  }
  const widths = matrix[0].map((_, index) => Math.max(...matrix.map(row => row[index].length)));
  const table = matrix.map((row, rowIndex) => row.map((value, column) => column >= report.groupBy.length && rowIndex > 0
    ? value.padStart(widths[column]) : value.padEnd(widths[column])).join(" | "));
  table.splice(1, 0, widths.map(width => "-".repeat(width)).join("-+-"));
  return [
    clean(title?.trim() || "BÁO CÁO NGÂN SÁCH"),
    `Phạm vi: ${conditions.length ? conditions.join("; ") : "Tất cả bản ghi trong bảng đang cấu hình"}`,
    `Cột cộng: ${clean(report.sumField)}`,
    `Tổng: ${number.format(report.sum)} | Bản ghi: ${integer.format(report.count)} | Nhóm: ${integer.format(report.groupCount)}`,
    report.emptyCount ? `Có ${integer.format(report.emptyCount)} bản ghi trống số tiền, không cộng vào tổng.` : "",
    "", "```", ...table, "```",
    report.hasMoreGroups ? `Hiển thị ${report.groups.length}/${report.groupCount} nhóm theo tổng giảm dần; các nhóm còn lại gộp ở dòng Khác. Tổng phía trên gồm toàn bộ nhóm.` : "Đã tổng hợp đầy đủ các bản ghi phù hợp, nhóm sắp theo tổng giảm dần.",
    "Số hiển thị làm tròn tối đa 2 chữ số thập phân; đơn vị theo cột nguồn. Chưa tự loại trùng hoặc loại ngân sách cha/con.",
  ].filter((line, index, lines) => line !== "" || (index > 0 && lines[index - 1] !== "")).join("\n");
}
