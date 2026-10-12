import { broadcastPush } from "../lib/push-service";

async function main() {
  const title = "📢 Comunicado Oficial · Ojo Panamá";
  const body = "Nuevo dominio web: ojopanama.com · Síguenos en nuestro Instagram oficial @ojopanama507 para actualizaciones en vivo.";

  console.log("=== INICIANDO TRANSMISIÓN MASIVA PUSH ===");
  console.log("Título:", title);
  console.log("Mensaje:", body);
  console.log("URL destino: https://www.ojopanama.com/");

  // Sin campo `magnitude` en el payload para que la pestaña abierta no lo interprete como un sismo.
  const payload = {
    title,
    body,
    id: `anuncio-${Date.now()}`,
    url: "/",
  };

  const startedAt = Date.now();
  // Umbral 99.0 en el segundo parámetro incluye a todos los suscriptores sin inyectar magnitud en el mensaje.
  const result = await broadcastPush(payload, 99.0, 360_000);
  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);

  console.log("\n=== RESULTADOS DEL ENVÍO MASIVO ===");
  console.log("Total destinatarios en base:", result.total);
  console.log("Notificaciones enviadas con éxito:", result.sent);
  console.log("Fallos / caducados limpiados:", result.cleaned + result.failed);
  console.log("No alcanzados por tiempo:", result.unsent);
  console.log("Tiempo total:", elapsedSec + "s");
  console.log("Detalle de respuestas:", result.outcomes);
}

main().catch((err) => {
  console.error("Error fatal en transmisión masiva:", err);
  process.exit(1);
});
