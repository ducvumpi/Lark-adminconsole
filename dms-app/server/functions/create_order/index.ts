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
const productIds=params.lines.map(l=>l.productId);
if(new Set(productIds).size!==productIds.length) return fail('Mỗi sản phẩm chỉ xuất hiện một lần trong đơn.');
const request=(functionId:string,args:unknown[])=>ctx.invokeFunction({projectId:"DENAp0kOirKIGijXz80lxDkggqx",functionId,params:args});
const checked=await Promise.all([request('order_products',[productIds]),request('order_partner',[params.partnerId]),request('order_warehouse',[params.warehouseId])]);
const products=queryRows(checked[0]), partners=queryRows(checked[1]), warehouses=queryRows(checked[2]);
if(partners.length!==1||partners[0].status!=='Hoạt động'||warehouses.length!==1) return fail('Đối tác hoặc kho không hợp lệ.');
const lines=params.lines.map(line=>{const p=products.find(p=>p.id===line.productId);if(!p||p.status!=='Đang bán'||typeof p.price!=='number'||!Number.isSafeInteger(p.price)||p.price<0) return fail('Sản phẩm không còn bán hoặc giá chưa hợp lệ.');return {productId:line.productId,name:String(p.name||''),sku:String(p.sku||''),quantity:line.quantity,price:p.price,amount:line.quantity*p.price};});
const total=lines.reduce((s,l)=>s+l.amount,0);if(!Number.isSafeInteger(total)) return fail('Giá trị đơn hàng quá lớn.');
const code='DH-'+crypto.randomUUID().slice(0,8).toUpperCase();
return summarize(await ctx.records.create({"baseToken":"D4kXbl3y6aLftVsDCTTlhBkfgpe","tableId":"tblEXqwsjsn31shd"},[{'Mã đơn':code,'Đối tác ID':params.partnerId,'Kho ID':params.warehouseId,'Ngày đặt':params.date,'Trạng thái':'Nháp','Chi tiết JSON':JSON.stringify(lines),'Tổng tiền':total,'Đã thu':0,'Ghi chú':params.notes}]));}});
