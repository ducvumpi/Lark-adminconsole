const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve('a03-lark-app');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'catalog.json'), 'utf8'));
const config = JSON.parse(fs.readFileSync(path.join(root, 'base-database.jsonc'), 'utf8'));
const table = catalog.tables.find(t => t.name === 'A03. Ngân sách được duyệt');
const drafts = catalog.tables.find(t => t.name === 'A03. Hồ sơ trình duyệt');
const write = (name, value) => { const file = path.join(root, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value); };
const json = (name, value) => write(name, JSON.stringify(value, null, 2));
const q = name => '"' + name.replaceAll('"', '""') + '"';
const source = q(table.name), requests = q(drafts.name);
const filterOptions = {};
for (const [key, name] of Object.entries({ brand: 'Brand', year: 'Năm', quarter: 'Quý ngân sách', month: 'Tháng ngân sách' })) filterOptions[key] = table.fields[name].sqlType.options.map(option => option.name);
json('page/src/options.json', filterOptions);
const htmlPath = path.join(root, 'page/index.html');
fs.writeFileSync(htmlPath, fs.readFileSync(htmlPath, 'utf8').replace(/<title>.*?<\/title>/, '<title>A03 · Ngân sách được duyệt</title>').replace(/lang="[^"]+"/, 'lang="vi"'));
const projections = `rec_id AS id, "ID bản ghi nguồn" AS source_id, "Mã ngân sách" AS code, ("Brand").name AS brand, ("Năm").name AS year, ("Quý ngân sách").name AS quarter, ("Tháng ngân sách").name AS month, "Số tiền TGĐ duyệt" AS amount, "Nội dung chi tiêu" AS content, ("Loại ngân sách").name AS budget_type, ("Loại đề xuất").name AS request_type, "Note" AS note`;
function sql(id, name, description, query, params = []) { write(`database-functions/${id}/main.sql`, query + '\n'); json(`database-functions/${id}/meta.json`, { name, description, meta: { params } }); }
const filters = ['brand', 'year', 'quarter', 'month', 'keyword'].map((name, i) => ({ name, kind: 'TEXT', nullable: false, description: i === 4 ? 'Từ khóa mã hoặc nội dung; chuỗi rỗng để xem tất cả' : `Giá trị ${name} từ bộ lọc A03; chuỗi rỗng để không lọc` }));
const where = `($1 = '' OR ("Brand").name = $1) AND ($2 = '' OR ("Năm").name = $2) AND ($3 = '' OR ("Quý ngân sách").name = $3) AND ($4 = '' OR ("Tháng ngân sách").name = $4) AND ($5 = '' OR "Mã ngân sách" LIKE $5 OR "Nội dung chi tiêu" LIKE $5)`;
sql('list_a03', 'Tra cứu A03', 'Đọc bản sao ngân sách đã nhập, lọc theo Brand và kỳ; không dùng kết quả này làm chứng nhận Approval. Mọi thành viên được vào app có cùng quyền đọc.', `SELECT ${projections} FROM ${source} WHERE ${where} ORDER BY rec_id ASC LIMIT 50 OFFSET $6`, [...filters, { name: 'offset', kind: 'INT', nullable: false, minimum: 0, maximum: 1000000, description: 'Số dòng bỏ qua; bắt đầu 0, tăng 50 theo từng trang' }]);
sql('summary_a03', 'Tổng hợp các dòng A03', 'Đếm và cộng số tiền trên toàn bộ các dòng khớp bộ lọc, bao gồm dòng cha/con nếu có; không tự loại trùng ngân sách phân cấp.', `SELECT COUNT(rec_id) AS count, SUM("Số tiền TGĐ duyệt") AS amount, MIN("Mốc sao chép") AS copied_at FROM ${source} WHERE ${where}`, filters);
sql('detail_a03', 'Chi tiết một dòng A03', 'Đọc chi tiết bản sao một dòng ngân sách và dữ liệu nguồn lưu tại mốc sao chép, dùng ID do list_a03 trả về.', `SELECT ${projections}, "Dữ liệu nguồn JSON" AS source_json, "Mốc sao chép" AS copied_at FROM ${source} WHERE rec_id = $1 LIMIT 1`, [{ name: 'id', kind: 'TEXT', nullable: false, description: 'ID bản ghi ở Base mới từ list_a03, không phải ID nguồn' }]);
sql('draft_rows', 'Kiểm tra dòng lập hồ sơ', 'Đọc tối đa 50 dòng từ bản sao A03 và danh tính người gọi để server chốt tiền trong hồ sơ nháp; không xác nhận phê duyệt.', `SELECT ${projections}, CURRENT_USER_ID() AS operator_id FROM ${source} WHERE rec_id = ANY($1) LIMIT 50`, [{ name: 'ids', kind: 'TEXT[]', nullable: false, description: 'Danh sách ID A03 được chọn từ list_a03, tối đa 50 dòng' }]);
sql('list_drafts', 'Hồ sơ nháp của tôi', 'Chỉ đọc hồ sơ nháp của chính người gọi theo danh tính server; chưa phải phiếu native Lark Approval.', `SELECT rec_id AS id, "Tên hồ sơ" AS title, "Mã hồ sơ" AS code, "Brand" AS brand, "Trạng thái" AS status, "Thời gian lập" AS created_at, "Bảng tính nguồn" AS sheet_url, "Người duyệt đề xuất JSON" AS approvers, "Bản tiền JSON" AS snapshot, "Tổng tiền trình" AS total, "Số dòng" AS count FROM ${requests} WHERE "Người lập ID" = CURRENT_USER_ID() ORDER BY rec_id DESC LIMIT 50`);
write('server/functions/save_draft/contract.ts', `import { z } from 'zod';
export const input = z.object({
 title:z.string().min(1).max(180).describe('Tên hồ sơ ngân sách do người lập nhập'),
 sheetUrl:z.string().max(500).describe('Liên kết Lark Sheets nguồn hoặc chuỗi rỗng nếu nhập trực tiếp'),
 approvers:z.array(z.string().min(1).max(100)).max(10).describe('Tên hoặc email người duyệt đề xuất; đây chưa phải danh tính được xác thực của native Approval'),
 lines:z.array(z.object({id:z.string().min(4).max(35),amount:z.number().int().min(-10000000000000).max(10000000000000)}).strict()).min(1).max(50).describe('Các dòng từ list_a03 cùng tiền dự kiến, số nguyên VND, tối đa 50 dòng cùng Brand')
}).strict();
export const output=z.object({status:z.enum(['success','partial','failed','unknown']),recordIds:z.array(z.string()),message:z.string()});
`);
json('server/functions/save_draft/meta.json', { name: 'Lưu bản trình A03', description: 'Chốt giá trị hiện tại từ bản sao A03 và số tiền đề xuất vào hồ sơ nháp của người gọi; không tạo native Approval và không thay số tiền đã duyệt.' });
write('server/functions/save_draft/index.ts', `import {defineFunction,SDKError} from '@lark-base-open/base-database-app-sdk/server';
import {input,output} from './contract.js';
function fail(message:string):never{throw new SDKError('A03_VALIDATION',message,{wireCode:400});}
export default defineFunction({input,output,handler:async(params,ctx)=>{
 if(!params.title.trim())return fail('Tiêu đề không được để trống.');
 if(params.lines.some(line=>!/^rec[A-Za-z0-9]{1,32}$/.test(line.id)))return fail('ID bản ghi A03 không hợp lệ.');
 if(new Set(params.lines.map(l=>l.id)).size!==params.lines.length)return fail('Một dòng ngân sách chỉ xuất hiện một lần.');
 if(params.sheetUrl){let url:URL;try{url=new URL(params.sheetUrl);}catch{return fail('Link bảng tính không hợp lệ.');}if(url.protocol!=='https:'||url.username||url.password||url.port||!/(?:^|\\.)(?:larksuite\\.com|feishu\\.cn|larkoffice\\.com)$/.test(url.hostname)||!/^\\/sheets\\/[A-Za-z0-9]+\\/?$/.test(url.pathname))return fail('Chỉ nhận link Lark Sheets trực tiếp.');}
 const checked=await ctx.invokeFunction({projectId:${JSON.stringify(config.appToken)},functionId:'draft_rows',params:[params.lines.map(l=>l.id)]});
 if(typeof checked!=='object'||!checked)return fail('Không kiểm tra được dữ liệu A03.');
 const body=checked as {code?:number;data?:{rows?:unknown}};
 if(body.code!==0||!Array.isArray(body.data?.rows))return fail('Không kiểm tra được dữ liệu A03.');
 const rows=body.data.rows as {id:string;operator_id:string;brand:string;code:string;year:string;quarter:string;month:string;amount:number|null}[];
 if(rows.length!==params.lines.length||new Set(rows.map(r=>r.id)).size!==rows.length||!rows.every(r=>params.lines.some(l=>l.id===r.id)))return fail('Có dòng không còn tồn tại trong A03.');
 const actor=rows[0]?.operator_id,brand=rows[0]?.brand;
 if(!actor||!brand||rows.some(r=>r.brand!==brand||r.operator_id!==actor))return fail('Hồ sơ phải có các dòng cùng Brand và danh tính người lập hợp lệ.');
 const lines=params.lines.map(l=>{const row=rows.find(r=>r.id===l.id)!;return {...row,proposed_amount:l.amount};});
 const total=params.lines.reduce((s,l)=>s+l.amount,0);if(!Number.isSafeInteger(total))return fail('Tổng tiền vượt giới hạn số nguyên an toàn.');
 const result=await ctx.records.create({baseToken:${JSON.stringify(table.baseToken)},tableId:${JSON.stringify(drafts.id)}},[{'Tên hồ sơ':params.title.trim(),'Mã hồ sơ':'NS-'+crypto.randomUUID().slice(0,8).toUpperCase(),'Brand':brand,'Trạng thái':'Nháp — chưa gửi Approval','Người lập ID':actor,'Thời gian lập':new Date().toISOString(),'Bảng tính nguồn':params.sheetUrl,'Người duyệt đề xuất JSON':JSON.stringify(params.approvers),'Bản tiền JSON':JSON.stringify({version:1,brand,lines}),'Tổng tiền trình':total,'Số dòng':lines.length}]);
 const status=result.status;return {status,recordIds:'appliedIds' in result?result.appliedIds||[]:[],message:status==='success'?'Đã lưu bản trình nháp. Chưa gửi Approval và chưa ghi số tiền duyệt.':'Kết quả lưu: '+status+'. Tải lại hồ sơ để đối soát trước khi gửi lại.'};
}});
`);
json('agent-tools.json', { exclude: ['draft_rows'] });
write('README.md', `# A03 Budget Workspace\n\n## Background\nVietnamese budget workspace using an authorized one-time copy of the existing A03 approved-budget ledger. The original Base is not modified.\n\n## Requested features\nFocus on A03: browse and filter approved budgets, inspect source values, prepare proposed amounts and eventually connect native Lark Approval and editable Lark Sheets.\n\n## Implemented capabilities\nServer-side paginated A03 queries with Brand/year/quarter/month/code/content filters, filtered row totals, source snapshot details, selected-row CSV export, editable proposed-money grid and immutable draft creation with server-verified row values and actor identity. Draft lists are restricted to their creator. Users admitted to the application have equal read access to the copied A03 ledger; no B04 Brand segregation is claimed. An optional direct Lark Sheets URL opens in an iframe with an external-link fallback.\n\n## Status and limitations\nPreview only. Source data is a one-time snapshot, not a live synchronization. Formula/lookup/system values are preserved as snapshot text and raw JSON; dependencies from other source tables are not recreated. Arithmetic totals sum ledger rows and may include hierarchical parent/child overlaps. Approved amounts are read-only through app Functions. Drafts are not native Lark Approval instances; proposed approver names are unverified routing notes. Native Approval submission/status validation, automatic Sheets amount readback and approval-to-A03 writes are not connected. No fake approved state or direct financial-write Function is exposed. Embedded editing depends on Lark framing and document permissions and requires live UI acceptance. No distributed transaction or guaranteed unique request identifier. Unknown writes require readback before retry. Production publishing and multi-user/browser acceptance remain pending.\n\n## Development\nRun contracts generate, check --json and deploy using the Base Database CLI and selected profile. Only Preview is authorized by this implementation.\n`);
console.log(JSON.stringify({appToken:config.appToken,baseToken:table.baseToken,tableId:table.id,draftTableId:drafts.id,queries:5}));
