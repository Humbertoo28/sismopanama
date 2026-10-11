"use client";

// Descargas del resumen: se arman en el navegador con el texto que ya trajo la página (no consultan nada al servidor).
type Props = { text: string; braille: string; brf: string };

function save(content: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type: `${type};charset=utf-8` }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export default function Downloads({ text, braille, brf }: Props) {
  return (
    <section className="rs-card" aria-labelledby="rs-downloads">
      <h2 id="rs-downloads">Descargar este resumen</h2>
      <p>
        Si usas una línea braille con un lector de pantalla, no necesitas descargar nada: esta página está escrita para leerse así.
        Estas descargas son para guardarlo, leerlo sin conexión o imprimirlo en braille.
      </p>
      <ul className="rs-downloads">
        <li>
          <button type="button" onClick={() => save(text, "resumen-sismos-panama.txt", "text/plain")}>Texto sencillo (.txt)</button>
          <span>Las mismas frases de esta página, una por línea.</span>
        </li>
        <li>
          <button type="button" onClick={() => save(braille, "resumen-sismos-panama-braille.txt", "text/plain")}>Braille para línea braille (.txt)</button>
          <span>Texto en caracteres braille (Unicode): una línea braille o un programa lo muestra celda por celda.</span>
        </li>
        <li>
          <button type="button" onClick={() => save(brf, "resumen-sismos-panama.brf", "text/plain")}>Braille para impresora braille (.brf)</button>
          <span>Formato BRF, de 40 celdas por línea y 25 líneas por página, para imprimir en una impresora braille.</span>
        </li>
      </ul>
      <p className="rs-note">
        El braille es una traducción automática en español (grado 1, sin contracciones). Conviene que una persona que lea braille la
        revise antes de imprimirla.
      </p>
    </section>
  );
}
