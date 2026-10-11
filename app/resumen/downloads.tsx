"use client";

// Descarga del resumen: se arma en el navegador con el texto que ya trajo la página (no consulta nada al servidor).
type Props = { text: string };

function save(content: string, name: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export default function Downloads({ text }: Props) {
  return (
    <section className="rs-card" aria-labelledby="rs-downloads">
      <h2 id="rs-downloads">Descargar este resumen</h2>
      <p>Guárdalo para leerlo sin conexión.</p>
      <ul className="rs-downloads">
        <li>
          <button type="button" onClick={() => save(text, "resumen-sismos-panama.txt")}>Texto sencillo (.txt)</button>
          <span>Las mismas frases de esta página, una por línea.</span>
        </li>
      </ul>
    </section>
  );
}
