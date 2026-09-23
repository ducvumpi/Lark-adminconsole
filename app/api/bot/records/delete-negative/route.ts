import { NextRequest } from "next/server";
import { getLarkClient } from "@/app/lib/lark-client";

function checkAuth(req: NextRequest) {
    return req.headers.get("x-api-key") === process.env.BOT_API_KEY;
}

export async function POST(req: NextRequest) {
    if (!checkAuth(req)) {
        return Response.json({ success: false, message: "Sai API key." }, { status: 401 });
    }

    try {
        const body = await req.json().catch(() => ({}));
        const fieldName = typeof body.fieldName === "string" && body.fieldName.trim()
            ? body.fieldName.trim()
            : undefined;
        const client = getLarkClient();
        const records = await client.findNegativeApprovedAmountRecords(fieldName);
        const result = await client.batchDeleteRecords(records.map((record) => record.record_id));

        return Response.json({ success: true, found: records.length, ...result });
    } catch (err: any) {
        return Response.json(
            { success: false, message: err?.message || "Xóa record thất bại." },
            { status: 500 }
        );
    }
}