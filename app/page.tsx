import { loadQuakeData } from "../lib/load-quakes";
import Home from "./home";
import LatestQuakeSsr from "./latest-quake-ssr";

// La portada se regenera como mucho cada minuto, igual que /resumen: el último sismo sale ya dibujado en el HTML (para Google y para
// quien tenga mala conexión) y el navegador lo reemplaza enseguida por los datos en vivo.
export const revalidate = 60;

export default async function Page() {
  const data = await loadQuakeData();
  return <Home latestFallback={data ? <LatestQuakeSsr events={data.features} /> : undefined} />;
}
