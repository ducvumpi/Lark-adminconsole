import {defineFunction,SDKError} from '@lark-base-open/base-database-app-sdk/server';
import {input,output} from './contract.js';
import {nodesForSubmit,applyDecision,captureSheet,assertBaseline,digest,type Line,type Node,type Audit} from './engine.js';
const APP='DpYlpukK7rwhddjOPfClC8Jcgae',BASE='Tc4qbZqpJaBWKXsQ03VlaVgzgwr',REQUESTS='tblesB2lbyj7iN9e',A03='tbljA87qUBDYVHYe';
const SHEET='GHglsL11ihh6kTt1vn6l0jF6gge',SHEET_ID='cfaf88';
const locks=new Map<string,Promise<unknown>>();
function fail(message:string):never{throw new SDKError('A03_FLOW',message,{wireCode:400});}
function parse<T>(value:unknown):T{try{return JSON.parse(String(value));}catch{return fail('Hồ sơ có dữ liệu không hợp lệ; chưa thực hiện ghi tiền.');}}
function rows(value:unknown):Record<string,unknown>[]{const b=value as {code?:number;data?:{rows?:unknown}};if(b?.code!==0||!Array.isArray(b.data?.rows))return fail('Không đọc được trạng thái hồ sơ.');return b.data.rows as Record<string,unknown>[];}
// One-process serialization reduces duplicate handling; Base has no distributed CAS.
async function lock<T>(id:string,work:()=>Promise<T>){const previous=locks.get(id)||Promise.resolve();const pending=previous.catch(()=>{}).then(work);locks.set(id,pending);try{return await pending;}finally{if(locks.get(id)===pending)locks.delete(id);}}
export default defineFunction({input,output,handler:async(params,ctx)=>lock(params.id,async()=>{
 if(!/^rec[A-Za-z0-9]{1,32}$/.test(params.id))return fail('ID hồ sơ không hợp lệ.');
 const context=rows(await ctx.invokeFunction({projectId:APP,functionId:'workflow_context',params:[params.id]}));
 if(context.length!==1)return fail('Bạn không được xem hoặc xử lý hồ sơ này.');
 const request=context[0],actor=String(request.actor_id||''),creator=String(request.creator||''),status=String(request.status||''),version=String(request.version||'');
 if(!actor)return fail('Không xác thực được người gọi.');
 if(version!==params.version)return fail('Hồ sơ vừa thay đổi. Hãy tải lại trước khi xử lý.');
 const snapshot=parse<{version:number;brand:string;lines:Line[]}>(request.snapshot);
 if(!Array.isArray(snapshot.lines)||!snapshot.lines.length||snapshot.lines.length>50||new Set(snapshot.lines.map(l=>l.id)).size!==snapshot.lines.length)return fail('Bản tiền có dòng không hợp lệ.');
 const audit:Audit[]=request.audit?parse(request.audit):[];
 let hash=String(request.hash||'');
 const now=new Date().toISOString(),nextVersion=crypto.randomUUID();
 const event=(action:string)=>audit.push({at:now,actor,action,comment:params.comment.trim(),hash});
 async function save(fields:Record<string,unknown>){const result=await ctx.records.update({baseToken:BASE,tableId:REQUESTS},{[params.id]:{...fields,'Phiên xử lý':nextVersion}});if(result.status!=='success')return fail('Kết quả lưu trạng thái chưa rõ. Tải lại để đối soát; không gửi lại tự động.');}
 async function sourceRows(){const found=rows(await ctx.invokeFunction({projectId:APP,functionId:'draft_rows',params:[snapshot.lines.map(l=>l.id)]}));if(found.length!==snapshot.lines.length)return fail('Có dòng A03 không còn tồn tại.');for(const line of snapshot.lines){const row=found.find(r=>r.id===line.id);if(!row)return fail('Không tìm thấy dòng A03.');try{assertBaseline(line,row);}catch(e){return fail(e instanceof Error?e.message:'A03 đã thay đổi.');}}return found;}
 if(params.action==='preview_sheet'||params.action==='submit'){
  if(actor!==creator||status!=='Nháp — chưa gửi Approval')return fail('Chỉ người lập được chốt và gửi hồ sơ nháp.');
  if(request.sheet_url!==`https://tsgsifizy3jj.sg.larksuite.com/sheets/${SHEET}`)return fail('Hồ sơ phải dùng bảng nhập tiền A03 đã kết nối.');
  await sourceRows();
  const appId=process.env.A03_LARK_APP_ID,secret=process.env.A03_LARK_APP_SECRET;
  if(!appId||!secret)return fail('Kết nối đọc tiền từ Lark Sheets chưa được cấu hình ở server. Hồ sơ chưa gửi duyệt.');
  let values:unknown[][];
  try{
   const tokenResponse=await ctx.fetch('https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({app_id:appId,app_secret:secret}),signal:AbortSignal.timeout(15000)});
   const token=await tokenResponse.json() as {code?:number;tenant_access_token?:string};if(!tokenResponse.ok||token.code!==0||!token.tenant_access_token)return fail('Lark chưa cấp quyền đọc bảng tính cho kết nối server.');
   const response=await ctx.fetch(`https://open.larksuite.com/open-apis/sheets/v2/spreadsheets/${SHEET}/values/${SHEET_ID}!A1:I4041?valueRenderOption=UnformattedValue`,{headers:{Authorization:`Bearer ${token.tenant_access_token}`},signal:AbortSignal.timeout(20000)});
   const result=await response.json() as {code?:number;data?:{valueRange?:{values?:unknown[][]}}};if(!response.ok||result.code!==0||!Array.isArray(result.data?.valueRange?.values))return fail('Kết nối server chưa đọc được Sheet. Cần quyền đọc tài liệu cho bot; chưa gửi hồ sơ.');values=result.data.valueRange.values;
  }catch(error){if(error instanceof SDKError)throw error;return fail('Không đọc được bảng tính từ server. Chưa gửi duyệt và chưa ghi A03.');}
  let captured:Line[];try{captured=captureSheet(values,snapshot.lines);}catch(e){return fail(e instanceof Error?e.message:'Không chốt được tiền từ Sheet.');}
  const sheetHash=await digest(captured);
  if(params.action==='preview_sheet')return {status:'preview',message:'Đã đọc tiền trực tiếp từ Sheet; chưa gửi duyệt.',version,sheetHash,sheetLines:captured.map(l=>({id:l.id,code:l.code,before:l.amount,proposed:l.proposed_amount}))};
  if(!params.sheetHash||params.sheetHash!==sheetHash)return fail('Tiền trong Sheet đã khác bản xem trước. Đọc và xác nhận lại trước khi gửi.');
  let nodes:Node[];try{nodes=nodesForSubmit(params.nodes,actor);}catch(e){return fail(e instanceof Error?e.message:'Luồng duyệt không hợp lệ.');}
  const sealed={version:2,brand:snapshot.brand,sheetReadAt:now,lines:captured};hash=await digest(sealed);event('Gửi duyệt bản tiền từ Sheet');
  const fields:Record<string,unknown>={'Trạng thái':'Đang duyệt','Bản tiền JSON':JSON.stringify(sealed),'Bản chốt SHA256':hash,'Luồng duyệt JSON':JSON.stringify(nodes),'Lịch sử duyệt JSON':JSON.stringify(audit),'Tổng tiền trình':captured.reduce((s,l)=>s+l.proposed_amount,0),'Người duyệt đề xuất JSON':JSON.stringify(nodes.map(n=>({id:n.userId,name:n.name})))};
  for(let i=0;i<5;i++)fields['Người duyệt '+(i+1)]=nodes[i]?[{id:nodes[i].userId}]:[];
  await save(fields);return {status:'pending',message:'Đã chốt tiền từ Sheet và mở node duyệt đầu tiên.',version:nextVersion};
 }
 if(params.action==='cancel'){
  if(actor!==creator||!['Nháp — chưa gửi Approval','Đang duyệt'].includes(status))return fail('Chỉ người lập được rút hồ sơ chưa hoàn tất.');
  event('Rút hồ sơ');await save({'Trạng thái':'Đã rút','Lịch sử duyệt JSON':JSON.stringify(audit)});return {status:'canceled',message:'Đã rút hồ sơ; chưa ghi A03.',version:nextVersion};
 }
 if(status!=='Đang duyệt')return fail('Hồ sơ không ở trạng thái chờ duyệt. Không tự thử lại hồ sơ đã ghi hoặc chưa rõ kết quả.');
 if(!hash||await digest(snapshot)!==hash)return fail('Bản tiền đã thay đổi so với lúc gửi. Dừng xử lý.');
 const stored=parse<Node[]>(request.nodes);let nodes:Node[];
 try{nodes=applyDecision(stored,actor,params.action==='approve'?'approve':'reject',params.comment,now);}catch(e){return fail(e instanceof Error?e.message:'Không có quyền xử lý node.');}
 event(params.action==='approve'?'Đồng ý node':'Từ chối node');
 if(params.action==='reject'||nodes.some(n=>n.status==='active')){
  await save({'Trạng thái':params.action==='reject'?'Đã từ chối':'Đang duyệt','Luồng duyệt JSON':JSON.stringify(nodes),'Lịch sử duyệt JSON':JSON.stringify(audit)});
  return {status:params.action==='reject'?'rejected':'pending',message:params.action==='reject'?'Đã từ chối; chưa ghi A03.':'Đã duyệt node và mở node kế tiếp.',version:nextVersion};
 }
 if(!nodes.length||nodes.some(n=>n.status!=='approved'))return fail('Chưa đủ các node đồng ý.');
 await sourceRows();
 await save({'Trạng thái':'Đang ghi A03','Luồng duyệt JSON':JSON.stringify(nodes),'Lịch sử duyệt JSON':JSON.stringify(audit)});
 const marker=rows(await ctx.invokeFunction({projectId:APP,functionId:'workflow_context',params:[params.id]}))[0];
 if(marker?.status!=='Đang ghi A03'||marker.version!==nextVersion||marker.hash!==hash)return fail('Trạng thái vừa thay đổi. Không thực hiện ghi tiền; cần đối soát.');
 const result=await ctx.records.update({baseToken:BASE,tableId:A03},Object.fromEntries(snapshot.lines.map(line=>[line.id,{'Số tiền TGĐ duyệt':line.proposed_amount,'Mã phiếu đề xuất':String(request.code)}])));
 const results=snapshot.lines.map(line=>({id:line.id,status:result.status==='success'?'saved':result.status}));
 if(result.status!=='success'){
  event('Dừng đồng bộ: kết quả ghi tiền cần đối soát');
  await save({'Trạng thái':'Cần đối soát','Kết quả đồng bộ JSON':JSON.stringify(results),'Lịch sử duyệt JSON':JSON.stringify(audit)});
  return {status:'partial',message:'Kết quả ghi tiền chưa đầy đủ hoặc chưa rõ. Không tự gửi lại; cần đối soát A03.',version:nextVersion};
 }
 event('Đã ghi toàn bộ bản tiền được duyệt vào A03');await save({'Trạng thái':'Đã ghi A03','Kết quả đồng bộ JSON':JSON.stringify(results),'Lịch sử duyệt JSON':JSON.stringify(audit)});
 return {status:'synced',message:'Node cuối đã duyệt và ghi xong tiền vào A03 của app.',version:nextVersion};
})});
