import { NextRequest } from "next/server";
import { deleteBudgetRecordsByFilterAction } from "@/app/lib/action";

function checkAuth(req: NextRequest) {
    const provided = (req.headers.get("x-api-key") || "").trim();
    const expected = (process.env.BOT_API_KEY || "").trim();
    return expected.length > 0 && provided === expected;
}

export async function POST(req: NextRequest) {
    if (!checkAuth(req)) {
        return Response.json({ success: false, message: "Sai API key." }, { status: 401 });
    }
    const body = await req.json();
    const result = await deleteBudgetRecordsByFilterAction(body);
    return Response.json(result);
}