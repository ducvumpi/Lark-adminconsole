import {z} from 'zod';
export const input=z.object({
 action:z.enum(['preview_sheet','submit','approve','reject','cancel']).describe('Xem tiền Sheet, gửi luồng, đồng ý, từ chối hoặc người lập rút hồ sơ'),
 id:z.string().min(4).max(35).describe('ID hồ sơ từ list_drafts; người gọi phải là người lập hoặc người được phân công duyệt'),
 version:z.string().max(80).describe('Phiên xử lý từ list_drafts; chuỗi rỗng với hồ sơ nháp cũ chưa có phiên'),
 comment:z.string().max(2000).describe('Ý kiến xử lý; bắt buộc khi từ chối, chuỗi rỗng nếu không ghi chú'),
 sheetHash:z.string().max(64).describe('SHA256 bản xem trước Sheet do preview_sheet trả về; submit phải gửi đúng, hành động khác gửi chuỗi rỗng'),
 nodes:z.array(z.object({label:z.string().min(1).max(100),userId:z.string().min(1).max(64),name:z.string().min(1).max(150)}).strict()).max(5).describe('Một đến năm node theo đúng thứ tự khi submit, userId lấy từ UserSelectorEditor.user_id; các hành động khác gửi mảng rỗng'),
}).strict();
export const output=z.object({status:z.string(),message:z.string(),version:z.string(),sheetHash:z.string().optional(),sheetLines:z.array(z.object({id:z.string(),code:z.string(),before:z.number().nullable(),proposed:z.number()})).optional()});
