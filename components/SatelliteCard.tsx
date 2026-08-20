import { ConsentGrant, RestrictedCategory, Satellite, ViewerRole } from "@/lib/types";
import { relativeTime } from "@/lib/ui";
import { FIXED_NOW } from "@/lib/seed";
import { IconDoor, IconDroplet, IconLock, IconMotion } from "./icons";

const RESTRICTED: RestrictedCategory[] = ["motion", "doorWindow"];

// Displays one battery-powered Remote Sensor Node (satellite). These are
// event-based — they don't have a continuous temperature/humidity feed like
// the Hub does, so this card shows capability badges and the last event
// instead of a live reading.
//
// Privacy: motion and door/window are presence/behaviour data, not
// property-damage data. Tenants and Aureon Core admin staff always see
// everything; an owner/agency only sees these categories once the tenant
// has granted consent (consentGrants) — leak is never restricted, since the
// owner always needs to know about property damage.
export function SatelliteCard({
  satellite,
  viewerRole = "tenant",
  consentGrants = []
}: {
  satellite: Satellite;
  viewerRole?: ViewerRole;
  consentGrants?: ConsentGrant[];
}) {
  const hasLeakAlert = satellite.capabilities.includes("leak") && satellite.leakState === "alert";

  const isVisible = (category: RestrictedCategory) =>
    viewerRole !== "owner" || consentGrants.some((g) => g.category === category && g.active);

  const hasHiddenCategory =
    viewerRole === "owner" &&
    satellite.capabilities.some((c) => RESTRICTED.includes(c as RestrictedCategory) && !isVisible(c as RestrictedCategory));

  return (
    <div className={`rounded-xl border p-4 ${hasLeakAlert ? "border-crit/40 bg-crit/10" : "border-border bg-panel"}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${hasLeakAlert ? "bg-crit" : "bg-good"}`} />
          <span className="font-medium">{satellite.label}</span>
        </div>
        <span className="text-xs text-muted">{satellite.battery}% bat.</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted">
        {satellite.capabilities.includes("leak") && (
          <span className={`flex items-center gap-1.5 ${hasLeakAlert ? "text-crit" : ""}`}>
            <IconDroplet className="h-3.5 w-3.5" /> {hasLeakAlert ? "Fuga detetada" : "Sem fuga"}
          </span>
        )}
        {satellite.capabilities.includes("motion") &&
          (isVisible("motion") ? (
            <span className="flex items-center gap-1.5">
              <IconMotion className="h-3.5 w-3.5" /> Movimento
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-muted/60" title="Requer autorização do inquilino">
              <IconLock className="h-3.5 w-3.5" /> Movimento
            </span>
          ))}
        {satellite.capabilities.includes("doorWindow") &&
          satellite.doorWindowState &&
          (isVisible("doorWindow") ? (
            <span className="flex items-center gap-1.5">
              <IconDoor className="h-3.5 w-3.5" /> {satellite.doorWindowState}
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-muted/60" title="Requer autorização do inquilino">
              <IconLock className="h-3.5 w-3.5" /> Porta/Janela
            </span>
          ))}
      </div>

      <div className="mt-3 border-t border-border pt-2 text-[11px] text-muted">
        {hasHiddenCategory ? (
          <span className="flex items-center gap-1.5">
            <IconLock className="h-3 w-3" /> Requer autorização do inquilino para ver detalhes
          </span>
        ) : (
          <>Último evento: {relativeTime(satellite.lastEventAt, FIXED_NOW)}</>
        )}
      </div>
    </div>
  );
}
