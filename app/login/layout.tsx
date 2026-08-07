import Nav from "@/app/components/Nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <Nav />
      <main className="main">{children}</main>
    </div>
  );
}