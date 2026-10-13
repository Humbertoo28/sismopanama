# Ficha de Ojo Panamá en Google Play

Textos e imágenes para Play Console (**Crecimiento → Presencia en la tienda → Ficha principal**).

## Datos de la app

| Campo | Valor |
|---|---|
| Nombre de la app (máx. 30) | Ojo Panamá |
| Id. del paquete | `com.ojopanama.app` |
| Categoría | Clima |
| Correo de contacto | soporte@ojopanama.com |
| Sitio web | https://www.ojopanama.com |
| Política de privacidad | https://www.ojopanama.com/privacidad |

## Descripción breve (máx. 80)

Sismos en Panamá en tiempo real: mapa, réplicas y alertas al celular.

## Descripción completa (máx. 4000)

Ojo Panamá muestra los sismos de Panamá en cuanto los publican el Instituto de Geociencias de la Universidad de Panamá (IGC-UP), el Servicio Geológico de Estados Unidos (USGS) y el Centro Sismológico Euromediterráneo (EMSC).

• El último sismo, en palabras sencillas: magnitud, lugar, hora y profundidad.
• Alertas al celular, incluso con la app cerrada, para los sismos registrados en Panamá. Tú eliges desde qué magnitud.
• Mapa con todos los sismos, satélite y vista en 3D, con las fallas activas y las placas tectónicas.
• Réplicas del terremoto de magnitud 7.7 del 9 de octubre de 2026, con gráficos que se actualizan solos.
• «¿Lo sentiste?»: cuenta si sentiste un sismo y mira hasta dónde se sintió, agrupado por localidad.
• Qué hacer antes, durante y después de un sismo, y los números de emergencia.
• Noticias y comunicados oficiales sobre el sismo, e historia de los sismos grandes en Panamá desde 1900.
• Modo oscuro y opciones de accesibilidad.

Ojo Panamá es un proyecto independiente: no es una app del gobierno ni de SINAPROC. Los datos de los catálogos sísmicos pueden revisarse y cambiar. Las alertas avisan de sismos ya registrados: no predicen sismos ni reemplazan los avisos oficiales. Ante una emergencia, sigue las indicaciones de SINAPROC y llama al 911.

No necesitas crear una cuenta y la app no muestra publicidad.

## Imágenes (en esta carpeta)

| Recurso | Archivo |
|---|---|
| Ícono de la app (512×512) | `../../public/icon-512.png` |
| Gráfico destacado (1024×500) | `grafico-destacado-1024x500.png` |
| Capturas de teléfono (1080×1920) | `1-inicio.png`, `2-mapa.png`, `3-reportes.png`, `4-graficos.png`, `5-historia.png` |

## Seguridad de los datos (Política de la app → Seguridad de los datos)

Respuestas según lo que hace el código (ver también `/privacidad`):

- **¿Recopila o comparte datos del usuario?** Sí, recopila. No comparte con terceros.
- **¿Los datos se encriptan en tránsito?** Sí (HTTPS).
- **¿Se puede pedir que se borren?** Sí, escribiendo a soporte@ojopanama.com.
- **Tipos de datos recopilados:**
  - *Identificadores del dispositivo u otros identificadores*: la suscripción a las notificaciones push. Finalidad: funcionalidad de la app. Opcional (solo si se activan las alertas).
  - *Otro contenido generado por el usuario*: los reportes «¿Lo sentiste?» (si lo sintió, intensidad y localidad elegida de una lista). Finalidad: funcionalidad de la app. Opcional.
  - *Interacciones con la app*: páginas vistas, en una muestra del 10 % y sin cookies (Vercel Web Analytics). Finalidad: estadísticas.
- **Ubicación:** no se recopila. «Usar mi ubicación» busca la localidad más cercana dentro del teléfono y solo se envía esa localidad.

## Otras declaraciones

- **Anuncios:** la app no contiene anuncios.
- **Público objetivo:** 13 años o más.
- **Clasificación del contenido:** responder el cuestionario sin violencia, sexo, lenguaje, drogas ni apuestas. Es una app de referencia/clima.
- **App gubernamental:** no.
- **Acceso a la app:** todas las funciones están disponibles sin iniciar sesión.
