import { ConsentGrant, RestrictedCategory, SatelliteEvent, ViewerRole } from "./types";

// Categories of satellite data that reveal presence/behaviour rather than
// property damage — these are hidden from the owner by default and only
// shown once the tenant has explicitly granted access for that category
// (see ConsentGrant in lib/types.ts). Leak is intentionally NOT here: it's
// a property-damage signal the owner always needs, regardless of consent.
const RESTRICTED_CATEGORIES: RestrictedCategory[] = ["motion", "doorWindow"];

export function isRestrictedCategory(type: string): type is RestrictedCategory {
  return (RESTRICTED_CATEGORIES as string[]).includes(type);
}

// Tenants and Aureon Core admin staff always see everything about a home.
// Owners/agencies only see a restricted category once the tenant has an
// active grant for it.
export function isCategoryVisible(viewerRole: ViewerRole, category: string, grants: ConsentGrant[]): boolean {
  if (viewerRole !== "owner") return true;
  if (!isRestrictedCategory(category)) return true;
  return grants.some((g) => g.category === category && g.active);
}

export function filterEventsForViewer(
  events: SatelliteEvent[],
  viewerRole: ViewerRole,
  grants: ConsentGrant[]
): SatelliteEvent[] {
  return events.filter((e) => isCategoryVisible(viewerRole, e.type, grants));
}
