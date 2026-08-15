import type { ReactNode } from "react";
import Sidebar from "./Sidebar";
import BottomNav from "./BottomNav";

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh bg-paper text-ink font-sans">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 pb-24 lg:pb-12">{children}</main>
      </div>
      <BottomNav />
    </div>
  );
}
