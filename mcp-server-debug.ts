import http from "node:http";
import { getLarkClient } from "./app/lib/lark-client.ts";

async function main() {
  const client = getLarkClient();
  const fields = await client.listFields();
  console.log("Fields:", fields.map((f) => f.field_name));

  const records = await client.listRecords({ pageSize: 20 });
  console.log("First 20 records:", records.items.map((record) => ({
    id: record.record_id,
    fields: record.fields,
  })));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
