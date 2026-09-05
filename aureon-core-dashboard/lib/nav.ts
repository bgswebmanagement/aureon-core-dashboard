export type IconKey = "home" | "building" | "alert" | "bulb" | "chart" | "users" | "lock";

export type NavItem = {
  href: string;
  label: string;
  icon: IconKey;
};

// Plain functions (no "use client") so they can be called from server
// components (layout.tsx) as well as the client Sidebar. Icons are
// referenced by key rather than by component reference: passing an actual
// function component as a prop from a Server Component to a Client
// Component ("use client" Sidebar) isn't serializable across that boundary
// and fails at build time ("Functions cannot be passed directly to Client
// Components").
export function ownerNav(base: string): NavItem[] {
  return [
    { href: `${base}`, label: "Visão Geral", icon: "home" },
    { href: `${base}/dispositivos`, label: "Dispositivos", icon: "building" },
    { href: `${base}/alertas`, label: "Alertas", icon: "alert" },
    { href: `${base}/insights`, label: "Insights", icon: "bulb" },
    { href: `${base}/historico`, label: "Histórico", icon: "chart" },
    { href: `${base}/propriedades`, label: "Propriedades", icon: "building" },
    { href: `${base}/inquilinos`, label: "Inquilinos", icon: "users" }
  ];
}

export function tenantNav(base: string): NavItem[] {
  return [
    { href: `${base}`, label: "Visão Geral", icon: "home" },
    { href: `${base}/alertas`, label: "Alertas", icon: "alert" },
    { href: `${base}/insights`, label: "Insights", icon: "bulb" },
    { href: `${base}/historico`, label: "Histórico", icon: "chart" },
    { href: `${base}/privacidade`, label: "Privacidade", icon: "lock" }
  ];
}

// Aureon Core internal/operator nav — not linked from the public landing
// page (see app/page.tsx); reach it directly at /admin. Treat this the same
// way the Supabase table editor is treated today: full-fleet visibility for
// support/operations, not gated by tenant consent the way an owner is.
export function adminNav(base: string): NavItem[] {
  return [
    { href: `${base}`, label: "Visão Geral", icon: "home" },
    { href: `${base}/dispositivos`, label: "Dispositivos", icon: "building" },
    { href: `${base}/propriedades`, label: "Propriedades", icon: "building" },
    { href: `${base}/alertas`, label: "Alertas", icon: "alert" },
    { href: `${base}/consentimentos`, label: "Consentimentos", icon: "lock" }
  ];
}
