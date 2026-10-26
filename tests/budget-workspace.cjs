const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, mocks = {}) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: id => Object.hasOwn(mocks, id) ? mocks[id] : require(id), process, console, Buffer, URL }, { filename: file });
  return module.exports;
}
const d = load('app/lib/budget/domain.ts');
let checks = 0;
function check(work) { work(); checks++; }
check(() => {
  assert.equal(d.BUDGET_BASE, 'ZszDbVpEEafitKsAWfRlTnRggpd');
  assert.deepEqual(JSON.parse(JSON.stringify(d.MODULES)), [{ key: 'A03', title: 'Ngân sách được duyệt', tableId: 'tblFjyYCeYgHjs51' }]);
  assert.equal(d.DEFAULT_BUDGET_SHEET_URL, 'https://tsgsifizy3jj.sg.larksuite.com/sheets/Ln5ysWfrhhgxShtPJs6lXyxmguh');
});
check(() => { assert.equal(d.parseVnd('1.250.000 đ'), 1250000); assert.equal(d.parseVnd(0), 0); });
for (const value of [-1, '1,5', '', NaN, 1e14, '1.000,000']) check(() => assert.throws(() => d.parseVnd(value)));
const schema = [{ field_name: 'BM', type: 11 }, { field_name: 'PIC Brand', type: 11 }];
const brands = [{ record_id: 'recB', fields: { 'Mã nhãn hàng': 'ACME', BM: [{ id: 'ou_test' }] } }];
check(() => assert.equal(d.brandPermissions(brands, schema, 'ou_test')[0].canManage, true));
check(() => assert.equal(d.brandPermissions(brands, schema, 'ou_other').length, 0));
check(() => assert.equal(d.brandPermissions([...brands, ...brands], schema, 'ou_test').length, 0));
check(() => assert.throws(() => d.requireBrand([{ brand: 'ACME', stopped: true }], 'ACME', true)));
check(() => assert.throws(() => d.requireBrand([], 'ACME')));
for (const url of ['https://evil.example/sheets/abc', 'https://larksuite.com.evil.example/sheets/abc', 'http://larksuite.com/sheets/abc', 'https://a.larksuite.com/wiki/abc']) check(() => assert.throws(() => d.parseSheetUrl(url)));
check(() => assert.equal(d.parseSheetUrl('https://a.larksuite.com/sheets/abc123').token, 'abc123'));
const row = { record_id: 'recOne', fields: { Brand: 'ACME', 'Mã ngân sách': 'NS01', 'Năm': '2026', 'Quý ngân sách': '4', 'Tháng ngân sách': '10', 'Số tiền TGĐ duyệt': 100 } };
const lines = d.sheetLines([['record_id', 'so_tien_duyet'], ['recOne', 200]], [row], 'ACME');
check(() => assert.equal(lines[0].before, 100));
check(() => assert.throws(() => d.sheetLines([['record_id', 'so_tien_duyet'], ['recOne', 200]], [row], 'OTHER')));
check(() => assert.throws(() => d.sheetLines([['record_id', 'so_tien_duyet'], ['recOne', 200], ['recOne', 300]], [row], 'ACME')));
const snapshot = { version: 1, title: 'Test', brand: 'ACME', sheetUrl: 'https://a.larksuite.com/sheets/abc', lines };
const binding = d.approvalBinding('request-test', snapshot);
check(() => d.validateApprovedForm(JSON.stringify([{ id: 'snapshot', value: binding }]), 'snapshot', binding));
check(() => assert.throws(() => d.validateApprovedForm(JSON.stringify([{ id: 'snapshot', value: binding + ' ' }]), 'snapshot', binding)));
check(() => assert.throws(() => d.validateApprovedForm(JSON.stringify([{ id: 'snapshot', value: binding }, { id: 'snapshot', value: binding }]), 'snapshot', binding)));

let doc, writes, upstream, currentRow, failWrite;
const clone = value => JSON.parse(JSON.stringify(value));
const workflow = load('app/lib/budget/workflow.ts', {
  './domain': d,
  './storage': { readRequest: async () => clone(doc), saveRequest: async value => { doc = clone(value); }, withRequestLock: async (_id, work) => work() },
  './lark': { lark: async () => upstream, a03Record: async () => currentRow, patchApprovedAmount: async () => { writes++; if (failWrite) throw Error('timeout'); } },
});
const session = { openId: 'ou_test', name: 'Tester', token: 'fake' }, access = [{ brand: 'ACME', canManage: true, stopped: false, roles: ['BM'] }];
function reset() { writes = 0; failWrite = false; currentRow = clone(row); doc = { id: 'test', creator: 'ou_test', status: 'approved', snapshot: clone(snapshot), binding, instanceCode: 'instance', approvalCode: 'template', snapshotField: 'snapshot', approvers: [], events: [], syncResults: [] }; upstream = { instance_code: 'instance', approval_code: 'template', status: 'APPROVED', form: JSON.stringify([{ id: 'snapshot', value: binding }]) }; }
async function blocked(change) { reset(); change(); await assert.rejects(() => workflow.syncApproved(session, access, 'test')); assert.equal(writes, 0); checks++; }
(async () => {
  await blocked(() => { doc.status = 'pending'; });
  await blocked(() => { upstream.status = 'PENDING'; });
  await blocked(() => { upstream.form = '[]'; });
  await blocked(() => { upstream.approval_code = 'wrong'; });
  await blocked(() => { currentRow.fields.Brand = 'OTHER'; });
  await blocked(() => { currentRow.fields['Số tiền TGĐ duyệt'] = 999; });
  await blocked(() => { currentRow.fields['Mã ngân sách'] = 'changed'; });
  reset(); await workflow.syncApproved(session, access, 'test'); assert.equal(writes, 1); assert.equal(doc.status, 'synced'); checks++;
  reset(); failWrite = true; doc.snapshot.lines.push({ ...lines[0], recordId: 'recTwo' }); await workflow.syncApproved(session, access, 'test'); assert.equal(writes, 1); assert.equal(doc.status, 'partial'); assert.equal(doc.syncResults[0].status, 'unknown'); await assert.rejects(() => workflow.syncApproved(session, access, 'test')); assert.equal(writes, 1); checks++;
  console.log(`PASS: ${checks} budget checks; no live API calls or financial writes.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
