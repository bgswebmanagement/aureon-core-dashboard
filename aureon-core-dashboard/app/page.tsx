import Link from "next/link";
import { IconBuilding, IconShield, IconUsers } from "@/components/icons";
import { isLiveMode } from "@/lib/data";

export default function LandingPage() {
  return (
    <main className="relative flex min-h-screen items-center overflow-hidden bg-bg px-8 py-16">
      <div className="pointer-events-none absolute inset-0 opacity-40 [background:radial-gradient(circle_at_20%_20%,rgba(58,160,255,0.15),transparent_35%),radial-gradient(circle_at_80%_60%,rgba(58,160,255,0.08),transparent_40%)]" />

      <div className="relative mx-auto grid w-full max-w-5xl grid-cols-1 items-center gap-16 md:grid-cols-2">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/15 text-accent">
              <IconShield className="h-5 w-5" />
            </div>
            <span className="text-lg font-semibold">Aureon Core</span>
          </div>

          <div className="mt-10 flex h-40 w-40 items-center justify-center rounded-full bg-white/5">
            <div className="h-24 w-24 rounded-full bg-gradient-to-b from-white to-slate-300 shadow-[0_0_40px_rgba(58,160,255,0.35)]" />
          </div>

          <h1 className="mt-8 text-4xl font-bold leading-tight">
            Smart Home Safety, <span className="text-accent">Privacy First.</span>
          </h1>
          <p className="mt-4 max-w-md text-muted">
            Monitorização local de temperatura, humidade, qualidade do ar e segurança — sem cloud
            obrigatória.
          </p>

          <div className="mt-6 flex flex-wrap gap-4 text-xs text-muted">
            <span>• Local-first</span>
            <span>• Privacidade</span>
            <span>• Prevenção</span>
          </div>
        </div>

        <div>
          <h2 className="text-xl font-semibold">Entrar no Dashboard</h2>
          <p className="mt-1 text-sm text-muted">Selecione o seu perfil para aceder ao painel de controlo.</p>

          <div className="mt-6 space-y-3">
            <Link
              href="/proprietario"
              className="flex items-start gap-4 rounded-xl border border-border bg-panel p-4 transition-colors hover:border-accent/50"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
                <IconBuilding className="h-5 w-5" />
              </div>
              <div>
                <div className="font-semibold">Proprietário / Gestor</div>
                <div className="text-sm text-muted">
                  Visão agregada de todas as propriedades, inquilinos e alertas.
                </div>
              </div>
            </Link>

            <Link
              href="/inquilino"
              className="flex items-start gap-4 rounded-xl border border-border bg-panel p-4 transition-colors hover:border-accent/50"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white/80">
                <IconUsers className="h-5 w-5" />
              </div>
              <div>
                <div className="font-semibold">Inquilino</div>
                <div className="text-sm text-muted">Alertas e dados da sua habitação. Vista simplificada.</div>
              </div>
            </Link>

            <div className="rounded-xl border border-border bg-panel2 p-4 text-xs text-muted">
              {isLiveMode ? (
                <>
                  <span className="text-good">● Ligado ao Supabase</span> — a mostrar dados reais dos hubs
                  associados à sua conta.
                </>
              ) : (
                <>
                  <span className="text-warn">● Modo de demonstração</span> — dados de exemplo (3
                  propriedades piloto). Nenhum sensor físico necessário. Configure o Supabase para dados reais
                  dos 10 hubs.
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
