import { broadcastPush } from "../lib/push-service";

async function main() {
  const title = "📢 Comunicado Oficial · Ojo Panamá";
  const body = "Nuevo dominio web: ojopanama.com · Síguenos en nuestro Instagram oficial @ojopanama507 para actualizaciones en vivo.";

  console.log("=== INICIANDO TRANSMISIÓN MASIVA PUSH ===");
  console.log("Título:", title);
  console.log("Mensaje:", body);
  console.log("URL destino: https://www.ojopanama.com/");

  const payload = {
    title,
    body,
    id: `anuncio-${Date.now()}`,
    magnitude: 10, // Para incluir a todos los suscriptores (umbral 3, 4 y 5)
    place: "Panamá",
    time: Date.now(),
    url: "/",
  };

  const startedAt = Date.now();
  // Presupuesto de 6 minutos para despachar a los más de 30,000 suscriptores
  const result = await broadcastPush(payload, 5.0, 360_000);
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
