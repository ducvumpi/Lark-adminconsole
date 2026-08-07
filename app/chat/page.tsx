"use client";

import { useState } from "react";

export default function ChatPage() {
  const [query, setQuery] = useState("Tìm tất cả record có Tổng tiền > 50 triệu");
  const [response, setResponse] = useState<string>("");
  const [jsonResult, setJsonResult] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend() {
    setLoading(true);
    setError(null);
    setResponse("");
    setJsonResult("");

    try {
      const res = await fetch("/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: "search_records",
          args: { query },
        }),
      });

      const data = await res.json();
      setJsonResult(JSON.stringify(data, null, 2));

      if (!data.success) {
        setError(data.error || "Lỗi không xác định");
        setLoading(false);
        return;
      }

      const result = data.result;
      if (!result || !Array.isArray(result.records)) {
        setResponse("Tool trả về dữ liệu không đúng định dạng.");
        setLoading(false);
        return;
      }

      const count = result.records.length;
      const sample = result.records.map((record: any, index: number) => {
        const name = record.fields?.["Tên ngân sách"] ?? record.record_id ?? `record-${index + 1}`;
        const amount = record.fields?.["Tổng tiền"] ?? record.fields?.["Tổng ngân sách"] ?? "n/a";
        return `${index + 1}. ${name} — Tổng tiền: ${amount}`;
      });

      setResponse(`Tìm được ${count} record.\n${sample.join("\n")}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 lg:px-8 lg:py-10">
      <div className="space-y-6">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">💬 Chat MCP Server</h1>
          <p className="mt-3 text-base text-slate-400">
            Gửi câu hỏi bằng tiếng Việt, MCP server sẽ gọi tool `search_records` và trả về kết quả JSON.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-xl">
          <label className="block text-sm font-medium text-slate-300">Câu truy vấn</label>
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            rows={4}
            className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 p-4 text-white outline-none focus:border-blue-500"
          />
          <button
            className="mt-4 inline-flex items-center rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
            onClick={handleSend}
            disabled={loading}
          >
            {loading ? "Đang gửi..." : "Gửi truy vấn"}
          </button>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-red-200">{error}</div>
        )}

        {response && (
          <div className="rounded-2xl border border-green-500/30 bg-green-500/10 p-6">
            <h2 className="text-xl font-semibold">Kết quả trả lời</h2>
            <pre className="whitespace-pre-wrap break-words text-sm text-slate-100">{response}</pre>
          </div>
        )}

        {jsonResult && (
          <div className="rounded-2xl border border-slate-700 bg-slate-950 p-6">
            <h2 className="text-xl font-semibold">JSON trả về</h2>
            <pre className="mt-3 overflow-x-auto text-sm text-slate-100">{jsonResult}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
