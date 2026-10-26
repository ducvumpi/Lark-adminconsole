const fs=require('node:fs');
const file='a03-lark-app/page/src/BudgetApp.tsx';let source=fs.readFileSync(file,'utf8');
const changes=[
 ["DatabaseUserMenu, invokeDatabaseFunction", "DatabaseUserMenu, invokeDatabaseFunction, openLink"],
 [" const close=()=>", " const openSheet=(url:string)=>{void openLink(url).catch(()=>setModalError('Lark chưa mở được bảng tính. Hãy mở mục Bảng tính nhập tiền và sao chép liên kết.'));};\n const close=()=>"],
 ['<a className="link external" target="_blank" rel="noopener noreferrer" href={sheetLink(sheet)}>Mở bảng tính ở cửa sổ riêng ↗</a>', '<button className="link external" onClick={()=>openSheet(sheetLink(sheet))}>Mở bảng tính ở cửa sổ riêng ↗</button>'],
 ['<a className="link external" target="_blank" rel="noopener noreferrer" href={sheetLink(text(detail.sheet_url))}>Mở bảng tính nguồn ↗</a>', '<button className="link external" onClick={()=>openSheet(sheetLink(text(detail.sheet_url)))}>Mở bảng tính nguồn ↗</button>']
];
for(const [before,after]of changes){if(!source.includes(before))throw Error('Expected UI anchor missing.');source=source.replace(before,after);}fs.writeFileSync(file,source);console.log('All spreadsheet links use the Lark host openLink API.');
