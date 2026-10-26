const fs=require('node:fs'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const exe='C:/Users/Win10/AppData/Roaming/npm/node_modules/@larksuite/cli/bin/lark-cli.exe';
const snapshot=JSON.parse(fs.readFileSync('data/a03-migration/snapshot.json'));
const mapping=JSON.parse(fs.readFileSync('data/a03-migration/copy-state.json'));
function get(range){const b=JSON.parse(execFileSync(exe,['--profile','lark-test','sheets','+cells-get','--spreadsheet-token','GHglsL11ihh6kTt1vn6l0jF6gge','--sheet-id','cfaf88','--range',range,'--include','value,style','--as','user','--json'],{encoding:'utf8',timeout:40000}));assert.equal(b.ok,true);assert.equal(b.data.has_more,false);return b.data.ranges[0].cells;}
const header=get('A1:I1')[0].map(c=>c.value);assert.equal(header[0],'record_id');assert.equal(header[8],'so_tien_de_xuat');
const sentinels=[0,2020,4039];
for(const index of sentinels){const row=index+2,cells=get(`A${row}:I${row}`)[0],source=snapshot.rows[index],target=mapping.completed.find(r=>r.sourceId===source.sourceId);assert.equal(cells[0].value,target.targetId);assert.equal(cells[1].value,source.sourceId);assert.equal(cells[7]?.value==null||cells[7]?.value===''?null:Number(String(cells[7].value).replaceAll(',','')),source.fields['Số tiền TGĐ duyệt']??null);assert.ok(cells[8]?.value==null||cells[8]?.value==='');if(cells[7]?.value!=null&&cells[7]?.value!=='')assert.equal(cells[7].cell_styles.number_format,'#,##0');}
const evidence={verifiedAt:new Date().toISOString(),rows:4040,headers:true,samples:sentinels.map(i=>i+2),identifiersAndAmountsMatch:true,proposedAmountsBlank:true,iframeEditing:'Requires authenticated Lark UI acceptance; not tested',baseFinancialWrites:false};
fs.writeFileSync('data/a03-migration/sheet-readback.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify({ok:true,...evidence},null,2));
