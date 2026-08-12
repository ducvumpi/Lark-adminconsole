"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { logoutAction } from "@/app/lib/action";

// const LINKS = [
//   { href: "/", label: "Tổng quan" },
//   { href: "/chat", label: "Chat MCP" },
//   { href: "/fields", label: "Danh sách cột" },
//   { href: "/records", label: "Dữ liệu (Records)" },
//   { href: "/import", label: "Import Excel" },
//   { href: "/tiktok", label: "TikTok Metrics" },
//   { href: "/caidat", label: "Cài đặt" },
// ];

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await logoutAction();
    router.push("/login");
    router.refresh();
  }

  return (
    <nav className="sidebar">
      <div className="sidebar-title">🗂 Lark Base Manager</div>
      {/* {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={`nav-link ${pathname === link.href ? "active" : ""}`}
        >
          {link.label}
        </Link>
      ))} */}
      <div className="sidebar-footer">
        <button className="btn btn-sm" style={{ width: "100%" }} onClick={handleLogout}>
          Đăng xuất
        </button>
      </div>
    </nav>
  );
}