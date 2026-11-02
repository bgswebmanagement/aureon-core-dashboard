"use client";

import { useState, useTransition } from "react";
import { requestLink, type LoginState } from "./actions";

export function LoginForm() {
  const [state, setState] = useState<LoginState>({ status: "idle" });
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      setState(await requestLink(formData));
    });
  }

  if (state.status === "sent") {
    return (
      <div className="rounded-xl border border-border bg-panel2 p-4 text-sm">
        <div className="font-semibold text-good">Verifique o seu email</div>
        <p className="mt-1 text-muted">
          Se este email tiver acesso à Aureon Core, enviámos-lhe um link para entrar. Se não chegar em
          alguns minutos, veja a pasta de spam ou aguarde um minuto e peça de novo.
        </p>
        <button
          type="button"
          onClick={() => setState({ status: "idle" })}
          className="mt-3 text-xs text-accent hover:underline"
        >
          Usar outro email
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <label htmlFor="email" className="block text-sm text-muted">
        O seu email
      </label>
      <input
        id="email"
        name="email"
        type="email"
        required
        autoComplete="email"
        inputMode="email"
        placeholder="nome@exemplo.com"
        className="w-full rounded-lg border border-border bg-panel2 px-3 py-2 text-sm text-white placeholder:text-muted/60 focus:border-accent/50 focus:outline-none"
      />
      {state.status === "error" && <p className="text-sm text-crit">{state.message}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-sm font-medium text-accent hover:bg-accent/20 disabled:opacity-60"
      >
        {pending ? "A enviar…" : "Enviar link de acesso"}
      </button>
    </form>
  );
}
