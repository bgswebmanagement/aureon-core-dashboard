import type { IconKey } from "@/lib/nav";

// Minimal inline icon set (no external icon package needed).
export function IconHome(p: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={p.className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 11.5 12 4l9 7.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
export function IconBuilding(p: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={p.className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="3" width="10" height="18" rx="1" />
      <rect x="14" y="8" width="6" height="13" rx="1" />
      <path d="M7 7h1M10 7h1M7 11h1M10 11h1M7 15h1M10 15h1" strokeLinecap="round" />
    </svg>
  );
}
export function IconAlert(p: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={p.className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3 2 20h20L12 3Z" strokeLinejoin="round" />
      <path d="M12 9v5" strokeLinecap="round" />
      <circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}
export function IconBulb(p: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={p.className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M9 18h6M10 21h4" strokeLinecap="round" />
      <path d="M12 3a6 6 0 0 0-3.5 10.9c.6.45 1 1.15 1 1.95V17h5v-1.15c0-.8.4-1.5 1-1.95A6 6 0 0 0 12 3Z" />
    </svg>
  );
}
export function IconChart(p: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={p.className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
export function IconUsers(p: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={p.className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="9" cy="8" r="3.2" />
      <path d="M2.5 20c1-3.6 3.6-5.5 6.5-5.5s5.5 1.9 6.5 5.5" strokeLinecap="round" />
      <path d="M16 8.2a3 3 0 1 1 3.6 4.9" />
      <path d="M15 14.6c2.4.3 4.3 2 5.1 5.4" strokeLinecap="round" />
    </svg>
  );
}
export function IconShield(p: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={p.className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3 4 6v6c0 5 3.4 8.4 8 9 4.6-.6 8-4 8-9V6l-8-3Z" strokeLinejoin="round" />
      <path d="m9 12 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
export function IconThermo(p: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={p.className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M14 14.76V5a2 2 0 1 0-4 0v9.76a4 4 0 1 0 4 0Z" />
    </svg>
  );
}
export function IconDroplet(p: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={p.className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3s6 6.5 6 11a6 6 0 1 1-12 0c0-4.5 6-11 6-11Z" strokeLinejoin="round" />
    </svg>
  );
}
export function IconWind(p: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={p.className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 8h11a2.5 2.5 0 1 0-2.2-3.7" strokeLinecap="round" />
      <path d="M3 13h15a2.5 2.5 0 1 1-2.2 3.7" strokeLinecap="round" />
      <path d="M3 18h8a2 2 0 1 1-1.8 2.9" strokeLinecap="round" />
    </svg>
  );
}
export function IconChevron(p: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={p.className} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
export const ICONS: Record<IconKey, (p: { className?: string }) => JSX.Element> = {
  home: IconHome,
  building: IconBuilding,
  alert: IconAlert,
  bulb: IconBulb,
  chart: IconChart,
  users: IconUsers,
  lock: IconLock
};

export function IconDownload(p: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={p.className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3v12M7 10l5 5 5-5M4 21h16" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Motion satellite capability (PIR-style radiating waves).
export function IconMotion(p: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={p.className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" />
      <path d="M7.5 8a6.5 6.5 0 0 0 0 8M16.5 8a6.5 6.5 0 0 1 0 8" strokeLinecap="round" />
      <path d="M4.5 5a10.5 10.5 0 0 0 0 14M19.5 5a10.5 10.5 0 0 1 0 14" strokeLinecap="round" />
    </svg>
  );
}

// Door/window satellite capability.
export function IconDoor(p: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={p.className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="5" y="3" width="12" height="18" rx="1" />
      <circle cx="13.5" cy="12" r="0.9" fill="currentColor" stroke="none" />
      <path d="M17 3h2v18h-2" strokeLinecap="round" />
    </svg>
  );
}

// Locked/restricted data (requires tenant consent to unlock).
export function IconLock(p: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={p.className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="5" y="11" width="14" height="9" rx="1.5" />
      <path d="M8 11V7.5a4 4 0 0 1 8 0V11" strokeLinecap="round" />
      <circle cx="12" cy="15.3" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

// Shield/consent (granted access).
export function IconUnlock(p: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={p.className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="5" y="11" width="14" height="9" rx="1.5" />
      <path d="M8 11V7.5a4 4 0 0 1 7.5-1.9" strokeLinecap="round" />
      <circle cx="12" cy="15.3" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}
