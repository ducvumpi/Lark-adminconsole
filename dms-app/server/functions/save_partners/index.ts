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

export default defineFunction({input,output,handler:async(params,ctx)=>{const fields={"Tên đối tác":params.name.trim(),"Mã đối tác":params.code.trim(),"Loại":params.type.trim(),"Khu vực":params.region.trim(),"Điện thoại":params.phone.trim(),"Địa chỉ":params.address.trim(),"Trạng thái":params.status.trim(),"Ghi chú":params.notes.trim()};if(["Tên đối tác","Mã đối tác"].some(key=>!String((fields as Record<string,unknown>)[key]).trim())) fail('Vui lòng nhập đầy đủ các trường bắt buộc.');if(params.recordId&&!/^rec[A-Za-z0-9]{1,32}$/.test(params.recordId)) fail('ID bản ghi không hợp lệ.'); const target={"baseToken":"D4kXbl3y6aLftVsDCTTlhBkfgpe","tableId":"tblPmSvbdiFUKlXZ"}; return summarize(params.recordId ? await ctx.records.update(target,{[params.recordId]:fields}) : await ctx.records.create(target,[fields]));}});
