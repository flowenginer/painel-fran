import { Outlet } from "react-router-dom";

import { Header } from "./Header";
import { Sidebar } from "./Sidebar";

export function AppLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <div className="flex flex-1">
        {/* Sidebar fixa em desktop; mobile usa o Sheet no Header */}
        <aside className="hidden w-60 shrink-0 border-r md:block">
          <Sidebar />
        </aside>
        <main className="flex-1 overflow-x-hidden">
          <div className="container mx-auto max-w-7xl p-4 md:p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
