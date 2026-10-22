import {z} from 'zod';
import {defineFunction, SDKError} from '@lark-base-open/base-database-app-sdk/server';
import {input,output} from './contract.js';

const resultSchema = z.object({status:z.enum(['success','partial','failed','unknown']),message:z.string(),recordIds:z.array(z.string())});
const recordId = z.string().regex(/^rec[A-Za-z0-9]{1,32}$/);
const label = z.string().trim().min(1).max(200);
const optionalText = z.string().trim().max(2000);
function summarize(result: {status:string;appliedIds?:string[]}) {
  const status = result.status as 'success'|'partial'|'failed'|'unknown';
  return { status, recordIds:result.appliedIds || [], message: status==='success' ? 'Đã lưu thành công.' : status==='partial' ? 'Chỉ lưu được một phần. Hãy tải lại để kiểm tra.' : status==='unknown' ? 'Chưa xác định kết quả lưu. Hãy tải lại và đối chiếu trước khi gửi lại.' : 'Không thể lưu dữ liệu. Kiểm tra quyền truy cập và thử lại.' };
}
function fail(message:string):never { throw new SDKError('DMS_VALIDATION',message,{wireCode:400}); }
function validateDate(value:string) { if(!/^\d{4}-\d{2}-\d{2}$/.test(value)) fail('Ngày không hợp lệ.');const parsed=new Date(value+'T00:00:00Z');if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==value) fail('Ngày không hợp lệ.'); }
function queryRows(value:unknown):Record<string,unknown>[] {
  if (typeof value!=='object'||value===null) return fail('Không đọc được dữ liệu kiểm tra.');
  const body=value as {code?:number;data?:{rows?:unknown}};
  if(body.code!==0||!Array.isArray(body.data?.rows)||body.data.rows.some(r=>typeof r!=='object'||r===null||Array.isArray(r))) return fail('Không đọc được dữ liệu kiểm tra.');
  return body.data.rows as Record<string,unknown>[];
}

export default defineFunction({input,output,handler:async(params,ctx)=>{
const rows=queryRows(await ctx.invokeFunction({projectId:"DENAp0kOirKIGijXz80lxDkggqx",functionId:'get_order',params:[params.id]}));
if(rows.length!==1) return fail('Không tìm thấy đơn hàng.');
const order=rows[0];const allowed:Record<string,string[]>={'Nháp':['Nháp','Đã xác nhận','Đã hủy'],'Đã xác nhận':['Đã xác nhận','Đang giao','Đã hủy'],'Đang giao':['Đang giao','Hoàn tất'],'Hoàn tất':['Hoàn tất'],'Đã hủy':['Đã hủy']};
if(!allowed[String(order.status)]?.includes(params.status)) return fail('Chuyển trạng thái không hợp lệ. Hãy tải lại đơn hàng.');
if(typeof order.total!=='number'||params.paid>order.total) return fail('Tiền đã thu không được vượt tổng đơn.');
if(params.status==='Đã hủy'&&params.paid!==0) return fail('Đơn đã hủy cần có số tiền đã thu bằng 0.');
return summarize(await ctx.records.update({"baseToken":"D4kXbl3y6aLftVsDCTTlhBkfgpe","tableId":"tblEXqwsjsn31shd"},{[params.id]:{'Trạng thái':params.status,'Đã thu':params.paid}}));}});
