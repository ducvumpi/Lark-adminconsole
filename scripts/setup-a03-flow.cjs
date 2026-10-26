const fs=require('fs'),{execFileSync}=require('child_process');
const exe='C:/Users/Win10/AppData/Roaming/npm/node_modules/@larksuite/cli/bin/lark-cli.exe',base='Tc4qbZqpJaBWKXsQ03VlaVgzgwr',table='tblesB2lbyj7iN9e';
function run(args){const r=JSON.parse(execFileSync(exe,['--profile','lark-test',...args,'--as','user','--format','json'],{encoding:'utf8',timeout:60000,maxBuffer:2000000}));if(!r.ok)throw Error(JSON.stringify(r.error));return r.data;}
const fields=run(['base','+field-list','--base-token',base,'--table-id',table]).fields;
const wanted=[...Array.from({length:5},(_,i)=>({name:'Người duyệt '+(i+1),type:'user',multiple:false})),...['Luồng duyệt JSON','Lịch sử duyệt JSON','Kết quả đồng bộ JSON','Bản chốt SHA256','Phiên xử lý'].map(name=>({name,type:'text'}))];
const missing=wanted.filter(f=>!fields.some(old=>old.name===f.name));
if(missing.length){const file='data/a03-migration/flow-fields.json';fs.writeFileSync(file,JSON.stringify(missing));const result=run(['base','+field-create','--base-token',base,'--table-id',table,'--json','@'+file]);fs.writeFileSync('data/a03-migration/flow-schema-receipt.json',JSON.stringify(result,null,2));console.log(JSON.stringify({created:missing.map(f=>f.name)}));}else console.log('Workflow fields already exist.');
