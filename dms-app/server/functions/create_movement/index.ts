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
validateDate(params.date);
const checked=await Promise.all([ctx.invokeFunction({projectId:"DENAp0kOirKIGijXz80lxDkggqx",functionId:'order_products',params:[[params.productId]]}),ctx.invokeFunction({projectId:"DENAp0kOirKIGijXz80lxDkggqx",functionId:'order_warehouse',params:[params.warehouseId]})]);
if(queryRows(checked[0]).length!==1||queryRows(checked[1]).length!==1) return fail('Sản phẩm hoặc kho không hợp lệ.');
return summarize(await ctx.records.create({"baseToken":"D4kXbl3y6aLftVsDCTTlhBkfgpe","tableId":"tblsaFXQD6cLPF34"},[{'Mã phiếu':(params.type==='Nhập kho'?'PN-':'PX-')+crypto.randomUUID().slice(0,8).toUpperCase(),'Sản phẩm ID':params.productId,'Kho ID':params.warehouseId,'Loại phiếu':params.type,'Số lượng':params.quantity,'Ngày ghi nhận':params.date,'Tham chiếu':params.reference,'Ghi chú':params.notes}]));}});
