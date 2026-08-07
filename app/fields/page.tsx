import { listFieldsAction } from "@/app/lib/action";
import { FIELD_TYPE_LABEL } from "@/app/lib/lark-client";

export default async function FieldsPage() {
  const result = await listFieldsAction();

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-6 py-8 lg:px-8 lg:py-10">
      {/* Header */}
      <div className="mb-2">
        <h1 className="text-4xl font-bold tracking-tight">
          📋 Danh sách cột
        </h1>

        <p className="mt-3 text-base text-slate-400">
          Các Field hiện có trong bảng Lark Base
        </p>
      </div>
      {/* Error */}
      {!result.success && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5 text-red-300">
          {result.message}
        </div>
      )}

      {/* Table */}
      {result.success && (
        <div className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-xl ring-1 ring-slate-800/50">
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-slate-800/80 backdrop-blur">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Tên cột
                  </th>

                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Loại
                  </th>

                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Field ID
                  </th>

                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Tùy chọn
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-800">
                {result.data!.map((field) => (
                  <tr
                    key={field.field_id}
                    className="transition-colors duration-200 hover:bg-slate-800/60"                  >
                    <td className="px-6 py-4 font-medium">
                      {field.field_name}
                    </td>

                    <td className="px-6 py-4">
                      <span className="inline-flex rounded-full bg-blue-500/15 px-3 py-1 text-xs font-semibold text-blue-300">
                        {FIELD_TYPE_LABEL[field.type] ||
                          `Loại ${field.type}`}
                      </span>
                    </td>

                    <td className="max-w-xs break-all px-6 py-4 font-mono text-sm text-slate-400">
                      {field.field_id}
                    </td>

                    <td className="px-6 py-4 text-slate-300">
                      {field.property?.options?.length ? (
                        <div className="flex flex-wrap gap-2">
                          {field.property.options.map((option) => (
                            <span
                              key={option.id ?? option.name}
                              className="rounded-full bg-slate-700 px-3 py-1 text-xs"
                            >
                              {option.name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-slate-800 bg-slate-900/70 px-6 py-4 text-sm text-slate-400">
            <span>
              Tổng số field:{" "}
              <span className="font-semibold text-white">
                {result.data?.length ?? 0}
              </span>
            </span>

            <span>Lark Base</span>
          </div>
        </div>
      )}
    </div>
  );
}