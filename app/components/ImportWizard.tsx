"use client";

import { useEffect, useRef, useState } from "react";
import {
  importTgdBudgetExcelAction,
  undoImportBatchAction,
  getRecentImportBatchesAction,
  listSheetsAndMonthsAction,
  type TgdImportRowResult,
  type ImportBatchSummary,
  type SheetsAndMonthsPreview,
  type SheetDebugInfo,
} from "@/app/lib/action";

interface ImportResult {
  results: TgdImportRowResult[];
  created: number;
  updated: number;
  skipped: number;
  batchId: string;
  fileBatches: Array<{ fileName: string; batchId: string }>;
  debug: SheetDebugInfo[];
}

const LOAI_NGAN_SACH_OPTIONS = [
  "Ngân sách Ads",
  "Ngân sách hãng tài trợ",
  "Ngân sách Trade",
  "Ngân sách Ecom",
  "Ngân sách Product Marketing",
];

const LOAI_DE_XUAT_OPTIONS = [
  "Đề xuất ngân sách định kỳ",
  "Đề xuất ngân sách năm",
  "Đề xuất ngân sách bổ sung",
  "Đề xuất ngân sách phát sinh",
  "Đề xuất ngân sách quý",
];

type Step = "upload" | "select" | "done";

type ProgressPopupState = {
  open: boolean;
  operation: "import" | "undo";
  current: number;
  total: number;
  message: string;
};

type FileSelectionState = {
  file: File;
  preview: SheetsAndMonthsPreview;
  selectedSheets: Set<string>;
  selectedMonths: Set<string>;
  loaiNganSach: string;
  loaiDeXuat: string;
  stopRequested: boolean;
  status: "pending" | "running" | "done" | "stopped";
  recordEstimate: number;
};

