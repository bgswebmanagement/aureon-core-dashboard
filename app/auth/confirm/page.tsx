import { redirect } from "next/navigation";
import { IconShield } from "@/components/icons";
import { isAllowedOtpType, TOKEN_HASH_RE } from "@/lib/auth/config";

export const dynamic = "force-dynamic";

// O link do email não pode ser usado por leitores automáticos de antivírus: abrir
// esta página NÃO gasta o código. Só o clique em "Entrar" o verifica.
export const metadata = { title: "Entrar — Aureon Core", robots: { index: false }, referrer: "no-referrer" as const };

export default function ConfirmPage({ searchParams }: { searchParams: { token_hash?: string; type?: string } }) {
  const { token_hash: tokenHash, type } = searchParams;

  if (!tokenHash || !TOKEN_HASH_RE.test(tokenHash) || !isAllowedOtpType(type)) {
    redirect("/login?erro=link");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-6 py-16">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-accent/15 text-accent">
          <IconShield className="h-5 w-5" />
        </div>
        <h1 className="mt-6 text-2xl font-bold">Aceder à Aureon Core</h1>
        <p className="mt-2 text-sm text-muted">Clique no botão para entrar na sua conta.</p>

        <form method="post" action="/auth/entrar" className="mt-6">
          <input type="hidden" name="token_hash" value={tokenHash} />
          <input type="hidden" name="type" value={type} />
          <button
            type="submit"
            className="w-full rounded-lg border border-accent/40 bg-accent/10 px-3 py-2.5 text-sm font-medium text-accent hover:bg-accent/20"
          >
            Entrar
          </button>
        </form>
      </div>
    </main>
  );
}
