# App de Android (Google Play)

La app es una **Trusted Web Activity**: abre https://www.ojopanama.com a pantalla completa, con el ícono y el nombre de la
app, y usa las mismas alertas push que la web. Se generó con [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap)
a partir de `twa-manifest.json`. Cualquier cambio en la web llega a la app sin publicar una versión nueva.

- Paquete: `com.ojopanama.app`
- Ficha de la tienda, textos e imágenes: `play-store/`
- Verificación del dominio: `public/.well-known/assetlinks.json` (sin ella, la app muestra la barra del navegador)

## Clave de firma

La clave de subida (`ojo-panama-upload.jks`, alias `ojopanama`) y su contraseña **no están en el repositorio** y nunca deben
subirse. Sin ella no se pueden publicar actualizaciones (con la firma de apps de Play, Google puede reemplazarla si se pierde).

## Publicar una versión nueva

Solo hace falta si cambia algo de la app en sí (nombre, ícono, colores, versión de Android), no por cambios de la web.

1. Subir `appVersionCode` (y `appVersion`) en `twa-manifest.json`.
2. `npx @bubblewrap/cli update` y luego `npx @bubblewrap/cli build` (pide la contraseña de la clave).
3. Subir `app-release-bundle.aab` a Play Console.

Requisitos: JDK 17 y el SDK de Android (`npx @bubblewrap/cli doctor` lo comprueba).
