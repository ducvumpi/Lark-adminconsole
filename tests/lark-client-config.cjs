/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const configA = { appId: "app-a", appSecret: "fake-a", baseAppToken: "base-a", tableId: "table-a", apiBaseUrl: "https://example-a.test" };
const configB = { appId: "app-b", appSecret: "fake-b", baseAppToken: "base-b", tableId: "table-b", apiBaseUrl: "https://example-b.test" };
let active = configA;
const calls = [];
const axiosMock = {
  isAxiosError: error => error?.isAxiosError === true,
  create: options => ({
    post: async (path, body) => {
      calls.push({ baseURL: options.baseURL, path, body });
      active = configB;
      return { data: { code: 0, tenant_access_token: "fake-token", expire: 7200 } };
    },
    get: async (path, requestOptions) => {
      calls.push({ baseURL: options.baseURL, path });
      if (path.endsWith("/tables")) {
        assert.equal(requestOptions.params.page_size, 100);
        return { data: { code: 0, data: requestOptions.params.page_token
          ? { items: [{ table_id: "tblA03", name: "A03" }], has_more: false }
          : { items: [{ table_id: "tblA01", name: "A01" }], has_more: true, page_token: "next" } } };
      }
      if (path.includes("bad-approval")) {
        const error = new Error("Request failed with status code 400");
        error.isAxiosError = true;
        error.response = {
          status: 400,
          data: { code: 1390001, msg: "Approval instance not found" },
        };
        throw error;
      }
      if (path.startsWith("/approval/v4/instances/")) {
        return {
          data: {
            code: 0,
            data: {
              instance_code: "approval-123",
              approval_name: "Đề xuất ngân sách",
              serial_number: "NS-001",
              status: "APPROVED",
              start_time: "1761100000000",
              end_time: "1761103600000",
              form: '[{"name":"Số tiền","value":100}]',
            },
          },
        };
      }
      return { data: { code: 0, data: { items: [], has_more: false } } };
    },
  }),
};
const context = {
  exports: {}, console,
  require: name => {
    if (name === "./config") return { getConfig: () => active, isConfigComplete: () => true };
    if (name === "axios") return axiosMock;
    return require(name);
  },
};
vm.createContext(context);
vm.runInContext(ts.transpile(fs.readFileSync("app/lib/lark-client.ts", "utf8"), {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true,
}), context);
async function main() {
  const client = new context.exports.LarkBaseClient();
  await client.listFields();
  assert.equal(calls[0].body.app_id, "app-a");
  assert.equal(calls[1].baseURL, configA.apiBaseUrl);
  assert.equal(calls[1].path, "/bitable/v1/apps/base-a/tables/table-a/fields");
  const nextClient = new context.exports.LarkBaseClient();
  await nextClient.listFields();
  assert.equal(calls[2].body.app_id, "app-b");
  assert.equal(calls[3].path, "/bitable/v1/apps/base-b/tables/table-b/fields");
  const pinned = new context.exports.LarkBaseClient({ config: configA });
  await pinned.listFields();
  assert.equal(calls[5].path, "/bitable/v1/apps/base-a/tables/table-a/fields");
  const instance = await pinned.getApprovalInstance("approval/123");
  assert.equal(calls[6].path, "/approval/v4/instances/approval%2F123");
  assert.equal(instance.serial_number, "NS-001");
  await assert.rejects(
    pinned.getApprovalInstance("bad-approval"),
    /HTTP 400, code 1390001\): Approval instance not found/
  );
  const discovered = await pinned.listTables();
  assert.deepEqual(Array.from(discovered, table => table.table_id), ["tblA01", "tblA03"]);
  console.log("Lark client config and Approval lookup/error handling checks passed (offline)");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
