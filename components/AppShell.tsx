"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import TakeoffTab from "./TakeoffTab";
import DataUnitTab from "./DataUnitTab";

type TabKey = "takeoff" | "data-unit";

export default function AppShell() {
  const [tab, setTab] = useState<TabKey>("takeoff");
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-900">Triune Takeoff Haldeman</h1>
            <p className="text-xs text-slate-500">Convert raw takeoff to Triune format</p>
          </div>
          <button
            onClick={logout}
            className="text-sm text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded-md border border-slate-300 hover:bg-slate-50"
          >
            Sign out
          </button>
        </div>
        <nav className="max-w-7xl mx-auto px-4 flex gap-1">
          <TabButton active={tab === "takeoff"} onClick={() => setTab("takeoff")}>
            Triune Takeoff Haldeman
          </TabButton>
          <TabButton active={tab === "data-unit"} onClick={() => setTab("data-unit")}>
            Data Unit Sheet
          </TabButton>
        </nav>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {tab === "takeoff" ? <TakeoffTab /> : <DataUnitTab />}
      </main>
    </div>
  );
}

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
        active
          ? "border-blue-600 text-blue-700"
          : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
      }`}
    >
      {children}
    </button>
  );
}
