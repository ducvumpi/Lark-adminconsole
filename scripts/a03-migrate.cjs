const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const root = path.resolve('data/a03-migration');
const cli = 'C:/Users/Win10/AppData/Roaming/npm/node_modules/@larksuite/cli/bin/lark-cli.exe';
const source = { base: 'ZszDbVpEEafitKsAWfRlTnRggpd', table: 'tblFjyYCeYgHjs51' };
function run(args) {
  const index = args.indexOf('--json');
  if (index >= 0 && args[index + 1]?.startsWith('{')) { const file = 'data/a03-migration/write-batch.json'; fs.writeFileSync(file, args[index + 1]); args = [...args]; args[index + 1] = '@' + file; }
  const r = spawnSync(cli, ['--profile', 'lark-test', ...args, '--as', 'user'], { encoding: 'utf8', timeout: 90000, maxBuffer: 30 * 1024 * 1024 });
  if (r.status !== 0) throw Error((r.stderr || r.stdout).slice(0, 1800));
  const body = JSON.parse(r.stdout); if (!body.ok) throw Error(JSON.stringify(body.error)); return body.data;
}
const save = (name, data) => fs.writeFileSync(path.join(root, name), JSON.stringify(data, null, 2));
const read = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
fs.mkdirSync(root, { recursive: true });
async function main() {
  const mode = process.argv[2];
  if (mode === 'snapshot') {
    if (fs.existsSync(path.join(root, 'snapshot.json'))) throw Error('Snapshot already exists; preserve it for reconciliation.');
    const fields = read('fields.json').fields;
    const pages = [], rows = []; let offset = 0, rev;
    for (;;) {
      const page = run(['base', '+record-list', '--base-token', source.base, '--table-id', source.table, '--offset', String(offset), '--limit', '200', '--json']);
      if (rev !== undefined && page.rev !== rev) throw Error('Source changed during snapshot; no destination writes have run.');
      rev = page.rev;
      if (!Array.isArray(page.data) || page.data.length !== page.record_id_list.length) throw Error('Unexpected source matrix.');
      rows.push(...page.data.map((cells, i) => ({ sourceId: page.record_id_list[i], fields: Object.fromEntries(page.fields.map((name, j) => [name, cells[j]])) })));
      pages.push({ offset, count: page.data.length, rev: page.rev, hasMore: page.has_more });
      if (!page.has_more) break;
      offset = page.next_offset ?? offset + page.data.length;
      if (!page.data.length || pages.length > 100) throw Error('Invalid pagination.');
    }
    if (new Set(rows.map(r => r.sourceId)).size !== rows.length) throw Error('Duplicate source records.');
    const digest = createHash('sha256').update(JSON.stringify(rows)).digest('hex');
    save('snapshot.json', { source, at: new Date().toISOString(), rev, pages, digest, rows });
    const text = name => ({ name, type: 'text' });
    const mapped = fields.map(f => f.type === 'number' ? { name: f.name, type: 'number', style: { type: 'plain', precision: f.style?.precision ?? 0 } } : f.type === 'select' ? { name: f.name, type: 'select', multiple: !!f.multiple, options: f.options.map(o => ({ name: o.name })) } : text(f.name));
    const primary = mapped.find(f => f.name === 'ID');
    const schema = { tables: [{ name: 'A03. Ngân sách được duyệt', fields: [primary, ...mapped.filter(f => f !== primary), text('ID bản ghi nguồn'), text('Dữ liệu nguồn JSON'), text('Mốc sao chép')] }, { name: 'A03. Hồ sơ trình duyệt', fields: [text('Tên hồ sơ'), text('Mã hồ sơ'), text('Brand'), text('Trạng thái'), text('Người lập ID'), text('Thời gian lập'), text('Bảng tính nguồn'), text('Người duyệt đề xuất JSON'), text('Bản tiền JSON'), { name: 'Tổng tiền trình', type: 'number' }, { name: 'Số dòng', type: 'number' }] }] };
    save('schema.json', schema); console.log(JSON.stringify({ ok: true, rows: rows.length, rev, pages: pages.length, sourceDigest: digest, fields: mapped.length }));
  } else if (mode === 'copy') {
    const snapshot = read('snapshot.json'), catalog = JSON.parse(fs.readFileSync('a03-lark-app/catalog.json', 'utf8'));
    const table = catalog.tables.find(t => t.name === 'A03. Ngân sách được duyệt');
    if (!table || table.baseToken === source.base) throw Error('Destination invalid.');
    const schema = read('schema.json').tables[0].fields;
    const stateFile = path.join(root, 'copy-state.json');
    const state = fs.existsSync(stateFile) ? read('copy-state.json') : { target: { base: table.baseToken, table: table.id }, digest: snapshot.digest, status: 'ready', completed: [], batches: [] };
    if (state.digest !== snapshot.digest || state.target.base !== table.baseToken || state.status === 'unknown') throw Error('Reconcile migration state before further writes.');
    const checkpoint = () => save('copy-state.json', state);
    function display(v) { if (v == null) return ''; if (Array.isArray(v)) return v.map(display).join(', '); if (typeof v === 'object') return display(v.name ?? v.text ?? v.value ?? JSON.stringify(v)); return String(v); }
    for (let start = state.completed.length; start < snapshot.rows.length; start += 100) {
      const batch = snapshot.rows.slice(start, start + 100);
      const records = batch.map(row => {
        const record = {};
        for (const field of schema) {
          const value = row.fields[field.name]; if (value == null || value === '') continue;
          if (field.type === 'number') { if (typeof value !== 'number' || !Number.isFinite(value)) throw Error('Non-numeric source amount: ' + field.name); record[field.name] = value; }
          else if (field.type === 'select') { const names = (Array.isArray(value) ? value.map(display) : [display(value)]).filter(v => v.trim()); if (names.length) record[field.name] = names; }
          else record[field.name] = display(value);
        }
        record['ID bản ghi nguồn'] = row.sourceId; record['Dữ liệu nguồn JSON'] = JSON.stringify(row.fields); record['Mốc sao chép'] = snapshot.at;
        return record;
      });
      state.status = 'unknown'; state.inFlight = { start, count: batch.length, sourceIds: batch.map(r => r.sourceId) }; checkpoint();
      const result = run(['base', '+record-batch-create', '--base-token', table.baseToken, '--table-id', table.id, '--json', JSON.stringify({ create_records: records })]);
      if (result.ignored_fields?.length || result.record_id_list?.length !== batch.length) throw Error('Incomplete copy receipt; stopped without retry.');
      state.completed.push(...batch.map((r, i) => ({ sourceId: r.sourceId, targetId: result.record_id_list[i] })));
      state.batches.push({ start, count: batch.length }); state.status = 'ready'; delete state.inFlight; checkpoint();
      console.log(JSON.stringify({ copied: state.completed.length, total: snapshot.rows.length }));
    }
    state.status = 'copied'; checkpoint(); console.log('COPY COMPLETE; published Function readback required.');
  } else throw Error('Use snapshot or copy');
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
