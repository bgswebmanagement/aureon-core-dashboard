import { Hub } from "@/lib/types";
import { statusDot } from "@/lib/ui";

// Displays the single Hub installed at a property — one card per property,
// not one per room (the Hub's onboard sensors measure ambient conditions
// from wherever it's plugged in).
export function HubCard({ hub }: { hub: Hub }) {
  return (
    <div className="rounded-xl border border-border bg-panel p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${statusDot(hub.status)}`} />
          <span className="font-medium">Hub — {hub.location}</span>
        </div>
        <span className={`text-xs ${hub.online ? "text-good" : "text-muted"}`}>{hub.online ? "Online" : "Offline"}</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
        <div>
          <div className="text-[11px] text-muted">TEMP</div>
          <div className="font-semibold">{hub.temperature}°C</div>
        </div>
        <div>
          <div className="text-[11px] text-muted">HUM</div>
          <div className="font-semibold">{hub.humidity}%</div>
        </div>
        <div>
          <div className="text-[11px] text-muted">VOC</div>
          <div className="font-semibold">{hub.voc}</div>
        </div>
      </div>
    </div>
  );
}
