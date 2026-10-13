import { NextResponse } from "next/server";
import { CURRENT_VAPID } from "@/lib/push-service";

export const dynamic = "force-dynamic";

// Clave pública para las suscripciones nuevas. Caché corta: cuando se cambia de clave, los teléfonos tienen que enterarse en
// minutos (antes se guardaba hasta una semana).
export async function GET() {
  if (!CURRENT_VAPID) {
    return NextResponse.json({ error: "Las alertas push no están configuradas." }, { status: 503 });
  }
  return NextResponse.json(
    { publicKey: CURRENT_VAPID.publicKey },
    { headers: { "Cache-Control": "public, max-age=300, s-maxage=300" } },
  );
}
