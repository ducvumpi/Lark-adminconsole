import {z} from 'zod';
export const input = z.object({recordId:z.string().optional().describe('ID kho khi sửa; bỏ trống khi tạo'),name:z.string().min(1).max(200).describe('Tên kho'),code:z.string().min(1).max(100).describe('Mã kho'),address:z.string().max(500).describe('Địa chỉ kho'),manager:z.string().max(200).describe('Người phụ trách')}).strict();
export const output = z.object({status:z.enum(['success','partial','failed','unknown']),message:z.string(),recordIds:z.array(z.string())});
