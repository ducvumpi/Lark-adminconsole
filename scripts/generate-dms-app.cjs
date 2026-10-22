const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve('dms-app');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'catalog.json'), 'utf8'));
const write = (file, body) => { const target = path.join(root, file); fs.mkdirSync(path.dirname(target), {recursive:true}); fs.writeFileSync(target, body); };
const table = name => catalog.tables.find(t => t.name === name);
const sql = (id, name, query, params = []) => {
  write(`database-functions/${id}/main.sql`, query);
  write(`database-functions/${id}/meta.json`, JSON.stringify({name,description: `${name}. Chỉ đọc dữ liệu DMS của nhóm vận hành được cấp quyền truy cập ứng dụng.`,meta:{params}},null,2));
};
const offset = [{name:'offset',kind:'INT',description:'Số bản ghi bỏ qua, bắt đầu 0 và tăng 200 mỗi trang',nullable:false,minimum:0,maximum:1000000}];
const columns = {
  partners: ['DMS - Đối tác', {'Tên đối tác':'name','Mã đối tác':'code','Loại':'type','Khu vực':'region','Điện thoại':'phone','Địa chỉ':'address','Trạng thái':'status','Ghi chú':'notes'}],
  products: ['DMS - Sản phẩm', {'Tên sản phẩm':'name','SKU':'sku','Đơn vị':'unit','Nhóm hàng':'category','Giá bán':'price','Tồn tối thiểu':'minimum','Trạng thái':'status'}],
  warehouses: ['DMS - Kho', {'Tên kho':'name','Mã kho':'code','Địa chỉ':'address','Người phụ trách':'manager'}],
  orders: ['DMS - Đơn hàng', {'Mã đơn':'code','Đối tác ID':'partner_id','Kho ID':'warehouse_id','Ngày đặt':'date','Trạng thái':'status','Chi tiết JSON':'lines','Tổng tiền':'total','Đã thu':'paid','Ghi chú':'notes'}],
  movements: ['DMS - Sổ kho', {'Mã phiếu':'code','Sản phẩm ID':'product_id','Kho ID':'warehouse_id','Loại phiếu':'type','Số lượng':'quantity','Ngày ghi nhận':'date','Tham chiếu':'reference','Ghi chú':'notes'}],
};
function projection(name, fields) {
  const t = table(name);
  return ['rec_id AS id', ...Object.entries(fields).map(([field, alias]) => `${t.fields[field].sqlType.kind === 'OPTION' ? `("${field}").name` : `"${field}"`} AS ${alias}`)].join(', ');
}
for (const [id, [name, fields]] of Object.entries(columns)) sql(`list_${id}`, `Danh sách ${name}`, `SELECT ${projection(name,fields)} FROM "${name}" ORDER BY rec_id DESC LIMIT 200 OFFSET $1`,offset);
sql('get_order','Chi tiết đơn hàng',`SELECT ${projection(...columns.orders)} FROM "DMS - Đơn hàng" WHERE rec_id = $1 LIMIT 1`,[{name:'id',kind:'TEXT',description:'ID đơn hàng lấy từ list_orders',nullable:false}]);
sql('order_products','Giá sản phẩm cho đơn hàng',`SELECT ${projection(...columns.products)} FROM "DMS - Sản phẩm" WHERE rec_id = ANY($1) LIMIT 50`,[{name:'ids',kind:'TEXT[]',description:'ID các sản phẩm lấy từ list_products, tối đa 50',nullable:false}]);
sql('order_partner','Đối tác của đơn hàng',`SELECT ${projection(...columns.partners)} FROM "DMS - Đối tác" WHERE rec_id = $1 LIMIT 1`,[{name:'id',kind:'TEXT',description:'ID đối tác lấy từ list_partners',nullable:false}]);
sql('order_warehouse','Kho của đơn hàng',`SELECT ${projection(...columns.warehouses)} FROM "DMS - Kho" WHERE rec_id = $1 LIMIT 1`,[{name:'id',kind:'TEXT',description:'ID kho lấy từ list_warehouses',nullable:false}]);
const shared = `
const resultSchema = z.object({status:z.enum(['success','partial','failed','unknown']),message:z.string(),recordIds:z.array(z.string())});
const recordId = z.string().regex(/^rec[A-Za-z0-9]{1,32}$/);
const label = z.string().trim().min(1).max(200);
const optionalText = z.string().trim().max(2000);
function summarize(result: {status:string;appliedIds?:string[]}) {
  const status = result.status as 'success'|'partial'|'failed'|'unknown';
  return { status, recordIds:result.appliedIds || [], message: status==='success' ? 'Đã lưu thành công.' : status==='partial' ? 'Chỉ lưu được một phần. Hãy tải lại để kiểm tra.' : status==='unknown' ? 'Chưa xác định kết quả lưu. Hãy tải lại và đối chiếu trước khi gửi lại.' : 'Không thể lưu dữ liệu. Kiểm tra quyền truy cập và thử lại.' };
}
function fail(message:string):never { throw new SDKError('DMS_VALIDATION',message,{wireCode:400}); }
function validateDate(value:string) { if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) fail('Ngày không hợp lệ.');const parsed=new Date(value+'T00:00:00Z');if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==value) fail('Ngày không hợp lệ.'); }
function queryRows(value:unknown):Record<string,unknown>[] {
  if (typeof value!=='object'||value===null) return fail('Không đọc được dữ liệu kiểm tra.');
  const body=value as {code?:number;data?:{rows?:unknown}};
  if(body.code!==0||!Array.isArray(body.data?.rows)||body.data.rows.some(r=>typeof r!=='object'||r===null||Array.isArray(r))) return fail('Không đọc được dữ liệu kiểm tra.');
  return body.data.rows as Record<string,unknown>[];
}
`;
function faas(id,name,schema,handler) {
  // Patterns and input transforms are validated in handlers: this CLI cannot expose them in discovery schemas.
  schema = schema.replace(/\.trim\(\)/g, '').replace(/\.regex\(\/.*?\/\)/g, '');
  write(`server/functions/${id}/contract.ts`, `import {z} from 'zod';\nexport const input = ${schema};\nexport const output = z.object({status:z.enum(['success','partial','failed','unknown']),message:z.string(),recordIds:z.array(z.string())});\n`);
  write(`server/functions/${id}/meta.json`,JSON.stringify({name,description:name+' cho nhóm vận hành nội bộ. Sau lỗi kết quả chưa xác định, đọc lại danh sách trước khi gửi lại.'}));
  write(`server/functions/${id}/index.ts`,`import {z} from 'zod';\nimport {defineFunction, SDKError} from '@lark-base-open/base-database-app-sdk/server';\nimport {input,output} from './contract.js';\n${shared}\nexport default defineFunction({input,output,handler:async(params,ctx)=>{${handler}}});\n`);
}
const target = name => JSON.stringify({baseToken:table(name).baseToken,tableId:table(name).id});
const entitySpecs = {
  partners: {schema:`z.object({recordId:z.string().regex(/^rec[A-Za-z0-9]{1,32}$/).optional().describe('ID đối tác khi sửa; bỏ trống khi tạo'),name:z.string().trim().min(1).max(200).describe('Tên đối tác'),code:z.string().trim().min(1).max(100).describe('Mã đối tác'),type:z.enum(['Nhà phân phối','Đại lý']).describe('Loại đối tác'),region:z.string().max(200).describe('Khu vực'),phone:z.string().max(50).describe('Điện thoại'),address:z.string().max(500).describe('Địa chỉ'),status:z.enum(['Hoạt động','Tạm ngưng']).describe('Trạng thái'),notes:z.string().max(2000).describe('Ghi chú')}).strict()`,name:'Lưu đối tác'},
  products: {schema:`z.object({recordId:z.string().regex(/^rec[A-Za-z0-9]{1,32}$/).optional().describe('ID sản phẩm khi sửa; bỏ trống khi tạo'),name:z.string().trim().min(1).max(200).describe('Tên sản phẩm'),sku:z.string().trim().min(1).max(100).describe('Mã SKU'),unit:z.string().trim().min(1).max(50).describe('Đơn vị tính'),category:z.string().max(200).describe('Nhóm hàng'),price:z.number().int().min(0).max(1000000000).describe('Giá bán VND'),minimum:z.number().int().min(0).max(1000000).describe('Mức tồn tối thiểu'),status:z.enum(['Đang bán','Ngừng bán']).describe('Trạng thái sản phẩm')}).strict()`,name:'Lưu sản phẩm'},
  warehouses: {schema:`z.object({recordId:z.string().regex(/^rec[A-Za-z0-9]{1,32}$/).optional().describe('ID kho khi sửa; bỏ trống khi tạo'),name:z.string().trim().min(1).max(200).describe('Tên kho'),code:z.string().trim().min(1).max(100).describe('Mã kho'),address:z.string().max(500).describe('Địa chỉ kho'),manager:z.string().max(200).describe('Người phụ trách')}).strict()`,name:'Lưu kho'},
};
for (const [id,spec] of Object.entries(entitySpecs)) {
  const [name,fields] = columns[id];
  const mapped = Object.entries(fields).map(([field,alias])=>`${JSON.stringify(field)}:${['price','minimum'].includes(alias)?`params.${alias}`:`params.${alias}.trim()`}`).join(',');
  const required=id==='products'?['Tên sản phẩm','SKU','Đơn vị']:id==='partners'?['Tên đối tác','Mã đối tác']:['Tên kho','Mã kho'];
  faas(`save_${id}`,spec.name,spec.schema,`const fields={${mapped}};if(${JSON.stringify(required)}.some(key=>!String((fields as Record<string,unknown>)[key]).trim())) fail('Vui lòng nhập đầy đủ các trường bắt buộc.');if(params.recordId&&!/^rec[A-Za-z0-9]{1,32}$/.test(params.recordId)) fail('ID bản ghi không hợp lệ.'); const target=${target(name)}; return summarize(params.recordId ? await ctx.records.update(target,{[params.recordId]:fields}) : await ctx.records.create(target,[fields]));`);
}
const site = JSON.parse(fs.readFileSync(path.join(root,'.base-database-cli/state/init.json'),'utf8')).resources;
const siteId = site.appToken || site.databaseToken;
const configText = fs.readFileSync(path.join(root,'base-database.jsonc'),'utf8');
const appToken = siteId || configText.match(/"appToken"\s*:\s*"([^"]+)"/)[1];
faas('create_order','Tạo đơn hàng',`z.object({partnerId:z.string().describe('ID đối tác từ list_partners'),warehouseId:z.string().describe('ID kho từ list_warehouses'),date:z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/).describe('Ngày đặt hàng theo giờ Việt Nam YYYY-MM-DD'),notes:z.string().max(2000).describe('Ghi chú đơn hàng'),lines:z.array(z.object({productId:z.string().describe('ID sản phẩm từ list_products'),quantity:z.number().int().min(1).max(1000000).describe('Số lượng đặt')}).strict()).min(1).max(50).describe('Chi tiết sản phẩm và số lượng, không gửi giá từ trình duyệt')}).strict()`, `
validateDate(params.date);
const productIds=params.lines.map(l=>l.productId);
if(new Set(productIds).size!==productIds.length) return fail('Mỗi sản phẩm chỉ xuất hiện một lần trong đơn.');
const request=(functionId:string,args:unknown[])=>ctx.invokeFunction({projectId:${JSON.stringify(appToken)},functionId,params:args});
const checked=await Promise.all([request('order_products',[productIds]),request('order_partner',[params.partnerId]),request('order_warehouse',[params.warehouseId])]);
const products=queryRows(checked[0]), partners=queryRows(checked[1]), warehouses=queryRows(checked[2]);
if(partners.length!==1||partners[0].status!=='Hoạt động'||warehouses.length!==1) return fail('Đối tác hoặc kho không hợp lệ.');
const lines=params.lines.map(line=>{const p=products.find(p=>p.id===line.productId);if(!p||p.status!=='Đang bán'||typeof p.price!=='number'||!Number.isSafeInteger(p.price)||p.price<0) return fail('Sản phẩm không còn bán hoặc giá chưa hợp lệ.');return {productId:line.productId,name:String(p.name||''),sku:String(p.sku||''),quantity:line.quantity,price:p.price,amount:line.quantity*p.price};});
const total=lines.reduce((s,l)=>s+l.amount,0);if(!Number.isSafeInteger(total)) return fail('Giá trị đơn hàng quá lớn.');
const code='DH-'+crypto.randomUUID().slice(0,8).toUpperCase();
return summarize(await ctx.records.create(${target(columns.orders[0])},[{'Mã đơn':code,'Đối tác ID':params.partnerId,'Kho ID':params.warehouseId,'Ngày đặt':params.date,'Trạng thái':'Nháp','Chi tiết JSON':JSON.stringify(lines),'Tổng tiền':total,'Đã thu':0,'Ghi chú':params.notes}]));`);
faas('update_order','Cập nhật trạng thái và tiền đã thu',`z.object({id:z.string().describe('ID đơn từ list_orders'),status:z.enum(['Nháp','Đã xác nhận','Đang giao','Hoàn tất','Đã hủy']).describe('Trạng thái mới của đơn'),paid:z.number().int().min(0).describe('Tổng số tiền VND đã thu, không phải khoản thu tăng thêm')}).strict()`,`
const rows=queryRows(await ctx.invokeFunction({projectId:${JSON.stringify(appToken)},functionId:'get_order',params:[params.id]}));
if(rows.length!==1) return fail('Không tìm thấy đơn hàng.');
const order=rows[0];const allowed:Record<string,string[]>={'Nháp':['Nháp','Đã xác nhận','Đã hủy'],'Đã xác nhận':['Đã xác nhận','Đang giao','Đã hủy'],'Đang giao':['Đang giao','Hoàn tất'],'Hoàn tất':['Hoàn tất'],'Đã hủy':['Đã hủy']};
if(!allowed[String(order.status)]?.includes(params.status)) return fail('Chuyển trạng thái không hợp lệ. Hãy tải lại đơn hàng.');
if(typeof order.total!=='number'||params.paid>order.total) return fail('Tiền đã thu không được vượt tổng đơn.');
if(params.status==='Đã hủy'&&params.paid!==0) return fail('Đơn đã hủy cần có số tiền đã thu bằng 0.');
return summarize(await ctx.records.update(${target(columns.orders[0])},{[params.id]:{'Trạng thái':params.status,'Đã thu':params.paid}}));`);
faas('create_movement','Ghi nhận phiếu nhập hoặc xuất kho',`z.object({productId:z.string().describe('ID sản phẩm từ list_products'),warehouseId:z.string().describe('ID kho từ list_warehouses'),type:z.enum(['Nhập kho','Xuất kho']).describe('Loại phiếu kho'),quantity:z.number().int().min(1).max(1000000).describe('Số lượng dương trên phiếu'),date:z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/).describe('Ngày phiếu YYYY-MM-DD'),reference:z.string().max(200).describe('Mã đơn hàng hoặc chứng từ tham chiếu'),notes:z.string().max(2000).describe('Ghi chú phiếu')}).strict()`,`
validateDate(params.date);
const checked=await Promise.all([ctx.invokeFunction({projectId:${JSON.stringify(appToken)},functionId:'order_products',params:[[params.productId]]}),ctx.invokeFunction({projectId:${JSON.stringify(appToken)},functionId:'order_warehouse',params:[params.warehouseId]})]);
if(queryRows(checked[0]).length!==1||queryRows(checked[1]).length!==1) return fail('Sản phẩm hoặc kho không hợp lệ.');
return summarize(await ctx.records.create(${target(columns.movements[0])},[{'Mã phiếu':(params.type==='Nhập kho'?'PN-':'PX-')+crypto.randomUUID().slice(0,8).toUpperCase(),'Sản phẩm ID':params.productId,'Kho ID':params.warehouseId,'Loại phiếu':params.type,'Số lượng':params.quantity,'Ngày ghi nhận':params.date,'Tham chiếu':params.reference,'Ghi chú':params.notes}]));`);
// Remove only the untouched scaffold greeting; no existing business functions are removed.
fs.rmSync(path.join(root,'server/functions/hello'),{recursive:true,force:true});
write('agent-tools.json',JSON.stringify({exclude:['order_products','order_partner','order_warehouse']},null,2));
write('README.md',`# DMS Distribution Management\n\n## Background\nInternal distribution operations for distributors, dealers, products, sales orders and stock ledgers. Vietnamese interface and VND pricing.\n\n## Requested features\nManage distributors and dealers, orders and inventory on Lark Base.\n\n## Implemented capabilities\nPartner, product and warehouse creation and editing; multi-product draft orders with server-calculated price snapshots; order status and collected-amount updates; append-only receipt/issue vouchers; inventory by warehouse, low-stock alerts, receivables and dashboard. All admitted users share the same operations access. Only the five dedicated DMS tables are bound.\n\n## Status and limitations\nPreview implementation. Order status changes do not create stock vouchers; operators record warehouse movements separately and link the order code. Inventory is a reporting ledger, with negative balances highlighted; there is no atomic reservation or prevention of overselling. Collected amount is a current balance, not an accounting payment ledger. No strict role segregation, tax invoice, GPS, purchasing, returns workflow or offline mode. Concurrent edits require operational coordination; the backend has no transactional compare-and-set or uniqueness guarantee. Records with unknown write outcomes must be reconciled before manual retry. UI interaction and multi-user behavior require user acceptance.\n\n## Local project\nRun base-database-cli contracts generate, check --json, then deploy. Production promotion requires approval after Preview review.\n`);
console.log('Generated DMS queries and six server actions.');
