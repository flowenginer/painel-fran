import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";

import { cn } from "@/lib/utils";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";

const STORAGE_KEY = "sidebar-colapsada";

export function AppLayout() {
  const { pathname } = useLocation();
  // Conversas (inbox) ocupa a tela inteira, sem o container central.
  const fullBleed = pathname.startsWith("/conversas");

  const [colapsado, setColapsado] = useState(
    () => localStorage.getItem(STORAGE_KEY) === "1",
  );

  function toggleSidebar() {
    setColapsado((v) => {
      const novo = !v;
      localStorage.setItem(STORAGE_KEY, novo ? "1" : "0");
      return novo;
    });
  }

  return (
    <div className="flex h-screen min-h-0 flex-col">
      <Header />
      <div className="flex min-h-0 flex-1">
        <aside
          className={cn(
            "hidden shrink-0 border-r transition-[width] duration-200 md:block",
            colapsado ? "w-16" : "w-60",
          )}
        >
          <Sidebar colapsado={colapsado} onToggle={toggleSidebar} />
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
