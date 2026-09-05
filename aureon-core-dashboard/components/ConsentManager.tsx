"use client";

import { useState } from "react";
import { ConsentGrant, RestrictedCategory } from "@/lib/types";
import { formatDateTime } from "@/lib/ui";
import { IconDoor, IconLock, IconMotion, IconUnlock } from "./icons";

const CATEGORY_LABEL: Record<RestrictedCategory, string> = {
  motion: "Movimento",
  doorWindow: "Porta/Janela"
};

const CATEGORY_ICON: Record<RestrictedCategory, (p: { className?: string }) => JSX.Element> = {
  motion: IconMotion,
  doorWindow: IconDoor
};

const CATEGORY_EXPLANATION: Record<RestrictedCategory, string> = {
  motion:
    "Deteta presença/atividade na divisão (ex.: casa de banho). Útil em disputas de ruído ou atividade fora de horas.",
  doorWindow: "Regista abertura e fecho de portas/janelas. Útil para disputas de acesso ou segurança."
};

// Client-side toggle for the tenant's privacy controls. This is intentionally
// visual/optimistic for now: there's no persistence layer until Supabase is
// configured (see supabase/schema.sql's consent_grants table). Once live,
// this should call a Server Action / API route that writes to that table
// instead of just flipping local state.
export function ConsentManager({
  propertyId,
  categories,
  initialGrants,
  isLiveMode
}: {
  propertyId: string;
  categories: RestrictedCategory[];
  initialGrants: ConsentGrant[];
  isLiveMode: boolean;
}) {
  const [grants, setGrants] = useState(initialGrants);
  const [reasonDraft, setReasonDraft] = useState<Record<string, string>>({});

  const grantFor = (category: RestrictedCategory) => grants.find((g) => g.category === category && g.active);

  function grant(category: RestrictedCategory) {
    const reason = reasonDraft[category]?.trim();
    setGrants((prev) => [
      ...prev.filter((g) => g.category !== category),
      {
        id: `local-${category}-${prev.length}`,
        propertyId,
        category,
        reason: reason || undefined,
        grantedAt: new Date().toISOString(),
        active: true
      }
    ]);
  }

  function revoke(category: RestrictedCategory) {
    setGrants((prev) => prev.map((g) => (g.category === category ? { ...g, active: false } : g)));
  }

  return (
    <div className="space-y-4">
      {!isLiveMode && (
        <div className="rounded-xl border border-border bg-panel2 p-3 text-xs text-muted">
          Modo demo — estas alterações não são guardadas de forma permanente ainda. Assim que o Supabase estiver
          ligado, ficam registadas na tabela <code className="rounded bg-white/10 px-1">consent_grants</code>.
        </div>
      )}

      {categories.map((category) => {
        const active = grantFor(category);
        const Icon = CATEGORY_ICON[category];
        return (
          <div key={category} className="rounded-xl border border-border bg-panel p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div
                  className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    active ? "bg-good/10 text-good" : "bg-white/10 text-muted"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <div className="font-semibold">{CATEGORY_LABEL[category]}</div>
                  <div className="mt-0.5 text-sm text-muted">{CATEGORY_EXPLANATION[category]}</div>
                  {active ? (
                    <div className="mt-2 text-xs text-good">
                      <div className="flex items-center gap-1.5">
                        <IconUnlock className="h-3.5 w-3.5" /> Autorizado desde {formatDateTime(active.grantedAt)}
                      </div>
                      {active.reason && <div className="mt-0.5 text-muted">Motivo: {active.reason}</div>}
                    </div>
                  ) : (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-muted">
                      <IconLock className="h-3.5 w-3.5" /> Não autorizado — o proprietário não vê estes dados
                    </div>
                  )}
                </div>
              </div>

              {active ? (
                <button
                  onClick={() => revoke(category)}
                  className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:border-crit/40 hover:text-crit"
                >
                  Revogar
                </button>
              ) : (
                <button
                  onClick={() => grant(category)}
                  className="shrink-0 rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs text-accent hover:bg-accent/20"
                >
                  Autorizar
                </button>
              )}
            </div>

            {!active && (
              <div className="mt-3 border-t border-border pt-3">
                <label className="text-xs text-muted">Motivo (opcional, ex.: &quot;disputa de ruído — Agosto 2026&quot;)</label>
                <input
                  type="text"
                  value={reasonDraft[category] ?? ""}
                  onChange={(e) => setReasonDraft((prev) => ({ ...prev, [category]: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-border bg-panel2 px-3 py-1.5 text-sm text-white placeholder:text-muted/60 focus:border-accent/50 focus:outline-none"
                  placeholder="Ex.: partilhar durante a resolução de uma disputa"
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
