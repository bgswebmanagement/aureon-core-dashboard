"use client";

import { useState, useTransition } from "react";
import type { ActionResult, PropertyOption } from "@/lib/admin/types";
import { inviteUser } from "./actions";

export function InviteForm({ properties }: { properties: PropertyOption[] }) {
  const [role, setRole] = useState<"owner" | "tenant">("owner");
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      const outcome = await inviteUser(formData);
      setResult(outcome);
      if (outcome.ok) {
        form.reset();
        setRole("owner");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-border bg-panel p-5">
      <div>
        <div className="font-semibold">Convidar utilizador</div>
        <p className="mt-0.5 text-sm text-muted">
          A pessoa recebe um email com um botão para ativar o acesso. Não há palavras-passe.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="invite-email" className="text-xs text-muted">
            Email
          </label>
          <input
            id="invite-email"
            name="email"
            type="email"
            required
            autoComplete="off"
            placeholder="nome@exemplo.com"
            className="mt-1 w-full rounded-lg border border-border bg-panel2 px-3 py-2 text-sm text-white placeholder:text-muted/60 focus:border-accent/50 focus:outline-none"
          />
        </div>

        <fieldset>
          <legend className="text-xs text-muted">Papel</legend>
          <div className="mt-1 flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" name="role" value="owner" checked={role === "owner"} onChange={() => setRole("owner")} />
              Proprietário / gestor
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="role" value="tenant" checked={role === "tenant"} onChange={() => setRole("tenant")} />
              Inquilino
            </label>
          </div>
        </fieldset>
      </div>

      {role === "tenant" && (
        <div>
          <label htmlFor="invite-name" className="text-xs text-muted">
            Nome do inquilino (opcional — aparece ao proprietário da casa)
          </label>
          <input
            id="invite-name"
            name="name"
            type="text"
            maxLength={100}
            className="mt-1 w-full rounded-lg border border-border bg-panel2 px-3 py-2 text-sm text-white focus:border-accent/50 focus:outline-none md:max-w-sm"
          />
        </div>
      )}

      <fieldset>
        <legend className="text-xs text-muted">Casas a que tem acesso</legend>
        {properties.length === 0 ? (
          <p className="mt-1 text-sm text-muted">Ainda não há propriedades.</p>
        ) : (
          <div className="mt-1 grid gap-1 md:grid-cols-2">
            {properties.map((property) => (
              <label key={property.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="propertyIds" value={property.id} />
                {property.name} <span className="text-muted">· {property.city}</span>
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-accent/40 bg-accent/10 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/20 disabled:opacity-60"
        >
          {pending ? "A enviar…" : "Enviar convite"}
        </button>
        {result && (
          <span role="status" className={`text-sm ${result.ok ? "text-good" : "text-crit"}`}>
            {result.ok ? result.message : result.error}
          </span>
        )}
      </div>
    </form>
  );
}
