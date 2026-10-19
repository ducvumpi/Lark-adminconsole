/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const configA = { appId: "app-a", appSecret: "fake-a", baseAppToken: "base-a", tableId: "table-a", apiBaseUrl: "https://example-a.test" };
const configB = { appId: "app-b", appSecret: "fake-b", baseAppToken: "base-b", tableId: "table-b", apiBaseUrl: "https://example-b.test" };
let active = configA;
const calls = [];
const context = {
  exports: {}, console,
  require: name => {
    if (name === "./config") return { getConfig: () => active, isConfigComplete: () => true };
    if (name === "axios") return { create: options => ({
      post: async (path, body) => {
        calls.push({ baseURL: options.baseURL, path, body });
        active = configB;
        return { data: { code: 0, tenant_access_token: "fake-token", expire: 7200 } };
      },
      get: async path => { calls.push({ baseURL: options.baseURL, path }); return { data: { code: 0, data: { items: [], has_more: false } } }; },
    }) };
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
  console.log("Lark client config snapshot checks passed (offline)");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
