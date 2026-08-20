import Link from "next/link";
import { Hub, Property, Satellite, Tenant } from "@/lib/types";
import { statusColor, statusLabel } from "@/lib/ui";
import { IconBuilding, IconChevron } from "./icons";

export function PropertyCard({
  property,
  hub,
  satellites,
  tenant,
  href,
  activeAlerts
}: {
  property: Property;
  hub?: Hub;
  satellites: Satellite[];
  tenant?: Tenant;
  href: string;
  activeAlerts: number;
}) {
  return (
    <Link
      href={href}
      className="block rounded-xl border border-border bg-panel p-5 transition-colors hover:border-accent/40"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white/80">
            <IconBuilding className="h-4 w-4" />
          </div>
          <div>
            <div className="font-semibold">{property.name}</div>
            <div className="text-xs text-muted">
              {property.address} — {property.city}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full border px-2.5 py-0.5 text-xs ${statusColor(property.status)}`}>
            {statusLabel(property.status)}
          </span>
          <IconChevron className="h-4 w-4 text-muted" />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-4 text-sm">
        <div>
          <div className="text-xs text-muted">Temperatura</div>
          <div className="font-semibold">{hub ? `${hub.temperature}°C` : "—"}</div>
        </div>
        <div>
          <div className="text-xs text-muted">Humidade</div>
          <div className="font-semibold">{hub ? `${hub.humidity}%` : "—"}</div>
        </div>
        <div>
          <div className="text-xs text-muted">VOC</div>
          <div className="font-semibold">{hub ? hub.voc : "—"}</div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-xs text-muted">
        <span>
          {satellites.length} satélite{satellites.length !== 1 ? "s" : ""} {tenant && <>· {tenant.name}</>}
        </span>
        {activeAlerts > 0 && <span className="text-warn">{activeAlerts} alerta{activeAlerts > 1 ? "s" : ""} ativo{activeAlerts > 1 ? "s" : ""}</span>}
      </div>
    </Link>
  );
}
