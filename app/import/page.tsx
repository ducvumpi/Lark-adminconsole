import ImportWizard from "@/app/components/ImportWizard";
import TiktokImportPanel from "@/app/components/TiktokImportPanel";

export default function ImportPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-8 px-6 py-8 lg:px-8 lg:py-10">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold tracking-tight">
          📤 Import Excel — TGĐ Duyệt Ngân Sách
        </h1>

        <p className="mt-3 text-base text-slate-400">
          Upload file Excel nhiều-sheet (mỗi sheet 1 Brand) — hệ thống tự động dò cột
          và ghi thẳng vào Lark Base, không cần chọn mapping thủ công.
        </p>
      </div>

      <div className="space-y-6">
        <div className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-xl ring-1 ring-slate-800/50">
          <ImportWizard />
        </div>

        <TiktokImportPanel />
      </div>
    </div>
  );
}