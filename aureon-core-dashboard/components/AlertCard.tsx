import { Alert, Insight } from "@/lib/types";
import { formatDateTime, severityColor, severityLabel } from "@/lib/ui";
import { IconAlert, IconBulb } from "./icons";

export function AlertCard({ alert, propertyName, deviceLabel }: { alert: Alert; propertyName?: string; deviceLabel?: string }) {
  return (
    <div className="rounded-xl border border-border bg-panel p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${severityColor(alert.severity)}`}>
            <IconAlert className="h-4 w-4" />
          </div>
          <div>
            <div className="font-semibold">{alert.title}</div>
            <div className="mt-0.5 text-sm text-muted">{alert.message}</div>
            {(propertyName || deviceLabel) && (
              <div className="mt-1 text-xs text-muted">
                {propertyName}
                {propertyName && deviceLabel ? " · " : ""}
                {deviceLabel}
              </div>
            )}
          </div>
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs ${severityColor(alert.severity)}`}>
          {severityLabel(alert.severity)}
        </span>
      </div>
      <div className="mt-3 flex items-center gap-2 border-t border-border pt-2 text-xs text-muted">
        <span className="rounded-full border border-border px-2 py-0.5">{alert.tag}</span>
        <span>{formatDateTime(alert.createdAt)}</span>
      </div>
    </div>
  );
}

export function InsightCard({ insight }: { insight: Insight }) {
  return (
    <div className="rounded-xl border border-border bg-panel p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${severityColor(insight.severity)}`}>
            <IconAlert className="h-4 w-4" />
          </div>
          <div>
            <div className="font-semibold">{insight.title}</div>
            <div className="mt-0.5 text-sm text-muted">{insight.message}</div>
          </div>
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs ${severityColor(insight.severity)}`}>
          {severityLabel(insight.severity)}
        </span>
      </div>
      <div className="mt-3 flex items-start gap-2 rounded-lg bg-white/5 p-2.5 text-sm">
        <IconBulb className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        {insight.recommendation}
      </div>
      <div className="mt-3 flex items-center gap-2 border-t border-border pt-2 text-xs text-muted">
        <span className="rounded-full border border-border px-2 py-0.5">{insight.tag}</span>
        <span>{formatDateTime(insight.createdAt)}</span>
      </div>
    </div>
  );
}
