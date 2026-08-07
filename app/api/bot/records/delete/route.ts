import { NextRequest } from "next/server";
import { deleteBudgetRecordAction } from "@/app/lib/action";

function checkAuth(req: NextRequest) {
    return req.headers.get("x-api-key") === process.env.BOT_API_KEY;
}

export async function POST(req: NextRequest) {
    if (!checkAuth(req)) {
        return Response.json({ success: false, message: "Sai API key." }, { status: 401 });
    }
    const body = await req.json(); // { recordId }
    const result = await deleteBudgetRecordAction(body.recordId);
    return Response.json(result);
}