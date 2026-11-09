import { IconAlert } from "./icons";

// Ecrã de erro quando os dados não puderam ser lidos. Nunca mostra dados de
// demonstração no lugar dos reais.
export function DataError() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div role="alert" className="max-w-md rounded-xl border border-crit/40 bg-crit/10 p-6 text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-crit/20 text-crit">
          <IconAlert className="h-5 w-5" />
        </div>
        <h1 className="mt-4 text-lg font-semibold">Não foi possível carregar os dados</h1>
        <p className="mt-2 text-sm text-muted">
          Houve um problema a ler a informação. Tente outra vez dentro de instantes. Se continuar, contacte a Aureon Core.
        </p>
      </div>
    </div>
  );
}
