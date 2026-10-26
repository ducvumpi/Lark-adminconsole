const fs=require('node:fs'),{spawnSync}=require('node:child_process');
const dir='data/a03-migration',receipt=dir+'/sheet-create.json';
if(fs.existsSync(receipt)){
 const previous=JSON.parse(fs.readFileSync(receipt,'utf8'));
 if(!process.argv.includes('--retry-after-authorization')||previous.response?.error?.subtype!=='missing_scope')throw Error('Sheet creation receipt exists. Inspect it before any retry.');
 fs.copyFileSync(receipt,dir+'/sheet-create-missing-scope-'+Date.now()+'.json');
}
const snapshot=JSON.parse(fs.readFileSync(dir+'/snapshot.json')),mapping=JSON.parse(fs.readFileSync(dir+'/copy-state.json'));
const ids=new Map(mapping.completed.map(r=>[r.sourceId,r.targetId]));
function text(v){if(v==null)return '';if(Array.isArray(v))return v.map(text).join(', ');if(typeof v==='object')return text(v.name??v.text??v.value??JSON.stringify(v));return String(v);}
const columns=['record_id','source_record_id','brand','ma_ngan_sach','nam','quy','thang','so_tien_hien_tai','so_tien_de_xuat'];
const data=snapshot.rows.map(r=>[ids.get(r.sourceId),r.sourceId,text(r.fields.Brand),text(r.fields['Mã ngân sách']),text(r.fields['Năm']),text(r.fields['Quý ngân sách']),text(r.fields['Tháng ngân sách']),r.fields['Số tiền TGĐ duyệt']??null,null]);
if(data.some(r=>!r[0]))throw Error('Missing target ID.');
const file=dir+'/sheet-input.json';fs.writeFileSync(file,JSON.stringify({sheets:[{name:'A03_TGD_duyet',columns,data,dtypes:Object.fromEntries(columns.map(c=>[c,c.startsWith('so_tien')?'float64':'object'])),formats:{so_tien_hien_tai:'#,##0',so_tien_de_xuat:'#,##0'}}]}));
fs.writeFileSync(receipt,JSON.stringify({status:'sending',at:new Date().toISOString(),rows:data.length}));
const r=spawnSync('C:/Users/Win10/AppData/Roaming/npm/node_modules/@larksuite/cli/bin/lark-cli.exe',['--profile','lark-test','sheets','+workbook-create','--title','A03 - Bảng nhập tiền trình duyệt','--sheets','@'+file,'--as','user','--json'],{encoding:'utf8',timeout:180000,maxBuffer:4000000});
let response;try{response=JSON.parse(r.stdout||r.stderr);}catch{response={message:(r.stderr||r.stdout||r.error?.message||'Unknown result').slice(0,3000)};}
fs.writeFileSync(receipt,JSON.stringify({status:r.status===0&&response.ok?'created':'unconfirmed',at:new Date().toISOString(),rows:data.length,response},null,2));
console.log(JSON.stringify(response,null,2));if(r.status!==0)process.exitCode=1;
