import { NextRequest } from "next/server";
import { listBudgetRecordsAction } from "@/app/lib/action";

function checkAuth(req: NextRequest) {
    const apiKey = req.headers.get("x-api-key");
    return apiKey === process.env.BOT_API_KEY;
}

export async function POST(req: NextRequest) {
    if (!checkAuth(req)) {
        return Response.json({ success: false, message: "Sai API key." }, { status: 401 });
    }
    const body = await req.json();
    const result = await listBudgetRecordsAction(body);
    return Response.json(result);
}