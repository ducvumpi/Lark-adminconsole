import {defineFunction,SDKError} from '@lark-base-open/base-database-app-sdk/server';
import {input,output} from './contract.js';
function fail(message:string):never{throw new SDKError('A03_VALIDATION',message,{wireCode:400});}
export default defineFunction({input,output,handler:async(params,ctx)=>{
 if(!params.title.trim())return fail('Tiêu đề không được để trống.');
 if(params.lines.some(line=>!/^rec[A-Za-z0-9]{1,32}$/.test(line.id)))return fail('ID bản ghi A03 không hợp lệ.');
 if(new Set(params.lines.map(l=>l.id)).size!==params.lines.length)return fail('Một dòng ngân sách chỉ xuất hiện một lần.');
 if(params.sheetUrl){let url:URL;try{url=new URL(params.sheetUrl);}catch{return fail('Link bảng tính không hợp lệ.');}if(url.protocol!=='https:'||url.username||url.password||url.port||!/(?:^|\.)(?:larksuite\.com|feishu\.cn|larkoffice\.com)$/.test(url.hostname)||!/^\/sheets\/[A-Za-z0-9]+\/?$/.test(url.pathname))return fail('Chỉ nhận link Lark Sheets trực tiếp.');}
 const checked=await ctx.invokeFunction({projectId:"DpYlpukK7rwhddjOPfClC8Jcgae",functionId:'draft_rows',params:[params.lines.map(l=>l.id)]});
 if(typeof checked!=='object'||!checked)return fail('Không kiểm tra được dữ liệu A03.');
 const body=checked as {code?:number;data?:{rows?:unknown}};
 if(body.code!==0||!Array.isArray(body.data?.rows))return fail('Không kiểm tra được dữ liệu A03.');
 const rows=body.data.rows as {id:string;operator_id:string;brand:string;code:string;year:string;quarter:string;month:string;amount:number|null}[];
 if(rows.length!==params.lines.length||new Set(rows.map(r=>r.id)).size!==rows.length||!rows.every(r=>params.lines.some(l=>l.id===r.id)))return fail('Có dòng không còn tồn tại trong A03.');
 const actor=rows[0]?.operator_id,brand=rows[0]?.brand;
 if(!actor||!brand||rows.some(r=>r.brand!==brand||r.operator_id!==actor))return fail('Hồ sơ phải có các dòng cùng Brand và danh tính người lập hợp lệ.');
 const lines=params.lines.map(l=>{const row=rows.find(r=>r.id===l.id)!;return {...row,proposed_amount:l.amount};});
 const total=params.lines.reduce((s,l)=>s+l.amount,0);if(!Number.isSafeInteger(total))return fail('Tổng tiền vượt giới hạn số nguyên an toàn.');
 const result=await ctx.records.create({baseToken:"Tc4qbZqpJaBWKXsQ03VlaVgzgwr",tableId:"tblesB2lbyj7iN9e"},[{'Tên hồ sơ':params.title.trim(),'Mã hồ sơ':'NS-'+crypto.randomUUID().slice(0,8).toUpperCase(),'Brand':brand,'Trạng thái':'Nháp — chưa gửi Approval','Người lập ID':actor,'Thời gian lập':new Date().toISOString(),'Bảng tính nguồn':params.sheetUrl,'Người duyệt đề xuất JSON':JSON.stringify(params.approvers),'Bản tiền JSON':JSON.stringify({version:1,brand,lines}),'Tổng tiền trình':total,'Số dòng':lines.length}]);
 const status=result.status;return {status,recordIds:'appliedIds' in result?result.appliedIds||[]:[],message:status==='success'?'Đã lưu bản trình nháp. Chưa gửi Approval và chưa ghi số tiền duyệt.':'Kết quả lưu: '+status+'. Tải lại hồ sơ để đối soát trước khi gửi lại.'};
}});
