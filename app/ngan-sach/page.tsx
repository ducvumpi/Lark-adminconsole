import type { Metadata } from "next";
import BudgetWorkspace from "./workspace";
import "./budget.css";

export const metadata: Metadata = { title: "Ngân sách · A03", description: "Theo dõi ngân sách được duyệt, Lark Sheets và hồ sơ Approval." };
export default function BudgetPage() { return <BudgetWorkspace />; }
