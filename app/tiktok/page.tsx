import TiktokImportPanel from "@/app/components/TiktokImportPanel";

export default function TiktokPage() {
    return (
        <div className="mx-auto max-w-5xl space-y-8 px-6 py-8 lg:px-8 lg:py-10">
            <div>
                <h1 className="text-4xl font-bold tracking-tight">🎵 TikTok Metrics</h1>
                <p className="mt-3 text-base text-slate-400">
                    Đọc chỉ số cơ bản từ profile TikTok rồi import trực tiếp vào Lark Base.
                </p>
            </div>

            <TiktokImportPanel />
        </div>
    );
}
