import "server-only";
import { headers } from "next/headers";

const HOST_RE = /^[a-z0-9.-]+(:\d{1,5})?$/i;

// Endereço do site de onde o pedido veio (produção, preview, .pt/.ch no
// futuro). O Supabase só o aceita como destino dos links de email se estiver
// na lista de Redirect URLs; se não estiver, usa o Site URL.
export function currentOrigin(): string | null {
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host || !HOST_RE.test(host)) return null;
  const local = host.startsWith("localhost") || host.startsWith("127.0.0.1");
  const proto = local ? "http" : (h.get("x-forwarded-proto") ?? "https").split(",")[0].trim();
  return `${proto}://${host}`;
}
