"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { ICONS, IconShield } from "./icons";
import type { NavItem } from "@/lib/nav";

export function Sidebar({
  base,
  role,
  items,
  alertCount
}: {
  base: string;
  role: "Proprietário" | "Inquilino" | "Aureon Core";
  items: NavItem[];
  alertCount: number;
}) {
  const pathname = usePathname();

  return (
    <aside className="no-print flex h-screen w-64 flex-col border-r border-border bg-panel">
      <div className="flex items-center gap-2 border-b border-border px-5 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15 text-accent">
          <IconShield className="h-5 w-5" />
        </div>
        <div>
          <div className="text-sm font-semibold leading-tight">Aureon</div>
          <div className="text-[10px] tracking-widest text-muted">CORE</div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          const isAlerts = item.href.endsWith("/alertas");
          const Icon = ICONS[item.icon];
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors",
                active ? "bg-accent/15 text-accent" : "text-muted hover:bg-white/5 hover:text-white"
              )}
            >
              <span className="flex items-center gap-3">
                <Icon className="h-4 w-4" />
                {item.label}
              </span>
              {isAlerts && alertCount > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-crit px-1 text-[11px] font-semibold text-white">
                  {alertCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-3">
        <div className="rounded-xl border border-border bg-panel2 p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium">Hub Local</span>
            <span className="flex items-center gap-1 text-good">
              <span className="h-1.5 w-1.5 rounded-full bg-good" /> Online
            </span>
          </div>
          <div className="mt-1 text-[11px] text-muted">Aureon Core · Local</div>
        </div>
      </div>
    </aside>
  );
}
