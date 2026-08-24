import { Sidebar } from "@/components/Sidebar";
import { adminNav } from "@/lib/nav";
import { getAlerts } from "@/lib/data";

// Force this whole route segment (and every page under /admin) to render on
// every request instead of being cached as static HTML at build time — once
// Supabase is live, data changes constantly (new hub readings, satellite
// events) and a static build would freeze the dashboard at whatever the data
// looked like at deploy time.
export const dynamic = "force-dynamic";

// Aureon Core's own operator view. Deliberately NOT linked from app/page.tsx
// (the public landing page) — only reachable by going directly to /admin.
// Same full-fleet-visibility philosophy Bruno already has today via the raw
// Supabase Table Editor (which bypasses Row Level Security via the service
// role): nothing here is restricted by tenant consent the way the owner
// dashboard is.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const alerts = await getAlerts();
  const activeCount = alerts.filter((a) => a.active).length;

  return (
    <div className="flex">
      <Sidebar base="/admin" role="Aureon Core" items={adminNav("/admin")} alertCount={activeCount} />
      <div className="min-h-screen flex-1">{children}</div>
    </div>
  );
}
