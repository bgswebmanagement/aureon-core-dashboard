import { Sidebar } from "@/components/Sidebar";
import { ownerNav } from "@/lib/nav";
import { getAlerts } from "@/lib/data";

// Render on every request instead of caching as static HTML at build time —
// once Supabase is live, hub/satellite data changes continuously.
export const dynamic = "force-dynamic";

export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  const alerts = await getAlerts();
  const activeCount = alerts.filter((a) => a.active).length;

  return (
    <div className="flex">
      <Sidebar base="/proprietario" role="Proprietário" items={ownerNav("/proprietario")} alertCount={activeCount} />
      <div className="min-h-screen flex-1">{children}</div>
    </div>
  );
}
