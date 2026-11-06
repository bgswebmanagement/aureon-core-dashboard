import Link from "next/link";
import { redirect } from "next/navigation";
import { IconShield } from "@/components/icons";
import { homeForRole } from "@/lib/auth/config";
import { getCurrentAccount } from "@/lib/auth/session";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export const metadata = { title: "Entrar — Aureon Core", robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: { erro?: string } }) {
  // Quem já tem sessão vai direto para a página do seu papel.
  const account = await getCurrentAccount();
  if (account) redirect(homeForRole(account.role));

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/15 text-accent">
            <IconShield className="h-5 w-5" />
          </div>
          <span className="text-lg font-semibold">Aureon Core</span>
        </div>

        <h1 className="mt-8 text-2xl font-bold">Entrar</h1>
        <p className="mt-1 text-sm text-muted">
          Sem palavra-passe: enviamos-lhe um link por email. O acesso é só para quem foi convidado.
        </p>

        {searchParams.erro === "link" && (
          <div className="mt-4 rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm text-warn">
            Este link expirou ou já foi usado. Peça um novo link abaixo.
          </div>
        )}

        <div className="mt-6">
          <LoginForm />
        </div>

        {/* Só para administradores. Formulário normal (POST), sem JavaScript: a palavra-passe
            nunca vai para o endereço. Abre sozinho depois de uma tentativa falhada. */}
        <details id="admin-login-tab" open={searchParams.erro === "senha"} className="mt-8 border-t border-border pt-6">
          <summary className="cursor-pointer text-sm font-medium">Administrador</summary>
          <form method="post" action="/auth/palavra-passe" className="mt-4 space-y-3">
            <p className="text-xs text-muted">Acesso com email e palavra-passe, só para administradores.</p>
            {searchParams.erro === "senha" && (
              <p role="alert" className="rounded-lg border border-crit/30 bg-crit/10 p-3 text-sm text-crit">
                Email ou palavra-passe incorretos.
              </p>
            )}
            <div>
              <label htmlFor="admin-email" className="text-sm text-muted">
                Email
              </label>
              <input
                id="admin-email"
                name="email"
                type="email"
                required
                autoComplete="username"
                inputMode="email"
                className="mt-1 w-full rounded-lg border border-border bg-panel2 px-3 py-2 text-sm text-white focus:border-accent/50 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="admin-password" className="text-sm text-muted">
                Palavra-passe
              </label>
              <input
                id="admin-password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className="mt-1 w-full rounded-lg border border-border bg-panel2 px-3 py-2 text-sm text-white focus:border-accent/50 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-sm font-medium text-accent hover:bg-accent/20"
            >
              Entrar
            </button>
          </form>
        </details>

        <Link href="/" className="mt-8 inline-block text-xs text-muted hover:text-white">
          ← Voltar à página inicial
        </Link>
      </div>
    </main>
  );
}
