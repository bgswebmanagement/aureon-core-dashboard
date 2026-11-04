"use client";

import { useState, useTransition } from "react";
import type { ActionResult, ManagedAccount, PropertyOption } from "@/lib/admin/types";
import { formatDateTime } from "@/lib/ui";
import { resendLink, setUserActive, setUserProperties } from "./actions";

const ROLE_LABEL: Record<string, string> = { admin: "Administrador", owner: "Proprietário", tenant: "Inquilino" };
const STATUS_STYLE: Record<ManagedAccount["status"], string> = {
  ativo: "text-good",
  pendente: "text-warn",
  desativado: "text-crit"
};
const STATUS_LABEL: Record<ManagedAccount["status"], string> = {
  ativo: "Ativo",
  pendente: "Convite por aceitar",
  desativado: "Desativado"
};

export function UsersTable({
  accounts,
  properties,
  selfId
}: {
  accounts: ManagedAccount[];
  properties: PropertyOption[];
  selfId: string;
}) {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const propertyName = (id: string) => properties.find((p) => p.id === id)?.name ?? "(casa removida)";

  function run(key: string, action: () => Promise<ActionResult>, after?: (outcome: ActionResult) => void) {
    setBusy(key);
    startTransition(async () => {
      const outcome = await action();
      setResult(outcome);
      setBusy(null);
      after?.(outcome);
    });
  }

  function startEditing(account: ManagedAccount) {
    setEditing(account.id);
    setSelected(account.propertyIds);
  }

  return (
    <div className="space-y-3">
      {result && (
        <div
          role="status"
          className={`rounded-xl border p-3 text-sm ${
            result.ok ? "border-good/30 bg-good/10 text-good" : "border-crit/30 bg-crit/10 text-crit"
          }`}
        >
          {result.ok ? result.message : result.error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-panel">
        <table className="w-full text-sm">
          <thead className="bg-panel2 text-left text-xs text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">Utilizador</th>
              <th className="px-4 py-2 font-medium">Papel</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2 font-medium">Casas</th>
              <th className="px-4 py-2 font-medium">Último acesso</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {accounts.map((account) => {
              const manageable = (account.role === "owner" || account.role === "tenant") && account.id !== selfId;
              const isEditing = editing === account.id;
              return (
                <tr key={account.id} className="border-t border-border align-top">
                  <td className="px-4 py-3">{account.email}</td>
                  <td className="px-4 py-3">{account.role ? ROLE_LABEL[account.role] : <span className="text-warn">Sem papel</span>}</td>
                  <td className={`px-4 py-3 ${STATUS_STYLE[account.status]}`}>{STATUS_LABEL[account.status]}</td>
                  <td className="px-4 py-3 text-muted">
                    {account.role === "admin"
                      ? "Todas"
                      : account.propertyIds.length === 0
                        ? "Nenhuma"
                        : account.propertyIds.map(propertyName).join(", ")}
                    {isEditing && (
                      <div className="mt-2 space-y-1 rounded-lg border border-border bg-panel2 p-3 text-white">
                        {properties.map((property) => (
                          <label key={property.id} className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={selected.includes(property.id)}
                              onChange={(e) =>
                                setSelected((prev) => (e.target.checked ? [...prev, property.id] : prev.filter((id) => id !== property.id)))
                              }
                            />
                            {property.name}
                          </label>
                        ))}
                        <div className="flex gap-2 pt-2">
                          <button
                            type="button"
                            disabled={busy !== null}
                            onClick={() =>
                              run(`${account.id}:casas`, () => setUserProperties(account.id, selected), (o) => o.ok && setEditing(null))
                            }
                            className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-1 text-xs text-accent hover:bg-accent/20 disabled:opacity-60"
                          >
                            Guardar
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditing(null)}
                            className="rounded-lg border border-border px-3 py-1 text-xs text-muted hover:text-white"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted">{account.lastSignInAt ? formatDateTime(account.lastSignInAt) : "—"}</td>
                  <td className="px-4 py-3">
                    {manageable && (
                      <div className="flex flex-wrap justify-end gap-2">
                        {account.status !== "desativado" && (
                          <button
                            type="button"
                            disabled={busy !== null}
                            onClick={() => run(`${account.id}:link`, () => resendLink(account.id))}
                            className="rounded-lg border border-border px-2.5 py-1 text-xs text-muted hover:border-accent/40 hover:text-accent disabled:opacity-60"
                          >
                            {busy === `${account.id}:link` ? "A enviar…" : "Reenviar link"}
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={() => startEditing(account)}
                          className="rounded-lg border border-border px-2.5 py-1 text-xs text-muted hover:border-accent/40 hover:text-accent disabled:opacity-60"
                        >
                          Casas
                        </button>
                        {account.status === "desativado" ? (
                          <button
                            type="button"
                            disabled={busy !== null}
                            onClick={() => run(`${account.id}:ativo`, () => setUserActive(account.id, true))}
                            className="rounded-lg border border-good/40 px-2.5 py-1 text-xs text-good hover:bg-good/10 disabled:opacity-60"
                          >
                            Reativar
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={busy !== null}
                            onClick={() => {
                              if (window.confirm(`Desativar o acesso de ${account.email}? Pode reativá-lo mais tarde.`)) {
                                run(`${account.id}:ativo`, () => setUserActive(account.id, false));
                              }
                            }}
                            className="rounded-lg border border-border px-2.5 py-1 text-xs text-muted hover:border-crit/40 hover:text-crit disabled:opacity-60"
                          >
                            Desativar
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {accounts.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted">
                  Ainda não há contas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
