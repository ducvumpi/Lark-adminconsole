const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const cli = 'C:/Users/Win10/AppData/Roaming/npm/node_modules/@larksuite/cli/bin/lark-cli.exe';
const baseToken = 'U3VIb4ycnaAF9xsjZHel2G1OgCf';
const text = name => ({ name, type: 'text' });
const number = name => ({ name, type: 'number', style: { type: 'plain', precision: 0 } });
const select = (name, values) => ({ name, type: 'select', multiple: false, options: values.map(name => ({ name })) });
const tables = [
  { name: 'DMS - Đối tác', fields: [text('Tên đối tác'), text('Mã đối tác'), select('Loại', ['Nhà phân phối', 'Đại lý']), text('Khu vực'), text('Điện thoại'), text('Địa chỉ'), select('Trạng thái', ['Hoạt động', 'Tạm ngưng']), text('Ghi chú')] },
  { name: 'DMS - Sản phẩm', fields: [text('Tên sản phẩm'), text('SKU'), text('Đơn vị'), text('Nhóm hàng'), number('Giá bán'), number('Tồn tối thiểu'), select('Trạng thái', ['Đang bán', 'Ngừng bán'])] },
  { name: 'DMS - Kho', fields: [text('Tên kho'), text('Mã kho'), text('Địa chỉ'), text('Người phụ trách')] },
  { name: 'DMS - Đơn hàng', fields: [text('Mã đơn'), text('Đối tác ID'), text('Kho ID'), text('Ngày đặt'), select('Trạng thái', ['Nháp', 'Đã xác nhận', 'Đang giao', 'Hoàn tất', 'Đã hủy']), text('Chi tiết JSON'), number('Tổng tiền'), number('Đã thu'), text('Ghi chú')] },
  { name: 'DMS - Sổ kho', fields: [text('Mã phiếu'), text('Sản phẩm ID'), text('Kho ID'), select('Loại phiếu', ['Nhập kho', 'Xuất kho']), number('Số lượng'), text('Ngày ghi nhận'), text('Tham chiếu'), text('Ghi chú')] },
];
if (process.argv.includes('--schema-only')) {
  fs.mkdirSync('dms-setup', { recursive: true });
  fs.writeFileSync('dms-setup/schema.json', JSON.stringify({ tables }, null, 2));
  console.log('Wrote dms-setup/schema.json; no remote changes.');
  process.exit(0);
}
function run(args) {
  const result = spawnSync(cli, [...args, '--profile', 'lark-test', '--as', 'user'], { encoding: 'utf8', timeout: 60000 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'CLI failed');
  const parsed = JSON.parse(result.stdout);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.error));
  return parsed.data;
}
const listed = run(['base', '+table-list', '--base-token', baseToken]);
const existing = listed.tables;
const created = [];
for (const table of tables) {
  let current = existing.find(item => item.name === table.name);
  if (!current) {
    const data = run(['base', '+table-create', '--base-token', baseToken, '--name', table.name, '--fields', JSON.stringify(table.fields)]);
    console.log(JSON.stringify({ table: table.name, result: data }));
    current = data.table || data;
  }
  created.push({ name: table.name, id: current.id || current.table_id });
  fs.mkdirSync(path.join('dms-setup'), { recursive: true });
  fs.writeFileSync(path.join('dms-setup', 'tables.json'), JSON.stringify(created, null, 2));
}
console.log(JSON.stringify({ tables: created }));
