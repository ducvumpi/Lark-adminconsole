const fs=require('node:fs'),{execFileSync}=require('node:child_process');
const exe='C:/Users/Win10/AppData/Roaming/npm/node_modules/@larksuite/cli/bin/lark-cli.exe';
const route='/open-apis/base/v3/sites/DpYlpukK7rwhddjOPfClC8Jcgae/functions/',query=JSON.stringify({env:'preview',includeInternal:true});
function run(args){const result=JSON.parse(execFileSync(exe,['--profile','lark-test',...args,'--as','user'],{encoding:'utf8',timeout:60000,maxBuffer:5000000}));if(!result.ok)throw Error(JSON.stringify(result.error));return result.data;}
function invoke(id,params){const {function:fn}=run(['api','GET',route+id,'--params',query,'--json']);if(!fn?.requestExample||!fn.inputSchema)throw Error('Missing live contract');const body=typeof fn.requestExample==='string'?JSON.parse(fn.requestExample):fn.requestExample;return run(['api','POST',route+id+'/invoke','--params',query,'--data',JSON.stringify({...body,params}),'--json']);}
const evidence={at:new Date().toISOString(),financialWrites:false};
try{
 const summary=invoke('summary_a03',{brand:'',year:'',quarter:'',month:'',keyword:''});evidence.ledgerRows=summary.rows?.[0]?.count;
 const drafts=invoke('list_drafts',{});if(!Array.isArray(drafts.rows))throw Error('Invalid draft response');evidence.visibleRequests=drafts.rows.length;
 const draft=drafts.rows.find(r=>r.status==='Nháp — chưa gửi Approval'&&String(r.creator)===String(r.actor_id));
 if(draft){try{const result=invoke('budget_flow',{action:'preview_sheet',id:draft.id,version:draft.version||'',comment:'',sheetHash:'',nodes:[]});evidence.sheetPreviewStatus=result.status;evidence.sheetPreviewLines=result.sheetLines?.length;}catch(e){evidence.sheetPreviewError=e.message;}}
 else evidence.sheetRuntime='Not tested: no existing accessible creator draft; no test records created';
 fs.writeFileSync('data/a03-migration/flow-preview-readback.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
}catch(e){console.error(e.message);process.exitCode=1;}
