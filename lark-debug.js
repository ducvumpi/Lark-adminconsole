const fs = require('fs');
const path = require('path');
const axios = require('axios');

const configPath = path.join(process.cwd(), 'data', 'config.json');
const override = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf-8')) : {};
const config = {
  appId: override.appId || process.env.LARK_APP_ID || '',
  appSecret: override.appSecret || process.env.LARK_APP_SECRET || '',
  baseAppToken: override.baseAppToken || process.env.LARK_BASE_APP_TOKEN || '',
  tableId: override.tableId || process.env.LARK_TABLE_ID || '',
  apiBaseUrl: override.apiBaseUrl || process.env.LARK_API_BASE_URL || 'https://open.larksuite.com/open-apis',
};

async function getToken() {
  const res = await axios.post(`${config.apiBaseUrl}/auth/v3/tenant_access_token/internal`, {
    app_id: config.appId,
    app_secret: config.appSecret,
  });
  if (res.data.code !== 0) throw new Error(`Auth error: ${res.data.code} ${res.data.msg}`);
  return res.data.tenant_access_token;
}

async function main() {
  const token = await getToken();
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const fieldsRes = await axios.get(`${config.apiBaseUrl}/bitable/v1/apps/${config.baseAppToken}/tables/${config.tableId}/fields`, { headers });
  if (fieldsRes.data.code !== 0) throw new Error(`Fields error: ${fieldsRes.data.code} ${fieldsRes.data.msg}`);
  console.log('fieldNames:');
  for (const field of fieldsRes.data.data.items) {
    console.log('-', field.field_name, '|', field.type);
  }
  const recordsRes = await axios.get(`${config.apiBaseUrl}/bitable/v1/apps/${config.baseAppToken}/tables/${config.tableId}/records`, {
    headers,
    params: { page_size: 10 },
  });
  if (recordsRes.data.code !== 0) throw new Error(`Records error: ${recordsRes.data.code} ${recordsRes.data.msg}`);
  console.log('\nfirst 10 records:');
  for (const record of recordsRes.data.data.items) {
    console.log('id=', record.record_id, 'fields=', JSON.stringify(record.fields, null, 2));
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});