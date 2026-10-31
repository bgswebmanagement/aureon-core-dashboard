import { ConsentGrant, Hub, ViewerRole } from "@/lib/types";
import { isCategoryVisible } from "@/lib/consent";
import { statusDot } from "@/lib/ui";
import { formatReading, VOC_WARMING_UP_LABEL } from "@/lib/readings";
import { IconLock } from "./icons";

// Displays the single Hub installed at a property — one card per property,
// not one per room (the Hub's onboard sensors measure ambient conditions
// from wherever it's plugged in).
// The sound level is a restricted category: an owner only sees it once the
// tenant has granted consent (lib/consent.ts); tenants and admins always do.
export function HubCard({
  hub,
  viewerRole = "tenant",
  consentGrants = []
}: {
  hub: Hub;
  viewerRole?: ViewerRole;
  consentGrants?: ConsentGrant[];
}) {
  const soundVisible = isCategoryVisible(viewerRole, "sound", consentGrants);
  return (
    <div className="rounded-xl border border-border bg-panel p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${statusDot(hub.status)}`} />
          <span className="font-medium">Hub — {hub.location}</span>
        </div>
        <span className={`text-xs ${hub.online ? "text-good" : "text-muted"}`}>{hub.online ? "Online" : "Offline"}</span>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2 text-sm">
        <div>
          <div className="text-[11px] text-muted">TEMP</div>
          <div className="font-semibold">{formatReading(hub.temperature, "°C")}</div>
        </div>
        <div>
          <div className="text-[11px] text-muted">HUM</div>
          <div className="font-semibold">{formatReading(hub.humidity, "%")}</div>
        </div>
        <div>
          <div className="text-[11px] text-muted">VOC</div>
          <div className="font-semibold">{formatReading(hub.voc)}</div>
          {hub.voc == null && <div className="text-[10px] text-muted">{VOC_WARMING_UP_LABEL}</div>}
        </div>
        <div>
          <div className="text-[11px] text-muted">SOM</div>
          {soundVisible ? (
            <div className="font-semibold">{hub.sound_dbfs != null ? `${hub.sound_dbfs} dBFS` : "—"}</div>
          ) : (
            <div className="flex items-center gap-1 text-xs text-muted" title="Requer autorização do inquilino">
              <IconLock className="h-3 w-3" /> Restrito
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
