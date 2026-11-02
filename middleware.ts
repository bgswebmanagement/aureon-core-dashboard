import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/auth/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

// Fica de fora tudo o que começa por /api/ — em particular /api/ingest, o
// endpoint do firmware, que não pode ser tocado — e os ficheiros estáticos.
export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"]
};
