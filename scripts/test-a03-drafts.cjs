const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const ts=require('typescript'),root=path.resolve('a03-lark-app');
const url=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
const transpile=code=>ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
async function main(){
 const sdk=pathToFileURL(path.join(root,'node_modules/@lark-base-open/base-database-app-sdk/dist/server.js')).href,zod=pathToFileURL(path.join(root,'node_modules/zod/index.js')).href;
 const dir=path.join(root,'server/functions/save_draft');
 const contract=url(transpile(fs.readFileSync(path.join(dir,'contract.ts'),'utf8')).replace(/from ['"]zod['"]/g,`from '${zod}'`));
 const code=transpile(fs.readFileSync(path.join(dir,'index.ts'),'utf8')).replace(/from ['"]@lark-base-open\/base-database-app-sdk\/server['"]/g,`from '${sdk}'`).replace(/from ['"]\.\/contract\.js['"]/g,`from '${contract}'`);
 const {bindFunctionRuntime}=await import(sdk),handler=bindFunctionRuntime((await import(url(code))).default,{platformEnv:'online',brand:'lark'});
 const base={title:'Test draft',sheetUrl:'',approvers:[],lines:[{id:'recOne',amount:200}]};
 function runtime({brand='Brand',actor='trusted',unknown=false,missing=false}={}){const writes=[];return {writes,ctx:{invokeFunction:async()=>({code:0,data:{rows:missing?[]:[{id:'recOne',operator_id:actor,brand,code:'NS01',year:'2026',quarter:'Q4',month:'10',amount:100}]}}),fetch:async(_url,opts)=>{writes.push(JSON.parse(opts.body));if(unknown)throw Error('timeout');return new Response(JSON.stringify({code:0,data:{record_id_list:['recDraft']}}),{headers:{'content-type':'application/json'}});}}};}
 let c=runtime(),r=await handler(base,c.ctx);assert.equal(r.code,0);assert.equal(r.data.status,'success');const saved=c.writes[0].create_records[0];assert.equal(saved['Người lập ID'],'trusted');assert.equal(saved['Trạng thái'],'Nháp — chưa gửi Approval');assert.equal(JSON.parse(saved['Bản tiền JSON']).lines[0].amount,100);assert.equal(JSON.parse(saved['Bản tiền JSON']).lines[0].proposed_amount,200);assert.ok(!Object.hasOwn(saved,'Số tiền TGĐ duyệt'));
 for(const bad of [{...base,title:'  '},{...base,lines:[base.lines[0],base.lines[0]]},{...base,sheetUrl:'https://evil.test/sheets/abc'},{...base,lines:[{id:'recOne',amount:1.5}]},{...base,actor:'spoofed'}]){c=runtime();r=await handler(bad,c.ctx);assert.notEqual(r.code,0);assert.equal(c.writes.length,0);}
 for(const state of [{missing:true},{actor:''},{brand:''}]){c=runtime(state);r=await handler(base,c.ctx);assert.notEqual(r.code,0);assert.equal(c.writes.length,0);}
 c=runtime({unknown:true});r=await handler(base,c.ctx);assert.equal(r.data.status,'unknown');assert.equal(c.writes.length,1);
 console.log('PASS: 10 draft checks; verified actor, immutable baseline, no approved-money writes, validation and unknown outcomes. No live writes.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
