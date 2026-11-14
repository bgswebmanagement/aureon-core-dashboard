"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setConsent } from "@/app/inquilino/privacidade/actions";
import { ConsentGrant, RestrictedCategory } from "@/lib/types";
import { formatDateTime } from "@/lib/ui";
import { IconDoor, IconLock, IconMotion, IconSound, IconUnlock } from "./icons";

const CATEGORY_LABEL: Record<RestrictedCategory, string> = {
  motion: "Movimento",
  doorWindow: "Porta/Janela",
  sound: "Nível de ruído relativo"
};

const CATEGORY_ICON: Record<RestrictedCategory, (p: { className?: string }) => JSX.Element> = {
  motion: IconMotion,
  doorWindow: IconDoor,
  sound: IconSound
};

const CATEGORY_EXPLANATION: Record<RestrictedCategory, string> = {
  motion:
    "Deteta presença/atividade na divisão (ex.: casa de banho). Útil em disputas de ruído ou atividade fora de horas.",
  doorWindow: "Regista abertura e fecho de portas/janelas. Útil para disputas de acesso ou segurança.",
  sound:
    "Nível de ruído relativo (dBFS) do hub: nível médio, máximo e segundos acima de um limiar, a cada 10 minutos. São apenas números — nunca é gravado áudio. Útil em disputas de ruído."
};

// Controlo de privacidade do inquilino. O estado vem SEMPRE do servidor (as
// autorizações reais em consent_grants); cada clique chama a ação do servidor
// `setConsent`, que grava com a sessão do inquilino, e depois a página
// recarrega (router.refresh). A casa nunca é enviada daqui: o servidor usa a
// casa da sessão. Sem prazo no piloto: o inquilino retira quando quiser.
export function ConsentManager({
  categories,
  initialGrants
}: {
  categories: RestrictedCategory[];
  initialGrants: ConsentGrant[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reasonDraft, setReasonDraft] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const grants = initialGrants;
  const grantFor = (category: RestrictedCategory) => grants.find((g) => g.category === category && g.active);

  function change(category: RestrictedCategory, action: "grant" | "revoke") {
    setFeedback(null);
    startTransition(async () => {
      try {
        const result = await setConsent(category, action, action === "grant" ? reasonDraft[category] ?? "" : undefined);
        setFeedback(result.ok ? { ok: true, text: result.message ?? "Guardado." } : { ok: false, text: result.error ?? "Não foi possível guardar." });
      } catch {
        setFeedback({ ok: false, text: "Não foi possível guardar. Tente novamente." });
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {feedback && (
        <div
          role={feedback.ok ? "status" : "alert"}
          className={`rounded-xl border p-3 text-sm ${feedback.ok ? "border-good/40 bg-good/10 text-good" : "border-crit/40 bg-crit/10 text-crit"}`}
        >
          {feedback.text}
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
                  onClick={() => change(category, "revoke")}
                  disabled={pending}
                  className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:border-crit/40 hover:text-crit disabled:opacity-50"
                >
                  Revogar
                </button>
              ) : (
                <button
                  onClick={() => change(category, "grant")}
                  disabled={pending}
                  className="shrink-0 rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs text-accent hover:bg-accent/20 disabled:opacity-50"
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
                  maxLength={200}
                  aria-label={`Motivo para ${CATEGORY_LABEL[category]}`}
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
