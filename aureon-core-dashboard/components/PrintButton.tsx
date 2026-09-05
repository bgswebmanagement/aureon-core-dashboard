"use client";

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="no-print rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90"
    >
      Imprimir / Guardar como PDF
    </button>
  );
}
