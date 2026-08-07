import { listFieldsAction, listRecordsAction } from "@/app/lib/action";
import RecordsManager from "@/app/components/RecordsManager";

export default async function RecordsPage() {
  const fieldsResult = await listFieldsAction();

  if (!fieldsResult.success) {
    return (
      <div className="mx-auto max-w-7xl space-y-6 px-6 py-8 lg:px-8 lg:py-10">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">
            📂 Dữ liệu (Records)
          </h1>

          <p className="mt-3 text-base text-slate-400">
            Quản lý dữ liệu trực tiếp trong Lark Base
          </p>
        </div>

        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5 text-red-300">
          {fieldsResult.message}
        </div>
      </div>
    );
  }

  const recordsResult = await listRecordsAction({ pageSize: 20 });

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-6 py-8 lg:px-8 lg:py-10">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold tracking-tight">
          📂 Dữ liệu (Records)
        </h1>

        <p className="mt-3 text-base text-slate-400">
          Xem, tìm kiếm, thêm, sửa và xóa dữ liệu trực tiếp trong Lark Base
        </p>
      </div>

      {/* Error */}
      {!recordsResult.success ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5 text-red-300">
          {recordsResult.message}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-xl ring-1 ring-slate-800/50">
          <RecordsManager
            fields={fieldsResult.data!}
            initialRecords={recordsResult.data!.items}
            initialHasMore={recordsResult.data!.hasMore}
            initialPageToken={recordsResult.data!.pageToken}
            initialTotal={recordsResult.data!.total}
          />
        </div>
      )}
    </div>
  );
}