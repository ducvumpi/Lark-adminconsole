const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve('dms-app');
const node22='C:/Users/Win10/AppData/Local/npm-cache/_npx/52027bd8fc0022aa/node_modules/node/node_modules/node-win-x64/bin/node.exe';
const cli='C:/Users/Win10/AppData/Local/npm-cache/_npx/2fa7f77791b5d55e/node_modules/@lark-base-open/base-database-cli/dist/cli.js';
const catalog=JSON.parse(fs.readFileSync(path.join(root,'catalog.json'),'utf8'));
const stateFile=path.join(root,'.base-database-cli/state/sample-data.json');
if(fs.existsSync(stateFile))throw Error('Sample-data receipt exists. Reconcile through Preview functions before any further writes.');
const state={baseToken:catalog.tables[0].baseToken,groups:{},status:'started'};
function run(args){const r=spawnSync(node22,[cli,'lark-cli','--',...args,'--as','user'],{cwd:root,encoding:'utf8',timeout:60000});if(r.status!==0)throw Error(r.stderr||r.stdout||'CLI failed');const result=JSON.parse(r.stdout);if(!result.ok)throw Error(JSON.stringify(result.error));return result.data;}
function checkpoint(){fs.writeFileSync(stateFile,JSON.stringify(state,null,2));}
function insert(name,records){const table=catalog.tables.find(t=>t.name===name);run(['base','+field-list','--base-token',table.baseToken,'--table-id',table.id]);state.status='writing '+name;checkpoint();const data=run(['base','+record-batch-create','--base-token',table.baseToken,'--table-id',table.id,'--json',JSON.stringify({create_records:records})]);if(!Array.isArray(data.record_id_list)||data.record_id_list.length!==records.length||data.ignored_fields?.length)throw Error('Unexpected sample-data receipt; inspect remote rows before retry.');state.groups[name]=data.record_id_list;state.status='completed '+name;checkpoint();console.log(JSON.stringify({table:name,created:records.length}));return data.record_id_list;}
checkpoint();
const partners=insert('DMS - Đối tác',[
 {'Tên đối tác':'Ví dụ: NPP An Phát','Mã đối tác':'VD-NPP-001','Loại':['Nhà phân phối'],'Khu vực':'TP. Hồ Chí Minh','Điện thoại':'','Địa chỉ':'Dữ liệu minh họa','Trạng thái':['Hoạt động'],'Ghi chú':'Dữ liệu ví dụ để trải nghiệm DMS.'},
 {'Tên đối tác':'Ví dụ: Đại lý Minh Anh','Mã đối tác':'VD-DL-001','Loại':['Đại lý'],'Khu vực':'Đà Nẵng','Điện thoại':'','Địa chỉ':'Dữ liệu minh họa','Trạng thái':['Hoạt động'],'Ghi chú':'Dữ liệu ví dụ để trải nghiệm DMS.'},
]);
const products=insert('DMS - Sản phẩm',[
 {'Tên sản phẩm':'Ví dụ: Cà phê rang xay 500g','SKU':'VD-CAFE-500','Đơn vị':'Gói','Nhóm hàng':'Cà phê','Giá bán':180000,'Tồn tối thiểu':20,'Trạng thái':['Đang bán']},
 {'Tên sản phẩm':'Ví dụ: Trà sen 200g','SKU':'VD-TRA-200','Đơn vị':'Hộp','Nhóm hàng':'Trà','Giá bán':120000,'Tồn tối thiểu':15,'Trạng thái':['Đang bán']},
 {'Tên sản phẩm':'Ví dụ: Bánh hạt 250g','SKU':'VD-BANH-250','Đơn vị':'Hộp','Nhóm hàng':'Thực phẩm','Giá bán':60000,'Tồn tối thiểu':10,'Trạng thái':['Đang bán']},
]);
const warehouses=insert('DMS - Kho',[
 {'Tên kho':'Ví dụ: Kho TP. Hồ Chí Minh','Mã kho':'VD-KHO-HCM','Địa chỉ':'Dữ liệu minh họa','Người phụ trách':'Nhóm vận hành'},
 {'Tên kho':'Ví dụ: Kho Đà Nẵng','Mã kho':'VD-KHO-DN','Địa chỉ':'Dữ liệu minh họa','Người phụ trách':'Nhóm vận hành'},
]);
const date='2026-10-22';
const detail=(productId,name,sku,quantity,price)=>({productId,name,sku,quantity,price,amount:quantity*price});
insert('DMS - Đơn hàng',[
 {'Mã đơn':'VD-DH-001','Đối tác ID':partners[0],'Kho ID':warehouses[0],'Ngày đặt':date,'Trạng thái':['Đang giao'],'Chi tiết JSON':JSON.stringify([detail(products[0],'Ví dụ: Cà phê rang xay 500g','VD-CAFE-500',5,180000)]),'Tổng tiền':900000,'Đã thu':600000,'Ghi chú':'Đơn ví dụ: còn phải thu 300.000 VND.'},
 {'Mã đơn':'VD-DH-002','Đối tác ID':partners[1],'Kho ID':warehouses[1],'Ngày đặt':date,'Trạng thái':['Nháp'],'Chi tiết JSON':JSON.stringify([detail(products[1],'Ví dụ: Trà sen 200g','VD-TRA-200',2,120000),detail(products[2],'Ví dụ: Bánh hạt 250g','VD-BANH-250',3,60000)]),'Tổng tiền':420000,'Đã thu':0,'Ghi chú':'Đơn nháp ví dụ: chưa tính vào công nợ.'},
]);
const vouchers=[];for(let w=0;w<warehouses.length;w++)for(let p=0;p<products.length;p++)vouchers.push({'Mã phiếu':`VD-PN-${w+1}${p+1}`,'Sản phẩm ID':products[p],'Kho ID':warehouses[w],'Loại phiếu':['Nhập kho'],'Số lượng':w===1&&p===2?5:100,'Ngày ghi nhận':date,'Tham chiếu':'VD-TON-DAU','Ghi chú':'Tồn đầu kỳ ví dụ.'});
vouchers.push({'Mã phiếu':'VD-PX-001','Sản phẩm ID':products[0],'Kho ID':warehouses[0],'Loại phiếu':['Xuất kho'],'Số lượng':5,'Ngày ghi nhận':date,'Tham chiếu':'VD-DH-001','Ghi chú':'Xuất kho ví dụ theo đơn.'});
insert('DMS - Sổ kho',vouchers);
state.status='seeded; Preview Function readback required';checkpoint();
console.log('Seed complete. Expected: 2 partners, 3 products, 2 warehouses, 2 orders, 7 vouchers; order value 900000, receivables 300000; coffee HCM stock 95; one low-stock position.');
