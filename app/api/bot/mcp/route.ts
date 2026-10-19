import { handleMcp } from "@/app/lib/lark-mcp";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) { return handleMcp(request); }
export async function GET(request: Request) { return handleMcp(request); }
export async function DELETE(request: Request) { return handleMcp(request); }
