import clsx from "clsx";

export function StatCard({
  icon,
  value,
  label,
  sublabel,
  tone = "default"
}: {
  icon: React.ReactNode;
  value: React.ReactNode;
  label: string;
  sublabel?: string;
  tone?: "default" | "good" | "warn" | "crit" | "accent";
}) {
  const toneClass =
    tone === "good"
      ? "text-good bg-good/10"
      : tone === "warn"
      ? "text-warn bg-warn/10"
      : tone === "crit"
      ? "text-crit bg-crit/10"
      : tone === "accent"
      ? "text-accent bg-accent/10"
      : "text-white bg-white/10";

  return (
    <div className="rounded-xl border border-border bg-panel p-5">
      <div className={clsx("mb-3 flex h-9 w-9 items-center justify-center rounded-lg", toneClass)}>
        {icon}
      </div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="mt-0.5 text-sm text-white/90">{label}</div>
      {sublabel && <div className="mt-0.5 text-xs text-muted">{sublabel}</div>}
    </div>
  );
}
