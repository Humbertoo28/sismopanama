import type { Metadata } from "next";
import PageHeader from "../page-header";
import { pageSocial } from "../../lib/site";
import "./privacidad.css";

const TITLE = "Política de privacidad";
const DESCRIPTION = "Qué datos usa Ojo Panamá (la web y la app), para qué, dónde se guardan y cómo borrarlos.";
const CONTACT = "soporte@ojopanama.com";

export const metadata: Metadata = {
  title: TITLE, // el sitio añade "| Ojo Panamá"
  description: DESCRIPTION,
  ...pageSocial(`${TITLE} | Ojo Panamá`, DESCRIPTION, "/privacidad", true),
};

// Política de privacidad de la web y de las apps (Google Play la exige). Describe lo que hace el código: si cambia lo que se
// guarda (app/api/push, app/api/reports, lib/felt-store.ts) hay que actualizar esta página.
export default function PrivacidadPage() {
  return (
    <>
      <PageHeader current="/privacidad" />
      <main className="pv-main">
        <h1>{TITLE}</h1>
        <p className="pv-updated">Última actualización: 12 de octubre de 2026.</p>
        <p>
          Ojo Panamá (<a href="https://www.ojopanama.com">www.ojopanama.com</a> y sus apps para celular) muestra los sismos de Panamá
          con datos públicos del Instituto de Geociencias de la Universidad de Panamá, el USGS y el EMSC. Es un proyecto independiente:
          no es del gobierno ni de ningún medio. No pide crear una cuenta, no muestra publicidad y no vende datos.
        </p>

        <h2>Qué datos se usan y para qué</h2>
        <h3>Alertas en el celular</h3>
        <p>
          Si activas las alertas, tu teléfono o navegador crea una «suscripción» con el servicio de notificaciones del sistema (Google,
          Apple, Mozilla o Microsoft). Guardamos la dirección de esa suscripción, sus claves de cifrado, la magnitud mínima que elegiste
          y la fecha. Sirven solo para enviarte los avisos de sismos. No sabemos tu nombre, tu número ni tu ubicación.
        </p>
        <p>
          Para dejar de recibirlas, quita el permiso de notificaciones de Ojo Panamá en los ajustes del teléfono o del navegador: la
          siguiente vez que haya una alerta, el servicio nos indica que la suscripción ya no existe y se borra.
        </p>

        <h3>Reportes «¿Lo sentiste?»</h3>
        <p>
          Si envías un reporte, guardamos el sismo, si lo sentiste, con qué fuerza y la localidad que elegiste de una lista. El botón
          «Usar mi ubicación» busca la localidad más cercana dentro de tu propio teléfono: tu posición no se envía. Para no contar dos
          veces el mismo teléfono ni recibir envíos masivos guardamos un código cifrado derivado de la conexión y del navegador, que
          no permite saber tu dirección IP. Los reportes se publican siempre agrupados por localidad, nunca uno por uno.
        </p>

        <h3>Preferencias en tu equipo</h3>
        <p>
          El tema claro u oscuro, las opciones de accesibilidad, la magnitud de las alertas y los sismos que ya viste se guardan en tu
          propio navegador. No se envían a ningún servidor y se borran al borrar los datos del sitio.
        </p>

        <h3>Estadísticas de uso</h3>
        <p>
          En una muestra de una de cada diez visitas usamos Vercel Web Analytics para contar visitas y páginas vistas. No usa cookies y
          solo muestra cifras agregadas.
        </p>

        <h3>Funcionamiento y seguridad</h3>
        <p>
          Los proveedores que alojan y protegen el sitio (Vercel y Cloudflare) procesan tu dirección IP para entregar las páginas y
          frenar abusos, y la guardan en registros técnicos temporales. Al ver los mapas, tu navegador descarga las imágenes
          directamente de Google, Esri, OpenStreetMap, CARTO y Amazon Web Services, que reciben tu IP como en cualquier página web.
        </p>

        <h2>Dónde se guardan</h2>
        <p>
          Las suscripciones a las alertas y los reportes se guardan en Supabase; el sitio funciona en Vercel. Sus servidores pueden estar
          fuera de Panamá, por ejemplo en Estados Unidos. Solo el equipo de Ojo Panamá tiene acceso.
        </p>

        <h2>Tus opciones</h2>
        <ul>
          <li>Desactivar las alertas en cualquier momento, quitando el permiso de notificaciones.</li>
          <li>
            Pedir que se borre un reporte: como no guardamos datos que te identifiquen, escríbenos con el sismo, la localidad y la hora
            aproximada del envío.
          </li>
          <li>Preguntar cualquier cosa sobre tus datos.</li>
        </ul>
        <p>
          Escríbenos a <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
        </p>

        <h2>Cambios</h2>
        <p>Si cambia lo que hacemos con los datos, lo actualizaremos en esta página con la fecha del cambio.</p>
      </main>
    </>
  );
}
