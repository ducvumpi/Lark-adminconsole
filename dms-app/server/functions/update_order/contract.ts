import {z} from 'zod';
export const input = z.object({id:z.string().describe('ID đơn từ list_orders'),status:z.enum(['Nháp','Đã xác nhận','Đang giao','Hoàn tất','Đã hủy']).describe('Trạng thái mới của đơn'),paid:z.number().int().min(0).describe('Tổng số tiền VND đã thu, không phải khoản thu tăng thêm')}).strict();
export const output = z.object({status:z.enum(['success','partial','failed','unknown']),message:z.string(),recordIds:z.array(z.string())});
