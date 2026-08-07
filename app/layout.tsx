import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Lark Base Manager",
  description: "Quản lý và import dữ liệu vào Lark Base",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <head> <script src="https://cdn.botpress.cloud/webchat/v3.7/inject.js"></script>
        <script src="https://files.bpcontent.cloud/2025/12/11/08/20251211081314-GCM8M5CS.js" defer></script></head>

      <body className="app-body">{children}</body>


    </html>

  );
}
