import { getLarkClient } from "@/app/lib/lark-client"; // sửa đúng path thật của bạn
const client = getLarkClient();
const records = await client.findNegativeApprovedAmountRecords();
// preview trước, xác nhận rồi mới:
const result = await client.batchDeleteRecords(records.map(r => r.record_id));