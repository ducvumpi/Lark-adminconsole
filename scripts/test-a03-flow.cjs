const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url'),ts=require('typescript');
const root=path.resolve('a03-lark-app'),dir=path.join(root,'server/functions/budget_flow');
const url=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
const trans=code=>ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const clone=x=>JSON.parse(JSON.stringify(x));
async function main(){
 const sdk=pathToFileURL(path.join(root,'node_modules/@lark-base-open/base-database-app-sdk/dist/server.js')).href,zod=pathToFileURL(path.join(root,'node_modules/zod/index.js')).href;
 const engineUrl=url(trans(fs.readFileSync(path.join(dir,'engine.ts'),'utf8'))),engine=await import(engineUrl);
 const contractUrl=url(trans(fs.readFileSync(path.join(dir,'contract.ts'),'utf8')).replace(/from ['"]zod['"]/g,`from '${zod}'`));
 const source=trans(fs.readFileSync(path.join(dir,'index.ts'),'utf8')).replace(/from ['"]@lark-base-open\/base-database-app-sdk\/server['"]/g,`from '${sdk}'`).replace(/from ['"]\.\/contract\.js['"]/g,`from '${contractUrl}'`).replace(/from ['"]\.\/engine\.js['"]/g,`from '${engineUrl}'`);
 const {bindFunctionRuntime}=await import(sdk),handler=bindFunctionRuntime((await import(url(source))).default,{platformEnv:'online',brand:'lark'});
 let tests=0;function check(f){f();tests++;}
 for(const amount of ['',null,'1,000','12.5',NaN,1e14])check(()=>assert.throws(()=>engine.money(amount)));
 check(()=>assert.equal(engine.money(-100),-100));
 const baseline={id:'recLine',brand:'B',code:'NS01',year:'2026',quarter:'Q4',month:'10',amount:100,proposed_amount:150};
 check(()=>assert.throws(()=>engine.captureSheet([['record_id','so_tien_de_xuat'],['recLine',200],['recLine',200]],[baseline])));
 check(()=>assert.throws(()=>engine.captureSheet([['record_id','so_tien_de_xuat'],['recOther',200]],[baseline])));
 check(()=>assert.throws(()=>engine.nodesForSubmit([{label:'Boss',name:'Creator',userId:'creator'}],'creator')));
 const seq=engine.nodesForSubmit([{label:'Head',name:'One',userId:'user1'},{label:'Boss',name:'Two',userId:'user2'}],'creator');
 check(()=>assert.throws(()=>engine.applyDecision(seq,'user2','approve','',new Date().toISOString())));
 let actor,request,moneyWrites,unknownMoney,baselineChange;
 function reset(){actor='creator';moneyWrites=0;unknownMoney=false;baselineChange=false;request={id:'recRequest',creator:'creator',status:'Nháp — chưa gửi Approval',version:'',code:'NS-TEST',sheet_url:'https://tsgsifizy3jj.sg.larksuite.com/sheets/GHglsL11ihh6kTt1vn6l0jF6gge',snapshot:JSON.stringify({version:1,brand:'B',lines:[baseline]}),nodes:'',audit:'',hash:''};}
 const fields={'Trạng thái':'status','Phiên xử lý':'version','Bản tiền JSON':'snapshot','Bản chốt SHA256':'hash','Luồng duyệt JSON':'nodes','Lịch sử duyệt JSON':'audit','Kết quả đồng bộ JSON':'sync_results'};
 const ctx={invokeFunction:async({functionId})=>({code:0,data:{rows:functionId==='workflow_context'?[{...clone(request),actor_id:actor}]:[{...baseline,amount:baselineChange?101:100,operator_id:actor}]}}),fetch:async(u,opts)=>{
  if(u.includes('/auth/v3/'))return Response.json({code:0,tenant_access_token:'test-runtime-only'});
  if(u.includes('/sheets/v2/'))return Response.json({code:0,data:{valueRange:{values:[['record_id','so_tien_de_xuat'],['recLine',200]]}}});
  const p=JSON.parse(opts.body);if(u.includes('/tbljA87qUBDYVHYe/')){moneyWrites++;assert.equal(p.update_records.recLine['Số tiền TGĐ duyệt'],200);if(unknownMoney)throw Error('Simulated timeout');return Response.json({code:0,data:{record_id_list:['recLine'],record_not_found:[]}});}
  for(const [name,v]of Object.entries(p.update_records.recRequest))if(fields[name])request[fields[name]]=v;
  return Response.json({code:0,data:{record_id_list:['recRequest'],record_not_found:[]}});
 }};
 const call=(action,extra={})=>handler({action,id:'recRequest',version:request.version,comment:'',sheetHash:'',nodes:[],...extra},ctx);
 const oldId=process.env.A03_LARK_APP_ID,oldSecret=process.env.A03_LARK_APP_SECRET;
 try{
 reset();delete process.env.A03_LARK_APP_ID;delete process.env.A03_LARK_APP_SECRET;let r=await call('preview_sheet');assert.notEqual(r.code,0);assert.equal(moneyWrites,0);tests++;
 process.env.A03_LARK_APP_ID='unit-test-only';process.env.A03_LARK_APP_SECRET='unit-test-only';
 reset();r=await call('preview_sheet');assert.equal(r.code,0);assert.equal(r.data.sheetLines[0].proposed,200);assert.equal(moneyWrites,0);tests++;
 r=await call('submit',{nodes:seq.map(({label,userId,name})=>({label,userId,name})),sheetHash:'wrong'});assert.notEqual(r.code,0);assert.equal(request.status,'Nháp — chưa gửi Approval');tests++;
 const preview=await call('preview_sheet');r=await call('submit',{nodes:seq.map(({label,userId,name})=>({label,userId,name})),sheetHash:preview.data.sheetHash});assert.equal(r.code,0);assert.equal(request.status,'Đang duyệt');assert.equal(JSON.parse(request.snapshot).lines[0].proposed_amount,200);assert.equal(moneyWrites,0);tests++;
 actor='user2';r=await call('approve');assert.notEqual(r.code,0);assert.equal(moneyWrites,0);tests++;
 actor='user1';r=await call('approve');assert.equal(r.code,0);assert.equal(JSON.parse(request.nodes)[1].status,'active');assert.equal(moneyWrites,0);tests++;
 actor='user2';const beforeFinal=clone(request);r=await call('approve');assert.equal(r.code,0);assert.equal(request.status,'Đã ghi A03');assert.equal(moneyWrites,1);tests++;
 r=await call('approve');assert.notEqual(r.code,0);assert.equal(moneyWrites,1);tests++;
 request=clone(beforeFinal);moneyWrites=0;baselineChange=true;r=await call('approve');assert.notEqual(r.code,0);assert.equal(moneyWrites,0);tests++;
 request=clone(beforeFinal);baselineChange=false;unknownMoney=true;r=await call('approve');assert.equal(r.code,0);assert.equal(r.data.status,'partial');assert.equal(request.status,'Cần đối soát');assert.equal(moneyWrites,1);r=await call('approve');assert.notEqual(r.code,0);assert.equal(moneyWrites,1);tests++;
 request=clone(beforeFinal);unknownMoney=false;moneyWrites=0;r=await call('reject',{comment:'Need correction'});assert.equal(r.code,0);assert.equal(request.status,'Đã từ chối');assert.equal(moneyWrites,0);tests++;
 request=clone(beforeFinal);request.snapshot=request.snapshot.replace('200','201');r=await call('approve');assert.notEqual(r.code,0);assert.equal(moneyWrites,0);tests++;
 request=clone(beforeFinal);r=await call('approve',{version:'stale'});assert.notEqual(r.code,0);assert.equal(moneyWrites,0);tests++;
 }finally{if(oldId===undefined)delete process.env.A03_LARK_APP_ID;else process.env.A03_LARK_APP_ID=oldId;if(oldSecret===undefined)delete process.env.A03_LARK_APP_SECRET;else process.env.A03_LARK_APP_SECRET=oldSecret;}
 console.log(`PASS: ${tests} workflow checks; all network/record writes mocked. No real approvals or money writes.`);
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
