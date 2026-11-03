import { redirect } from "next/navigation";
import { IconLock } from "@/components/icons";
import { homeForRole } from "@/lib/auth/config";
import { getCurrentAccount } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export const metadata = { title: "Sem acesso — Aureon Core", robots: { index: false } };

// Conta com sessão iniciada mas sem papel atribuído em `profiles`.
export default async function NoAccessPage() {
  const account = await getCurrentAccount();
  if (!account) redirect("/login");
  if (account.role) redirect(homeForRole(account.role));

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-6 py-16">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 text-muted">
          <IconLock className="h-5 w-5" />
        </div>
        <h1 className="mt-6 text-2xl font-bold">Conta sem acesso</h1>
        <p className="mt-2 text-sm text-muted">
          A conta {account.email ?? ""} ainda não tem um papel atribuído. Contacte a Aureon Core para ativar o
          seu acesso.
        </p>
        <form method="post" action="/auth/sair" className="mt-6">
          <button
            type="submit"
            className="w-full rounded-lg border border-border px-3 py-2 text-sm text-muted hover:border-crit/40 hover:text-crit"
          >
            Sair
          </button>
        </form>
      </div>
    </main>
  );
}
