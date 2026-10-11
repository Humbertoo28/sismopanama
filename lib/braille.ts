// Traducción automática de texto en español a braille (grado 1, sin contracciones) para descargar el resumen de sismos.
// - toBraille: braille Unicode (U+2800…), que una línea braille o un lector de pantalla muestra celda por celda.
// - toBrf: el mismo texto en ASCII braille (BRF, 40 celdas por línea y 25 líneas por página), el formato que usan las
//   impresoras braille.
// Solo usa signos que no dependen de la convención de cada país: letras (con tildes, ñ y ü), números, espacio y , . ; : ? ! -.
// El texto del resumen se escribe con palabras ("7 coma 7", "11 horas con 52 minutos") para no depender de otros signos.
// Es una traducción básica: conviene que la revise una persona que lea braille.

const LETTERS: Record<string, string> = {
  a: "⠁", b: "⠃", c: "⠉", d: "⠙", e: "⠑", f: "⠋", g: "⠛", h: "⠓", i: "⠊", j: "⠚", k: "⠅", l: "⠇", m: "⠍",
  n: "⠝", ñ: "⠻", o: "⠕", p: "⠏", q: "⠟", r: "⠗", s: "⠎", t: "⠞", u: "⠥", v: "⠧", w: "⠺", x: "⠭", y: "⠽", z: "⠵",
  á: "⠷", é: "⠮", í: "⠌", ó: "⠬", ú: "⠾", ü: "⠳",
};
// Los dígitos 1-9 y 0 se escriben con las letras a-j después del signo de número.
const DIGITS: Record<string, string> = { "1": "⠁", "2": "⠃", "3": "⠉", "4": "⠙", "5": "⠑", "6": "⠋", "7": "⠛", "8": "⠓", "9": "⠊", "0": "⠚" };
const PUNCTUATION: Record<string, string> = { ",": "⠂", ".": "⠄", ";": "⠆", ":": "⠒", "?": "⠢", "¿": "⠢", "!": "⠖", "¡": "⠖", "-": "⠤" };
const CAPITAL = "⠨";
const NUMBER = "⠼";

const isUpper = (char: string) => char !== char.toLowerCase();

export function toBraille(text: string): string {
  // Una letra pegada a un número se leería como otro dígito (a-j): se separan.
  const source = text.normalize("NFC").replace(/(\d)(\p{L})/gu, "$1 $2");
  let out = "";
  for (const raw of source.split(/(\s+)/)) {
    if (/^\s+$/.test(raw)) {
      out += raw;
      continue;
    }
    const letters = [...raw].filter(char => /\p{L}/u.test(char));
    // Una palabra toda en mayúsculas lleva un solo signo doble; si no, cada mayúscula lleva el suyo.
    const allCaps = letters.length > 1 && letters.every(isUpper);
    if (allCaps) out += CAPITAL + CAPITAL;
    let inNumber = false;
    for (const char of raw) {
      if (DIGITS[char]) {
        if (!inNumber) out += NUMBER;
        inNumber = true;
        out += DIGITS[char];
        continue;
      }
      inNumber = false;
      const lower = char.toLowerCase();
      if (LETTERS[lower]) {
        if (!allCaps && isUpper(char)) out += CAPITAL;
        out += LETTERS[lower];
      } else if (PUNCTUATION[char]) {
        out += PUNCTUATION[char];
      }
      // Cualquier otro signo (emojis, flechas…) se omite: no tiene equivalente seguro.
    }
  }
  return out;
}

// Código ASCII braille norteamericano: la posición es el patrón de puntos (punto 1 = 1, 2 = 2, 3 = 4, 4 = 8, 5 = 16, 6 = 32).
const ASCII_BRAILLE = " A1B'K2L@CIF/MSP\"E3H9O6R^DJG>NTQ,*5<-U8V.%[$+X!&;:4\\0Z7(_?W]#Y)=";

export function toBrf(unicode: string, cells = 40, lines = 25): string {
  const ascii = [...unicode.replace(/\r/g, "")].map(char => {
    const code = char.charCodeAt(0) - 0x2800;
    return code >= 0 && code < 64 ? ASCII_BRAILLE[code] : char === "\n" ? "\n" : " ";
  }).join("");
  const wrapped: string[] = [];
  for (const paragraph of ascii.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/ +/).filter(Boolean)) {
      let rest = word;
      while (rest.length > cells) {
        if (line) { wrapped.push(line); line = ""; }
        wrapped.push(rest.slice(0, cells));
        rest = rest.slice(cells);
      }
      if (line && line.length + 1 + rest.length > cells) { wrapped.push(line); line = rest; }
      else line = line ? `${line} ${rest}` : rest;
    }
    wrapped.push(line);
  }
  const pages: string[] = [];
  for (let i = 0; i < wrapped.length; i += lines) pages.push(wrapped.slice(i, i + lines).join("\r\n"));
  return pages.join("\r\n\f");
}
