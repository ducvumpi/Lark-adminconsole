import { z } from 'zod';
export const input = z.object({
 title:z.string().min(1).max(180).describe('Tên hồ sơ ngân sách do người lập nhập'),
 sheetUrl:z.string().max(500).describe('Liên kết Lark Sheets nguồn hoặc chuỗi rỗng nếu nhập trực tiếp'),
 approvers:z.array(z.string().min(1).max(100)).max(10).describe('Tên hoặc email người duyệt đề xuất; đây chưa phải danh tính được xác thực của native Approval'),
 lines:z.array(z.object({id:z.string().min(4).max(35),amount:z.number().int().min(-10000000000000).max(10000000000000)}).strict()).min(1).max(50).describe('Các dòng từ list_a03 cùng tiền dự kiến, số nguyên VND, tối đa 50 dòng cùng Brand')
}).strict();
export const output=z.object({status:z.enum(['success','partial','failed','unknown']),recordIds:z.array(z.string()),message:z.string()});
