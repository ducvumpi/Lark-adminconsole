const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFile}=require('node:child_process'),{promisify}=require('node:util');
const execute=promisify(execFile),exe='C:/Users/Win10/AppData/Roaming/npm/node_modules/@larksuite/cli/bin/lark-cli.exe';
const root=path.resolve('a03-lark-app'),config=JSON.parse(fs.readFileSync(path.join(root,'base-database.jsonc'))),catalog=JSON.parse(fs.readFileSync(path.join(root,'catalog.json')));
const snapshot=JSON.parse(fs.readFileSync('data/a03-migration/snapshot.json')),state=JSON.parse(fs.readFileSync('data/a03-migration/copy-state.json'));
const sourceRows=new Map(snapshot.rows.map(r=>[r.sourceId,r])),target=catalog.tables.find(t=>t.id===state.target.table),route=`/open-apis/base/v3/sites/${config.appToken}/functions/`,params=JSON.stringify({env:'preview',includeInternal:true});
async function run(args){const {stdout}=await execute(exe,['--profile','lark-test',...args,'--as','user'],{encoding:'utf8',timeout:60000,maxBuffer:30*1024*1024});const b=JSON.parse(stdout);if(!b.ok)throw Error(JSON.stringify(b.error));return b.data;}
async function invoke(id,values){const description=await run(['api','GET',route+id,'--params',params,'--json']);const fn=description.function;assert.ok(fn?.inputSchema&&fn.requestExample,'Missing live Function contract');const example=typeof fn.requestExample==='string'?JSON.parse(fn.requestExample):fn.requestExample;return run(['api','POST',route+id+'/invoke','--params',params,'--data',JSON.stringify({...example,params:values}),'--json']);}
function display(v){if(v==null)return '';if(Array.isArray(v))return v.map(display).join(', ');if(typeof v==='object')return display(v.name??v.text??v.value??JSON.stringify(v));return String(v);}
async function main(){
 assert.equal(state.status,'copied');assert.equal(state.completed.length,snapshot.rows.length);
 let offset=0,rev;const seen=new Set();let fieldsChecked=0;
 for(;;){const page=await run(['base','+record-list','--base-token',target.baseToken,'--table-id',target.id,'--offset',String(offset),'--limit','200','--json']);if(rev!==undefined)assert.equal(page.rev,rev,'Destination changed during verification');rev=page.rev;
 for(let i=0;i<page.data.length;i++){const r=Object.fromEntries(page.fields.map((f,j)=>[f,page.data[i][j]])),id=display(r['ID bản ghi nguồn']);assert.ok(!seen.has(id),'Duplicate source ID');seen.add(id);const original=sourceRows.get(id);assert.ok(original,'Unexpected source ID');assert.deepEqual(JSON.parse(display(r['Dữ liệu nguồn JSON'])),original.fields,'Raw source snapshot mismatch');for(const f of JSON.parse(fs.readFileSync('data/a03-migration/schema.json')).tables[0].fields.slice(0,42)){if(f.type==='number')assert.equal(r[f.name]??null,original.fields[f.name]??null,'Money/number mismatch');else assert.equal(display(r[f.name]),display(original.fields[f.name]),'Normalized field mismatch: '+f.name);fieldsChecked++;}}
 if(!page.has_more)break;offset=page.next_offset??offset+page.data.length;}
 assert.equal(seen.size,snapshot.rows.length);
 const filters={brand:'',year:'',quarter:'',month:'',keyword:''};
 const total=await invoke('summary_a03',filters);assert.ok(Array.isArray(total.rows));assert.equal(total.rows[0].count,snapshot.rows.length);const expected=snapshot.rows.reduce((s,r)=>s+(r.fields['Số tiền TGĐ duyệt']??0),0);assert.equal(total.rows[0].amount,expected);
 const first=await invoke('list_a03',{...filters,offset:0}),last=await invoke('list_a03',{...filters,offset:4000});assert.equal(first.rows.length,50);assert.equal(last.rows.length,40);
 for(const row of [...first.rows,...last.rows])assert.equal(row.amount??null,sourceRows.get(row.source_id).fields['Số tiền TGĐ duyệt']??null);
 const detail=await invoke('detail_a03',{id:first.rows[0].id});assert.deepEqual(JSON.parse(detail.rows[0].source_json),sourceRows.get(detail.rows[0].source_id).fields);
 const brand=first.rows[0].brand;if(brand){const filtered=await invoke('list_a03',{...filters,brand,offset:0});assert.ok(filtered.rows.length);assert.ok(filtered.rows.every(r=>r.brand===brand));}
 const drafts=await invoke('list_drafts',{});assert.ok(Array.isArray(drafts.rows));
 const evidence={verifiedAt:new Date().toISOString(),environment:'preview',sourceRows:snapshot.rows.length,copiedRows:seen.size,normalizedCellsChecked:fieldsChecked,sourceJsonMatches:true,allAmountsMatch:true,summaryMatches:true,firstAndLastPages:true,detailReadback:true,brandFilter:true,draftRead:true,liveFinancialWrites:false,browserUI:'not tested'};
 fs.writeFileSync(path.join(root,'.base-database-cli/state/migration-readback.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({ok:true,...evidence},null,2));
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
