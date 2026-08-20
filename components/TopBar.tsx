"use client";

import { useEffect, useState } from "react";
import { IconAlert } from "./icons";

export function TopBar({
  title,
  subtitle,
  role,
  alertCount
}: {
  title: string;
  subtitle?: string;
  role: "Proprietário" | "Inquilino" | "Aureon Core";
  alertCount: number;
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const h = String(Math.floor(elapsed / 3600)).padStart(2, "0");
  const m = String(Math.floor((elapsed % 3600) / 60)).padStart(2, "0");
  const s = String(elapsed % 60).padStart(2, "0");

  return (
    <div className="no-print sticky top-0 z-10 flex items-center justify-between border-b border-border bg-bg/90 px-6 py-3 backdrop-blur">
      <div>
        <h1 className="text-lg font-semibold">{title}</h1>
        {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-4">
        <div className="hidden items-center gap-2 rounded-full border border-good/30 bg-good/10 px-3 py-1 text-xs text-good sm:flex">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-good" />
          Ao Vivo
          <span className="text-muted">
            {h}:{m}:{s}
          </span>
        </div>
        <div className="relative">
          <IconAlert className="h-5 w-5 text-muted" />
          {alertCount > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-crit px-1 text-[10px] font-semibold">
              {alertCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-xs">
            {role === "Proprietário" ? "P" : role === "Inquilino" ? "I" : "A"}
          </span>
          <span className="hidden sm:inline">{role}</span>
        </div>
      </div>
    </div>
  );
}