export default function ImportWizard({
  onProgressStateChange,
}: {
  onProgressStateChange?: (popup: ProgressPopupState | null) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const progressTickerRef = useRef<number | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [fileSelections, setFileSelections] = useState<FileSelectionState[]>([]);
  const [step, setStep] = useState<Step>("upload");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [selectedUndoFiles, setSelectedUndoFiles] = useState<string[]>([]);
  const [activeImportFile, setActiveImportFile] = useState<string | null>(null);
  const [progressPopup, setProgressPopup] = useState<ProgressPopupState>({
    open: false,
    operation: "import",
    current: 0,
    total: 0,
    message: "",
  });

  const [loadingPreview, setLoadingPreview] = useState(false);

  const [undoingBatchId, setUndoingBatchId] = useState<string | null>(null);
  const [undoMessage, setUndoMessage] = useState<string | null>(null);

  const [recentBatches, setRecentBatches] = useState<ImportBatchSummary[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(false);

  async function loadRecentBatches() {
    setLoadingBatches(true);
    const res = await getRecentImportBatchesAction();
    setLoadingBatches(false);
    if (res.success) {
      setRecentBatches(res.data ?? []);
    }
  }

  useEffect(() => {
    loadRecentBatches();
  }, []);

  useEffect(() => {
    onProgressStateChange?.(progressPopup);
  }, [progressPopup, onProgressStateChange]);

  useEffect(() => {
    return () => {
      if (progressTickerRef.current !== null) {
        window.clearInterval(progressTickerRef.current);
        progressTickerRef.current = null;
      }
    };
  }, []);

  function startProgressTicker(targetTotal: number) {
    if (progressTickerRef.current !== null) {
      window.clearInterval(progressTickerRef.current);
    }

    progressTickerRef.current = window.setInterval(() => {
      setProgressPopup((prev) => {
        if (!prev.open || prev.total <= 0) return prev;
        const bump = Math.max(1, Math.round(prev.total / 25));
        const nextCurrent = Math.min(prev.total, prev.current + bump);
        return { ...prev, current: nextCurrent };
      });
    }, 160);
  }

  function stopProgressTicker() {
    if (progressTickerRef.current !== null) {
      window.clearInterval(progressTickerRef.current);
      progressTickerRef.current = null;
    }
  }

  async function handleFileChange() {
    const files = Array.from(fileInputRef.current?.files ?? []);
    if (files.length === 0) return;
    setSelectedFiles(files);
    setFileSelections([]);
    setError(null);
    setLoadingPreview(true);

    try {
      const previews: FileSelectionState[] = [];
      for (const file of files) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await listSheetsAndMonthsAction(fd);
        if (!res.success) {
          setError(res.message);
          return;
        }
        previews.push({
          file,
          preview: res.data!,
          selectedSheets: new Set(res.data!.sheets),
          selectedMonths: new Set(res.data!.months),
          loaiNganSach: LOAI_NGAN_SACH_OPTIONS[0],
          loaiDeXuat: LOAI_DE_XUAT_OPTIONS[0],
          stopRequested: false,
          status: "pending",
          recordEstimate: res.data!.recordEstimate,
        });
      }

      setFileSelections(previews);
      setStep("select");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingPreview(false);
    }
  }

  function toggleSheet(fileName: string, name: string) {
    setFileSelections((prev) =>
      prev.map((item) => {
        if (item.file.name !== fileName) return item;
        const next = new Set(item.selectedSheets);
        if (next.has(name)) next.delete(name);
        else next.add(name);
        return { ...item, selectedSheets: next };
      })
    );
  }

  function toggleMonth(fileName: string, name: string) {
    setFileSelections((prev) =>
      prev.map((item) => {
        if (item.file.name !== fileName) return item;
        const next = new Set(item.selectedMonths);
        if (next.has(name)) next.delete(name);
        else next.add(name);
        return { ...item, selectedMonths: next };
      })
    );
  }

  function updateSelection(fileName: string, type: "sheets" | "months", nextValue: Set<string>) {
    setFileSelections((prev) =>
      prev.map((item) => {
        if (item.file.name !== fileName) return item;
        return type === "sheets" ? { ...item, selectedSheets: nextValue } : { ...item, selectedMonths: nextValue };
      })
    );
  }

  function updateFileType(fileName: string, type: "loaiNganSach" | "loaiDeXuat", value: string) {
    setFileSelections((prev) =>
      prev.map((item) => {
        if (item.file.name !== fileName) return item;
        return { ...item, [type]: value };
      })
    );
  }

  function requestStopForFile(fileName: string) {
    setFileSelections((prev) =>
      prev.map((item) => (item.file.name === fileName ? { ...item, stopRequested: true, status: "stopped" } : item))
    );
  }

  async function handleImport() {
    if (selectedFiles.length === 0) {
      setError("Chưa chọn file.");
      return;
    }

    const invalidFile = fileSelections.find((item) => item.selectedSheets.size === 0 || item.selectedMonths.size === 0);
    if (invalidFile) {
      setError(`File ${invalidFile.file.name} chưa chọn đủ sheet hoặc tháng để import.`);
      return;
    }

    const totalRecordEstimate = fileSelections.reduce((sum, item) => sum + item.recordEstimate, 0);

    setLoading(true);
    setError(null);
    setUndoMessage(null);
    setProgressPopup({
      open: true,
      operation: "import",
      current: 0,
      total: totalRecordEstimate || fileSelections.length,
      message: "Đang chuẩn bị import...",
    });
    startProgressTicker(totalRecordEstimate || fileSelections.length);

    try {
      const combinedResults: TgdImportRowResult[] = [];
      const combinedDebug: SheetDebugInfo[] = [];
      const fileBatchList: Array<{ fileName: string; batchId: string }> = [];
      let created = 0;
      let updated = 0;
      let skipped = 0;
      let progressRecords = 0;
      let batchId = "";

      for (const [index, item] of fileSelections.entries()) {
        if (item.stopRequested) {
          setFileSelections((prev) =>
            prev.map((entry) =>
              entry.file.name === item.file.name ? { ...entry, status: "stopped" } : entry
            )
          );
          setProgressPopup({
            open: true,
            operation: "import",
            current: index,
            total: fileSelections.length,
            message: `Bỏ qua file ${item.file.name} vì đã được dừng trước đó.`,
          });
          continue;
        }

        const hasAnyStopRequested = fileSelections.some((entry) => entry.stopRequested);
        if (hasAnyStopRequested) {
          break;
        }

        setActiveImportFile(item.file.name);
        setProgressPopup({
          open: true,
          operation: "import",
          current: progressRecords,
          total: totalRecordEstimate || fileSelections.length,
          message: `Đang import file ${index + 1}/${fileSelections.length}: ${item.file.name}`,
        });
        setFileSelections((prev) =>
          prev.map((entry) =>
            entry.file.name === item.file.name ? { ...entry, status: "running" } : entry
          )
        );

        const fd = new FormData();
        fd.append("file", item.file);
        fd.append("loaiNganSach", item.loaiNganSach);
        fd.append("loaiDeXuat", item.loaiDeXuat);
        fd.append("selectedSheets", JSON.stringify(Array.from(item.selectedSheets)));
        fd.append("selectedMonths", JSON.stringify(Array.from(item.selectedMonths)));

        const res = await importTgdBudgetExcelAction(fd);
        if (!res.success) {
          setError(res.message);
          setFileSelections((prev) =>
            prev.map((entry) =>
              entry.file.name === item.file.name ? { ...entry, status: "pending" } : entry
            )
          );
          break;
        }

        const fileProcessedRecords = Math.max(1, res.data!.results.length);
        fileBatchList.push({ fileName: item.file.name, batchId: res.data!.batchId });
        combinedResults.push(...res.data!.results);
        combinedDebug.push(...res.data!.debug);
        created += res.data!.created;
        updated += res.data!.updated;
        skipped += res.data!.skipped;
        progressRecords += fileProcessedRecords;
        batchId = res.data!.batchId;

        setProgressPopup({
          open: true,
          operation: "import",
          current: Math.min(progressRecords, totalRecordEstimate || fileSelections.length),
          total: totalRecordEstimate || fileSelections.length,
          message: `Đã xử lý ${Math.min(progressRecords, totalRecordEstimate || fileSelections.length)}/${totalRecordEstimate || fileSelections.length} record trong import file ${item.file.name}`,
        });

        setFileSelections((prev) =>
          prev.map((entry) =>
            entry.file.name === item.file.name ? { ...entry, status: "done" } : entry
          )
        );
      }

      if (combinedResults.length > 0 || combinedDebug.length > 0 || created > 0 || updated > 0 || skipped > 0) {
        setSelectedUndoFiles(fileBatchList.map((entry) => entry.fileName));
        setResult({
          results: combinedResults,
          created,
          updated,
          skipped,
          batchId,
          fileBatches: fileBatchList,
          debug: combinedDebug,
        });
        setStep("done");
        await loadRecentBatches();
      }
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      stopProgressTicker();
      setLoading(false);
      setActiveImportFile(null);
      setProgressPopup((prev) => ({ ...prev, open: false }));
    }
  }

  async function handleUndo(batchId: string) {
    const confirmed = window.confirm(
      "Hoàn tác lần import này? Record mới tạo sẽ bị XÓA, record đã update sẽ được TRẢ VỀ giá trị trước đó. Hành động này không thể hoàn tác lại lần nữa."
    );
    if (!confirmed) return;

    setUndoingBatchId(batchId);
    setUndoMessage(null);
    setError(null);
    setProgressPopup({
      open: true,
      operation: "undo",
      current: 1,
      total: 1,
      message: `Đang hoàn tác batch ${batchId.slice(0, 8)}...`,
    });
    startProgressTicker(1);

    try {
      const res = await undoImportBatchAction(batchId);
      if (!res.success) {
        setError(res.message);
        return;
      }

      const { deleted, reverted, failed } = res.data!;
      setUndoMessage(
        `Đã hoàn tác: xóa ${deleted} record mới tạo, trả về giá trị cũ cho ${reverted} record.` +
        (failed.length > 0 ? ` (${failed.length} record hoàn tác lỗi, xem console.)` : "")
      );
      if (failed.length > 0) console.error("Undo failed records:", failed);

      await loadRecentBatches();
      if (result?.batchId === batchId) {
        setResult(null);
        setStep("upload");
      }
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      stopProgressTicker();
      setUndoingBatchId(null);
    }
  }

  async function handleUndoSelectedFiles() {
    const selected = result?.fileBatches.filter((entry) => selectedUndoFiles.includes(entry.fileName)) ?? [];
    if (selected.length === 0) {
      setError("Chưa chọn file nào để hoàn tác.");
      return;
    }

    setUndoMessage(null);
    setError(null);
    setUndoingBatchId("multi");
    setProgressPopup({
      open: true,
      operation: "undo",
      current: 0,
      total: selected.length,
      message: "Đang chuẩn bị hoàn tác file đã chọn...",
    });
    startProgressTicker(selected.length);

    try {
      let deleted = 0;
      let reverted = 0;
      const failed: Array<{ recordId: string; reason: string }> = [];

      for (const [index, entry] of selected.entries()) {
        setProgressPopup({
          open: true,
          operation: "undo",
          current: index + 1,
          total: selected.length,
          message: `Đang hoàn tác file ${index + 1}/${selected.length}: ${entry.fileName}`,
        });

        const res = await undoImportBatchAction(entry.batchId);
        if (!res.success) {
          setError(res.message);
          break;
        }
        deleted += res.data!.deleted;
        reverted += res.data!.reverted;
        failed.push(...res.data!.failed);
      }

      setUndoMessage(
        `Đã hoàn tác ${selected.length} file: xóa ${deleted} record mới tạo, trả về giá trị cũ cho ${reverted} record.` +
        (failed.length > 0 ? ` (${failed.length} record hoàn tác lỗi, xem console.)` : "")
      );
      if (failed.length > 0) console.error("Undo failed records:", failed);
      await loadRecentBatches();
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      stopProgressTicker();
      setUndoingBatchId(null);
      setProgressPopup((prev) => ({ ...prev, open: false }));
    }
  }

  function resetAll() {
    setSelectedFiles([]);
    setFileSelections([]);
    setResult(null);
    setError(null);
    setUndoMessage(null);
    setStep("upload");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  const brandQuarterSummary = result
    ? Array.from(new Set(result.results.map((r) => `${r.brand} · ${r.quarter}`)))
    : [];

  const importedNothing = result && result.created === 0 && result.updated === 0 && result.skipped === 0;

  return (
    <div className="space-y-6 p-6">
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-300">
          {error}
        </div>
      )}
      {undoMessage && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-300">
          {undoMessage}
        </div>
      )}

      {step === "upload" && (
        <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-5">
          <label className="block text-sm font-medium text-slate-300">
            Chọn nhiều file Excel TGĐ duyệt ngân sách (.xlsx/.xls)
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            multiple
            onChange={handleFileChange}
            className="mt-3 block w-full text-sm text-slate-300"
          />
          {selectedFiles.length > 0 && (
            <p className="mt-3 text-sm text-slate-400">
              Đã chọn {selectedFiles.length} file. Mỗi file sẽ có preview sheet/tháng riêng và cấu hình chọn riêng.
            </p>
          )}
          {loadingPreview && <p className="mt-3 text-sm text-slate-400">Đang đọc file...</p>}
        </div>
      )}

      {step === "select" && fileSelections.length > 0 && (
        <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-300">Chọn sheet và tháng riêng cho từng file</h3>
            <button className="text-xs text-slate-400 hover:text-slate-200" onClick={resetAll}>
              Chọn file khác
            </button>
          </div>

          <div className="mt-4 space-y-4">
            {fileSelections.map((item) => (
              <div key={item.file.name} className="rounded-lg border border-slate-700 bg-slate-900/60 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-200">{item.file.name}</div>
                    <div className="text-xs text-slate-500">{item.file.size.toLocaleString("vi-VN")} bytes</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-300">
                      {item.status}
                    </span>
                    <button
                      type="button"
                      className="rounded-lg border border-red-500/40 px-3 py-1 text-xs font-medium text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                      onClick={() => requestStopForFile(item.file.name)}
                      disabled={item.stopRequested || item.status === "done"}
                    >
                      ⏹ Dừng file
                    </button>
                  </div>
                </div>

                <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-400">Loại ngân sách</label>
                    <select
                      value={item.loaiNganSach}
                      onChange={(e) => updateFileType(item.file.name, "loaiNganSach", e.target.value)}
                      className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200"
                    >
                      {LOAI_NGAN_SACH_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400">Loại đề xuất</label>
                    <select
                      value={item.loaiDeXuat}
                      onChange={(e) => updateFileType(item.file.name, "loaiDeXuat", e.target.value)}
                      className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200"
                    >
                      {LOAI_DE_XUAT_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-400">Sheet</span>
                      <div className="flex gap-2 text-xs">
                        <button
                          className="text-blue-400 hover:underline"
                          onClick={() => updateSelection(item.file.name, "sheets", new Set(item.preview.sheets))}
                        >
                          Chọn tất cả
                        </button>
                        <button
                          className="text-slate-500 hover:underline"
                          onClick={() => updateSelection(item.file.name, "sheets", new Set())}
                        >
                          Bỏ chọn hết
                        </button>
                      </div>
                    </div>
                    <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border border-slate-700 p-3">
                      {item.preview.sheets.map((s) => {
                        const sheetMonths = item.preview.sheetMonths?.[s] ?? [];
                        return (
                          <div key={`${item.file.name}-${s}`} className="rounded border border-slate-800 bg-slate-950/40 p-2">
                            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-200">
                              <input
                                type="checkbox"
                                checked={item.selectedSheets.has(s)}
                                onChange={() => toggleSheet(item.file.name, s)}
                              />
                              {s}
                            </label>
                            <div className="mt-1 ml-6 text-[11px] text-slate-500">
                              Tháng: {sheetMonths.length > 0 ? sheetMonths.join(" · ") : "— không thấy nhãn tháng trong sheet này —"}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-400">Tháng</span>
                      <div className="flex gap-2 text-xs">
                        <button
                          className="text-blue-400 hover:underline"
                          onClick={() => updateSelection(item.file.name, "months", new Set(item.preview.months))}
                        >
                          Chọn tất cả
                        </button>
                        <button
                          className="text-slate-500 hover:underline"
                          onClick={() => updateSelection(item.file.name, "months", new Set())}
                        >
                          Bỏ chọn hết
                        </button>
                      </div>
                    </div>
                    <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-slate-700 p-3">
                      {item.preview.months.length === 0 ? (
                        <p className="text-sm text-slate-500">Không tìm thấy cột tháng nào trong file.</p>
                      ) : (
                        item.preview.months.map((m) => (
                          <label key={`${item.file.name}-${m}`} className="flex cursor-pointer items-center gap-2 text-sm text-slate-200">
                            <input
                              type="checkbox"
                              checked={item.selectedMonths.has(m)}
                              onChange={() => toggleMonth(item.file.name, m)}
                            />
                            {m}
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
              onClick={handleImport}
              disabled={loading || fileSelections.some((item) => item.selectedSheets.size === 0 || item.selectedMonths.size === 0)}
            >
              {loading ? "Đang import..." : `Import ${selectedFiles.length} file vào Base`}
            </button>

            {activeImportFile && <span className="text-xs text-slate-400">Đang xử lý: {activeImportFile}</span>}
          </div>
        </div>
      )}

      {step === "done" && result && (
        <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-5">
          <div
            className={
              importedNothing
                ? "rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-300"
                : "rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-300"
            }
          >
            Đã tạo {result.created} record mới, cập nhật {result.updated} record, bỏ qua{" "}
            {result.skipped} dòng lỗi.
            {importedNothing && " Không có dòng nào được xử lý — xem chi tiết chẩn đoán bên dưới."}
          </div>

          {brandQuarterSummary.length > 0 && (
            <div className="mt-3 text-xs text-slate-400">Đã nhận diện: {brandQuarterSummary.join(" | ")}</div>
          )}

          <div className="mt-4 flex flex-col gap-3">
            <div className="flex gap-3">
              <button
                className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-600"
                onClick={resetAll}
              >
                Import file khác
              </button>
              <button
                className="rounded-lg border border-red-500/40 px-4 py-2 text-sm font-medium text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                onClick={handleUndoSelectedFiles}
                disabled={undoingBatchId === "multi"}
              >
                {undoingBatchId === "multi" ? "Đang hoàn tác..." : "↩ Hoàn tác file đã chọn"}
              </button>
            </div>

            {result.fileBatches.length > 0 && (
              <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3">
                <div className="mb-2 text-xs font-medium text-slate-400">Chọn file vừa import để hoàn tác:</div>
                <div className="space-y-2">
                  {result.fileBatches.map((entry) => (
                    <label key={entry.batchId} className="flex items-center gap-2 text-sm text-slate-200">
                      <input
                        type="checkbox"
                        checked={selectedUndoFiles.includes(entry.fileName)}
                        onChange={() => {
                          setSelectedUndoFiles((prev) =>
                            prev.includes(entry.fileName)
                              ? prev.filter((name) => name !== entry.fileName)
                              : [...prev, entry.fileName]
                          );
                        }}
                      />
                      <span>{entry.fileName}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Panel chẩn đoán: luôn hiện khi không có gì được xử lý, có thể mở rộng thủ công khi cần */}
          {result.debug && result.debug.length > 0 && (
            <details className="mt-5 rounded-lg border border-slate-700" open={Boolean(importedNothing)}>
              <summary className="cursor-pointer select-none p-3 text-sm font-medium text-slate-300">
                🔍 Chi tiết chẩn đoán từng sheet ({result.debug.length} sheet đã quét)
              </summary>
              <div className="space-y-4 border-t border-slate-700 p-4">
                {result.debug.map((d) => (
                  <div key={d.sheetName} className="rounded-lg border border-slate-700 bg-slate-900/50 p-3 text-xs">
                    <div className="font-semibold text-slate-200">{d.sheetName}</div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-slate-400">
                      <div>
                        Brand tìm được:{" "}
                        <span className="text-slate-200">
                          {d.brandAnchorsFound.length > 0 ? d.brandAnchorsFound.join(", ") : "— không có —"}
                        </span>
                      </div>
                      <div>
                        Quý tìm được:{" "}
                        <span className="text-slate-200">
                          {d.quarterAnchorsFound.length > 0 ? d.quarterAnchorsFound.join(", ") : "— không có —"}
                        </span>
                      </div>
                      <div>
                        Header "Hạng mục"/"Mã ngân sách": <span className="text-slate-200">{d.headerSectionsFound} hàng</span>
                      </div>
                      <div>
                        Khối "TGĐ DUYỆT NGÂN SÁCH": <span className="text-slate-200">{d.tgdBlocksFound} khối</span>
                      </div>
                    </div>
                    {d.headerSectionsDetail.length > 0 && (
                      <div className="mt-2 text-slate-400">
                        Vị trí header:{" "}
                        <span className="text-slate-200">{d.headerSectionsDetail.join(" | ")}</span>
                      </div>
                    )}
                    {d.tgdBlockTitles.length > 0 && (
                      <div className="mt-2 text-slate-400">
                        Tiêu đề khối: <span className="text-slate-200">{d.tgdBlockTitles.join(" | ")}</span>
                      </div>
                    )}
                    {d.monthColsPerBlock.length > 0 && (
                      <ul className="mt-2 list-inside list-disc space-y-1 text-slate-400">
                        {d.monthColsPerBlock.map((m, i) => (
                          <li key={i}>{m}</li>
                        ))}
                      </ul>
                    )}
                    <div className="mt-2 text-slate-400">
                      Số dòng dữ liệu (có Mã ngân sách) đã quét:{" "}
                      <span className="text-slate-200">{d.dataRowsScanned}</span>
                    </div>
                    {d.dataPreview.length > 0 && (
                      <div className="mt-2">
                        <div className="text-slate-400">Preview dữ liệu thô (để soi lệch cột/hàng):</div>
                        <ul className="mt-1 list-inside list-disc space-y-1 font-mono text-[11px] text-slate-300">
                          {d.dataPreview.map((p, i) => (
                            <li key={i}>{p}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {d.note && (
                      <div className="mt-2 rounded border border-amber-500/30 bg-amber-500/10 p-2 text-amber-300">
                        ⚠ {d.note}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </details>
          )}

          {result.skipped > 0 && (
            <div className="mt-5 overflow-x-auto rounded-lg border border-slate-700">
              <table className="w-full text-sm">
                <thead className="bg-slate-800 text-slate-300">
                  <tr>
                    <th className="p-2 text-left">Sheet</th>
                    <th className="p-2 text-left">Brand</th>
                    <th className="p-2 text-left">Quý</th>
                    <th className="p-2 text-left">Hạng mục</th>
                    <th className="p-2 text-left">Mã ngân sách</th>
                    <th className="p-2 text-left">Tháng</th>
                    <th className="p-2 text-right">Số tiền</th>
                    <th className="p-2 text-left">Lý do</th>
                  </tr>
                </thead>
                <tbody>
                  {result.results
                    .filter((r) => r.action === "skipped")
                    .map((r, i) => (
                      <tr key={i} className="border-t border-slate-700 text-slate-300">
                        <td className="p-2">{r.sheetName}</td>
                        <td className="p-2">{r.brand}</td>
                        <td className="p-2">{r.quarter}</td>
                        <td className="p-2">{r.hangMuc}</td>
                        <td className="p-2">{r.maNganSach}</td>
                        <td className="p-2">{r.thang}</td>
                        <td className="p-2 text-right">{r.soTien.toLocaleString("vi-VN")}</td>
                        <td className="p-2 text-red-300">{r.reason}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-300">Lịch sử import gần đây</h3>
          <button
            className="text-xs text-slate-400 hover:text-slate-200"
            onClick={loadRecentBatches}
            disabled={loadingBatches}
          >
            {loadingBatches ? "Đang tải..." : "↻ Làm mới"}
          </button>
        </div>

        {recentBatches.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Chưa có lần import nào.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-700">
            {recentBatches.map((b) => (
              <li key={b.batchId} className="flex items-center justify-between py-3">
                <div>
                  <div className="text-sm text-slate-200">{new Date(b.timestamp).toLocaleString("vi-VN")}</div>
                  <div className="text-xs text-slate-500">
                    Tạo mới {b.created} · Cập nhật {b.updated} · Tổng {b.totalRecords} record
                  </div>
                </div>
                <button
                  className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                  onClick={() => handleUndo(b.batchId)}
                  disabled={undoingBatchId === b.batchId}
                >
                  {undoingBatchId === b.batchId ? "Đang hoàn tác..." : "↩ Hoàn tác"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}