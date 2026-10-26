export type Line={id:string;source_id?:string;brand:string;code:string;year:string;quarter:string;month:string;amount:number|null;proposed_amount:number};
export type Node={label:string;userId:string;name:string;status:'waiting'|'active'|'approved'|'rejected';at?:string;comment?:string};
export type Audit={at:string;actor:string;action:string;comment:string;hash:string};
export function money(value:unknown):number{
 if(typeof value==='number'&&Number.isSafeInteger(value)&&Math.abs(value)<=1e13)return value;
 if(typeof value==='string'&&/^-?\d+$/.test(value.trim()))return money(Number(value));
 throw Error('Số tiền trong Sheet phải là số nguyên VND, không để trống và không chứa lỗi công thức.');
}
export function nodesForSubmit(nodes:Pick<Node,'label'|'userId'|'name'>[],actor:string):Node[]{
 if(!nodes.length||nodes.length>5||nodes.some(n=>!n.label.trim()||!n.name.trim()||!n.userId||n.userId===actor))throw Error('Chọn từ 1 đến 5 node; người lập không được tự duyệt.');
 return nodes.map((node,index)=>({...node,label:node.label.trim(),status:index===0?'active':'waiting'}));
}
export function applyDecision(nodes:Node[],actor:string,decision:'approve'|'reject',comment:string,now:string):Node[]{
 const current=nodes.findIndex(n=>n.status==='active');
 if(current<0||nodes[current].userId!==actor||nodes.slice(0,current).some(n=>n.status!=='approved'))throw Error('Chỉ người đang được phân công tại node hiện tại mới được xử lý.');
 if(decision==='reject'&&!comment.trim())throw Error('Cần ghi lý do từ chối.');
 const next=nodes.map(n=>({...n}));next[current]={...next[current],status:decision==='approve'?'approved':'rejected',comment:comment.trim(),at:now};
 if(decision==='approve'&&current+1<next.length)next[current+1].status='active';return next;
}
export function captureSheet(values:unknown[][],lines:Line[]):Line[]{
 const header=values[0]?.map(v=>String(v??'').trim()),idIndex=header?.indexOf('record_id')??-1,moneyIndex=header?.indexOf('so_tien_de_xuat')??-1;
 if(idIndex<0||moneyIndex<0||header.filter(h=>h==='record_id').length!==1||header.filter(h=>h==='so_tien_de_xuat').length!==1)throw Error('Sheet cần đúng một cột record_id và so_tien_de_xuat.');
 const matches=new Map<string,number>();const wanted=new Set(lines.map(l=>l.id));
 for(const row of values.slice(1)){const id=String(row[idIndex]??'').trim();if(!wanted.has(id))continue;if(matches.has(id))throw Error('Sheet có ID trùng trong các dòng được chọn.');matches.set(id,money(row[moneyIndex]));}
 if(matches.size!==wanted.size)throw Error('Sheet thiếu dòng A03 đang được chọn.');
 return lines.map(l=>({...l,proposed_amount:matches.get(l.id)!}));
}
export function assertBaseline(line:Line,row:Record<string,unknown>){for(const key of ['id','brand','code','year','quarter','month'] as const)if((row[key]??'')!==(line[key]??''))throw Error('Nhận diện A03 đã thay đổi; cần lập lại hồ sơ.');if((row.amount??null)!==line.amount)throw Error('Tiền A03 đã thay đổi sau khi lập hồ sơ; dừng để đối soát.');}
export async function digest(value:unknown){const data=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));return Array.from(new Uint8Array(data),v=>v.toString(16).padStart(2,'0')).join('');}
