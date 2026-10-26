// Read-only schema/membership inspection. No secrets or employee names are printed.
const {spawnSync}=require('node:child_process');
const cli='C:/Users/Win10/AppData/Roaming/npm/node_modules/@larksuite/cli/bin/lark-cli.exe';
const route='/open-apis/bitable/v1/apps/LycrwdzfEiva8WkbYDIl5OesgSe/tables/tblt1HdJr2zKk2ZD';
const profile=process.argv[2]||'lark-test';
function read(endpoint,params){const args=['api','GET',route+endpoint,'--profile',profile,'--as','user'];if(params)args.push('--params',JSON.stringify(params));const result=spawnSync(cli,args,{encoding:'utf8',timeout:60000,maxBuffer:4*1024*1024});if(result.status!==0)throw Error(result.stderr||result.stdout);const body=JSON.parse(result.stdout);if(!body.ok)throw Error(JSON.stringify(body.error));return body.data;}
const fields=[];let fieldPage;
do{const response=read('/fields',{page_size:100,...(fieldPage?{page_token:fieldPage}:{})});fields.push(...response.items);fieldPage=response.has_more?response.page_token:undefined;}while(fieldPage);
const people=fields.filter(f=>f.type===11);
const wanted=['Tên Brand','ID Brand','Mã nhãn hàng','Brand','Dừng ngân sách','Hệ thống sử dụng',...people.map(f=>f.field_name)];
const records=[];let recordPage;
do{const response=read('/records',{page_size:500,field_names:JSON.stringify(wanted),...(recordPage?{page_token:recordPage}:{})});records.push(...response.items);recordPage=response.has_more?response.page_token:undefined;}while(recordPage);
const currentUser=process.argv[3]||'ou_2012795614dd7acb49e34838cffa6e6f';
const readable=value=>typeof value==='string'?value:Array.isArray(value)?value.map(v=>v.text||v.name||'').join(''):'';
console.log(JSON.stringify({
 tableId:'tblt1HdJr2zKk2ZD',fieldCount:fields.length,recordCount:records.length,
 summary:{stopped:records.filter(r=>r.fields['Dừng ngân sách']===true).length,withoutAnyMembers:records.filter(r=>!people.some(f=>r.fields[f.field_name]?.length)).length,budgetSystemBrands:records.filter(r=>Array.isArray(r.fields['Hệ thống sử dụng'])&&r.fields['Hệ thống sử dụng'].includes('Ngân sách MKT')).length},
 fields:fields.map(f=>({name:f.field_name,type:f.type,synced:f.is_synced,multiple:f.property?.multiple})),
 membershipCoverage:people.map(f=>({role:f.field_name,brandsWithMembers:records.filter(r=>Array.isArray(r.fields[f.field_name])&&r.fields[f.field_name].length>0).length})),
 brands:records.map(r=>({name:readable(r.fields['Tên Brand']),brand:r.fields.Brand||null,brandCode:r.fields['Mã nhãn hàng']||null,stopped:r.fields['Dừng ngân sách']===true,systems:r.fields['Hệ thống sử dụng']||[],populatedRoles:people.filter(f=>r.fields[f.field_name]?.length).map(f=>f.field_name),currentUserRoles:people.filter(f=>Array.isArray(r.fields[f.field_name])&&r.fields[f.field_name].some(u=>u.id===currentUser)).map(f=>f.field_name)})),
},null,2));
