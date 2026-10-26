const fs=require('node:fs');
const file='a03-lark-app/page/src/BudgetApp.tsx';
let source=fs.readFileSync(file,'utf8');
function replace(before,after){if(!source.includes(before))throw Error('Expected UI anchor missing: '+before.slice(0,70));source=source.replace(before,after);}
replace("import './budget.css';","import './budget.css';\nimport BudgetSheet, { A03_SHEET_URL } from './BudgetSheet';");
replace("useState<'ledger'|'drafts'|'about'>", "useState<'ledger'|'drafts'|'sheet'|'about'>");
replace("setTitle('');setSheet('');setApprovers('');", "setTitle('');setSheet(A03_SHEET_URL);setApprovers('');");
replace('<button className={tab===\'about\'?\'active\':\'\'} onClick={()=>setTab(\'about\')}>', '<button className={tab===\'sheet\'?\'active\':\'\'} onClick={()=>setTab(\'sheet\')}><Icon kind="grid"/>Bảng tính nhập tiền</button><button className={tab===\'about\'?\'active\':\'\'} onClick={()=>setTab(\'about\')}>');
replace("tab==='drafts'?'Hồ sơ của tôi':'Thông tin'", "tab==='drafts'?'Hồ sơ của tôi':tab==='sheet'?'Lark Sheets':'Thông tin'");
replace("tab==='drafts'?'Hồ sơ của tôi':'Nguồn dữ liệu & phạm vi'", "tab==='drafts'?'Hồ sơ của tôi':tab==='sheet'?'Bảng tính nhập tiền':'Nguồn dữ liệu & phạm vi'");
replace("tab==='drafts'?'Bản tiền đã chốt và lưu riêng cho tài khoản của bạn.':'Bản sao độc lập trên Lark Base AI-Friendly Database.'", "tab==='drafts'?'Bản tiền đã chốt và lưu riêng cho tài khoản của bạn.':tab==='sheet'?'Điền số tiền dự kiến trực tiếp trên tài liệu Lark Sheets.':'Bản sao độc lập trên Lark Base AI-Friendly Database.'");
replace('</>:<section className="about">','</>:tab===\'sheet\'?<BudgetSheet/>:<section className="about">');
fs.writeFileSync(file,source);
console.log('Connected real A03 Lark Sheets to sidebar and draft form.');
