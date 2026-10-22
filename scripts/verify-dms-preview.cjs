const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const execute=promisify(execFile);
const root=path.resolve('dms-app');
const node22='C:/Users/Win10/AppData/Local/npm-cache/_npx/52027bd8fc0022aa/node_modules/node/node_modules/node-win-x64/bin/node.exe';
const cli='C:/Users/Win10/AppData/Local/npm-cache/_npx/2fa7f77791b5d55e/node_modules/@lark-base-open/base-database-cli/dist/cli.js';
const params=JSON.stringify({env:'preview',includeInternal:true});
const route='/open-apis/base/v3/sites/DENAp0kOirKIGijXz80lxDkggqx/functions/';
async function run(args){const {stdout}=await execute(node22,[cli,'lark-cli','--',...args,'--as','user'],{cwd:root,encoding:'utf8',timeout:60000,maxBuffer:1024*1024});const body=JSON.parse(stdout);if(!body.ok)throw Error(JSON.stringify(body.error));return body.data;}
async function read(id){const description=await run(['api','GET',route+id,'--params',params]);const fn=description.function;if(!fn?.requestExample||!fn.inputSchema)throw Error('Missing live function description for '+id);const example=typeof fn.requestExample==='string'?JSON.parse(fn.requestExample):fn.requestExample;const result=await run(['api','POST',route+id+'/invoke','--params',params,'--data',JSON.stringify({...example,params:{offset:0}})]);/* Native lark-cli api already checks the OpenAPI code and returns ResultJSON in data. */if(!Array.isArray(result.rows))throw Error('Invalid query result for '+id);return result.rows;}
async function main(){
 const ids=['list_partners','list_products','list_warehouses','list_orders','list_movements'];
 const settled=await Promise.allSettled(ids.map(read));
 for(let i=0;i<settled.length;i++){if(settled[i].status==='rejected')console.error(ids[i]+': '+String(settled[i].reason));}
 if(settled.some(r=>r.status==='rejected'))throw Error('Preview readback incomplete.');
 const [partners,products,warehouses,orders,movements]=settled.map(r=>r.value);
 assert.equal(partners.length,2);assert.equal(products.length,3);assert.equal(warehouses.length,2);assert.equal(orders.length,2);assert.equal(movements.length,7);
 const active=orders.filter(o=>!['Nháp','Đã hủy'].includes(o.status));
 assert.equal(active.reduce((s,o)=>s+o.total,0),900000);assert.equal(active.reduce((s,o)=>s+Math.max(0,o.total-o.paid),0),300000);
 const product=products.find(p=>p.sku==='VD-CAFE-500'),warehouse=warehouses.find(w=>w.code==='VD-KHO-HCM');
 const stock=movements.filter(m=>m.product_id===product.id&&m.warehouse_id===warehouse.id).reduce((s,m)=>s+(m.type==='Nhập kho'?1:-1)*m.quantity,0);assert.equal(stock,95);
 for(const o of orders){assert.ok(partners.some(p=>p.id===o.partner_id));assert.ok(warehouses.some(w=>w.id===o.warehouse_id));const lines=JSON.parse(o.lines);for(const line of lines)assert.ok(products.some(p=>p.id===line.productId));assert.equal(lines.reduce((s,l)=>s+l.quantity*l.price,0),o.total);}
 let lowStock=0;for(const w of warehouses)for(const p of products){const qty=movements.filter(m=>m.product_id===p.id&&m.warehouse_id===w.id).reduce((s,m)=>s+(m.type==='Nhập kho'?1:-1)*m.quantity,0);if(qty<p.minimum)lowStock++;}assert.equal(lowStock,1);
 const evidence={verifiedAt:new Date().toISOString(),environment:'preview',counts:{partners:partners.length,products:products.length,warehouses:warehouses.length,orders:orders.length,movements:movements.length},confirmedOrderValue:900000,receivables:300000,coffeeHcmStock:stock,lowStockPositions:lowStock,source:'Published Database Functions used by Page; no browser/UI interaction checks performed'};
 fs.writeFileSync(path.join(root,'.base-database-cli/state/sample-readback.json'),JSON.stringify(evidence,null,2));
 console.log(JSON.stringify({ok:true,...evidence},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1});
