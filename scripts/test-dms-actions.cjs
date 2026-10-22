const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {pathToFileURL} = require('node:url');
const root=path.resolve('dms-app');
const ts=require('typescript');
const sdk=pathToFileURL(path.join(root,'node_modules/@lark-base-open/base-database-app-sdk/dist/server.js')).href;
const zod=pathToFileURL(path.join(root,'node_modules/zod/index.js')).href;
const dataUrl=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
const transpile=code=>ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
async function load(id){
 const dir=path.join(root,'server/functions',id);
 const contract=dataUrl(transpile(fs.readFileSync(path.join(dir,'contract.ts'),'utf8')).replace(/from ["']zod["']/g,`from '${zod}'`));
 const code=transpile(fs.readFileSync(path.join(dir,'index.ts'),'utf8')).replace(/from ["']zod["']/g,`from '${zod}'`).replace(/from ["']@lark-base-open\/base-database-app-sdk\/server["']/g,`from '${sdk}'`).replace(/from ["']\.\/contract\.js["']/g,`from '${contract}'`);
 const handler=(await import(dataUrl(code))).default;
 const {bindFunctionRuntime}=await import(sdk);
 return bindFunctionRuntime(handler,{platformEnv:'online',brand:'lark'});
}
function context({price=180000,partnerStatus='Hoạt động',orderStatus='Nháp',dealerType='Đại lý',unknown=false}={}){
 const writes=[];
 return {writes,ctx:{
  invokeFunction:async ({functionId})=>({code:0,msg:'success',data:{rows:functionId==='order_products'?[{id:'recProduct',name:'Cà phê',sku:'CAFE',price,status:'Đang bán'}]:functionId==='order_partner'?[{id:'recPartner',status:partnerStatus}]:functionId==='visit_partner'?[{id:'recPartner',type:dealerType,status:partnerStatus,operator_id:'user-1'}]:functionId==='order_warehouse'?[{id:'recWarehouse'}]:[{id:'recOrder',status:orderStatus,total:900000,paid:0}]}}),
  fetch:async (_url,options)=>{writes.push(JSON.parse(options.body));if(unknown)throw Error('Simulated connection interruption');return new Response(JSON.stringify({code:0,msg:'',data:{record_id_list:['recCreated']}}),{headers:{'content-type':'application/json'}})},
 }};
}
async function main(){
 const create=await load('create_order'),update=await load('update_order'),move=await load('create_movement'),product=await load('save_products'),visit=await load('create_visit');
 const base={partnerId:'recPartner',warehouseId:'recWarehouse',date:'2026-10-22',notes:'',lines:[{productId:'recProduct',quantity:5}]};
 let c=context();let r=await create(base,c.ctx);assert.equal(r.code,0);assert.equal(r.data.status,'success');assert.equal(c.writes[0].create_records[0]['Tổng tiền'],900000);assert.equal(JSON.parse(c.writes[0].create_records[0]['Chi tiết JSON'])[0].price,180000);
 c=context({price:200000});r=await create(base,c.ctx);assert.equal(c.writes[0].create_records[0]['Tổng tiền'],1000000);
 c=context({partnerStatus:'Tạm ngưng'});r=await create(base,c.ctx);assert.equal(r.code,400);assert.equal(c.writes.length,0);
 c=context();r=await create({...base,lines:[...base.lines,...base.lines]},c.ctx);assert.equal(r.code,400);assert.equal(c.writes.length,0);
 c=context();r=await create({...base,date:'2026-02-30'},c.ctx);assert.equal(r.code,400);assert.equal(c.writes.length,0);
 c=context();r=await create({...base,lines:[{productId:'recProduct',quantity:-1}]},c.ctx);assert.equal(r.code,400);assert.equal(c.writes.length,0);
 c=context({orderStatus:'Nháp'});r=await update({id:'recOrder',status:'Hoàn tất',paid:0},c.ctx);assert.equal(r.code,400);assert.equal(c.writes.length,0);
 c=context();r=await update({id:'recOrder',status:'Đã xác nhận',paid:900001},c.ctx);assert.equal(r.code,400);assert.equal(c.writes.length,0);
 c=context();r=await move({productId:'recProduct',warehouseId:'recWarehouse',type:'Nhập kho',quantity:0,date:'2026-10-22',reference:'',notes:''},c.ctx);assert.equal(r.code,400);assert.equal(c.writes.length,0);
 c=context();r=await product({name:'   ',sku:'SKU',unit:'Hộp',category:'',price:10,minimum:0,status:'Đang bán'},c.ctx);assert.equal(r.code,400);assert.equal(c.writes.length,0);
 c=context({unknown:true});r=await create(base,c.ctx);assert.equal(r.code,0);assert.equal(r.data.status,'unknown');assert.equal(c.writes.length,1);
 const visitInput={partnerId:'recPartner',latitude:10.762622,longitude:106.660172,accuracy:7.4,notes:'Ghé kiểm tra điểm bán'};
 c=context();r=await visit(visitInput,c.ctx);assert.equal(r.code,0);assert.equal(r.data.status,'success');assert.equal(c.writes[0].create_records[0]['Đại lý ID'],'recPartner');assert.equal(c.writes[0].create_records[0]['Nhân viên ID'],'user-1');assert.equal(c.writes[0].create_records[0]['Vĩ độ'],String(visitInput.latitude));
 c=context({dealerType:'Nhà phân phối'});r=await visit(visitInput,c.ctx);assert.equal(r.code,400);assert.equal(c.writes.length,0);
 c=context();r=await visit({...visitInput,latitude:91},c.ctx);assert.equal(r.code,400);assert.equal(c.writes.length,0);
 c=context({unknown:true});r=await visit(visitInput,c.ctx);assert.equal(r.code,0);assert.equal(r.data.status,'unknown');assert.equal(c.writes.length,1);
 console.log('PASS: 15 checks — order pricing and validation, stock and payment validation, GPS visit validation and audit identity, invalid coordinates, and unknown write outcomes. All calls used a local mock runtime; no remote records were written.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
