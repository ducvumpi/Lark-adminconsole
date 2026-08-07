import { NextRequest } from "next/server";
import { createBudgetRecordAction } from "@/app/lib/action";

function checkAuth(req: NextRequest) {
    return req.headers.get("x-api-key") === process.env.BOT_API_KEY;
}

export async function POST(req: NextRequest) {
    if (!checkAuth(req)) {
        return Response.json({ success: false, message: "Sai API key." }, { status: 401 });
    }
    const body = await req.json();
    const result = await createBudgetRecordAction(body);
    return Response.json(result);
}