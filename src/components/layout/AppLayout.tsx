import { Outlet, useLocation } from "react-router-dom";

import { Header } from "./Header";
import { Sidebar } from "./Sidebar";

export function AppLayout() {
  const { pathname } = useLocation();
  // Conversas (CRM chat) ocupa a tela inteira, sem o container central.
  const fullBleed = pathname.startsWith("/conversas");

  return (
    <div className="flex h-screen min-h-0 flex-col">
      <Header />
      <div className="flex min-h-0 flex-1">
        {/* Sidebar fixa em desktop; mobile usa o Sheet no Header */}
        <aside className="hidden w-60 shrink-0 border-r md:block">
          <Sidebar />
        </aside>
        <main className="min-h-0 flex-1 overflow-x-hidden">
          {fullBleed ? (
            <div className="h-full">
              <Outlet />
            </div>
          ) : (
            <div className="h-full overflow-y-auto">
              <div className="container mx-auto max-w-7xl p-4 md:p-6">
                <Outlet />
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
