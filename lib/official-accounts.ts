// Cuentas oficiales en redes sociales de las entidades que informan sobre sismos y emergencias. Esta página NO lee ni copia
// sus publicaciones: solo enlaza a ellas. Las entidades suelen avisar primero por sus redes que en su sitio web.
//
// Cada cuenta se tomó de lo que la propia entidad publica en su sitio web oficial (revisado el 2026-10-10), nunca de
// suposiciones sobre cómo se llamará el usuario: un usuario inventado podría llevar a una cuenta falsa. Excepciones y vacíos:
// - IGC: ningún sitio del IGC enlaza su cuenta. Se confirmó mirando el perfil público de X: "IGCPanamaUP", "Monitoreo de
//   la actividad sísmica que ocurre en Panamá", con enlace a geociencias.up.ac.pa.
// - Presidencia: su sitio está protegido contra programas automáticos y no carga, así que no se pudo confirmar su cuenta. No
//   se incluye hasta que alguien la verifique.
// - UNACHI: su sitio solo enlaza un canal de YouTube y la cuenta de una unidad suya; se deja fuera.

export type Network = "x" | "facebook" | "instagram" | "youtube" | "tiktok" | "whatsapp";

export interface AccountLink {
  network: Network;
  /** Texto visible del enlace. */
  label: string;
  url: string;
}

export interface OfficialAccount {
  id: string;
  name: string;
  /** Para qué sirve seguirla en una emergencia. */
  role: string;
  /** Las que más importan para un sismo se muestran siempre; el resto, en un desplegable. */
  primary: boolean;
  links: AccountLink[];
}

export const OFFICIAL_ACCOUNTS: OfficialAccount[] = [
  {
    id: "sinaproc",
    name: "SINAPROC",
    role: "Protección Civil: avisos, daños y recomendaciones durante una emergencia",
    primary: true,
    links: [
      { network: "x", label: "X · @Sinaproc_Panama", url: "https://x.com/Sinaproc_Panama" },
      { network: "whatsapp", label: "Canal de WhatsApp", url: "https://whatsapp.com/channel/0029VbATVsK4Y9llDcvzp703" },
      { network: "facebook", label: "Facebook", url: "https://www.facebook.com/sinaprocpanama.howard" },
      { network: "instagram", label: "Instagram", url: "https://www.instagram.com/sinaproc_panama" },
      { network: "youtube", label: "YouTube", url: "https://www.youtube.com/@sinaprocpanama5695" },
    ],
  },
  {
    id: "igc",
    name: "IGC · Instituto de Geociencias",
    role: "Universidad de Panamá: reportes de los sismos que registra la red sísmica nacional",
    primary: true,
    links: [{ network: "x", label: "X · @igcpanamaup", url: "https://x.com/igcpanamaup" }],
  },
  {
    id: "meduca",
    name: "MEDUCA",
    role: "Ministerio de Educación: suspensión y reanudación de clases",
    primary: false,
    links: [
      { network: "x", label: "X · @MeducaPma", url: "https://x.com/MeducaPma" },
      { network: "whatsapp", label: "Canal de WhatsApp", url: "https://www.whatsapp.com/channel/0029VaoAHjk1CYoJPP9VL10V" },
      { network: "facebook", label: "Facebook", url: "https://www.facebook.com/MeducaPma" },
      { network: "instagram", label: "Instagram", url: "https://www.instagram.com/meducapma" },
      { network: "tiktok", label: "TikTok", url: "https://www.tiktok.com/@meducapma" },
      { network: "youtube", label: "YouTube", url: "https://www.youtube.com/@MEDUCAPANAMA" },
    ],
  },
  {
    id: "mingob",
    name: "Ministerio de Gobierno",
    role: "Ministerio del que depende SINAPROC",
    primary: false,
    links: [
      { network: "x", label: "X · @mingobpma", url: "https://x.com/mingobpma" },
      { network: "instagram", label: "Instagram", url: "https://www.instagram.com/mingobpma" },
    ],
  },
  {
    id: "minsa",
    name: "MINSA",
    role: "Ministerio de Salud: hospitales y centros de salud",
    primary: false,
    links: [
      { network: "x", label: "X · @minsa_panama", url: "https://x.com/minsa_panama" },
      { network: "facebook", label: "Facebook", url: "https://www.facebook.com/minsapanama" },
      { network: "instagram", label: "Instagram", url: "https://www.instagram.com/minsapma" },
      { network: "youtube", label: "YouTube", url: "https://www.youtube.com/user/MINSAPMA" },
    ],
  },
  {
    id: "up",
    name: "Universidad de Panamá",
    role: "Avisos a estudiantes y personal",
    primary: false,
    links: [
      { network: "x", label: "X · @UNIVERSIDAD_PMA", url: "https://x.com/UNIVERSIDAD_PMA" },
      { network: "facebook", label: "Facebook", url: "https://www.facebook.com/UNIVERSIDADdePANAMA" },
      { network: "instagram", label: "Instagram", url: "https://www.instagram.com/universidad_pma" },
    ],
  },
  {
    id: "utp",
    name: "Universidad Tecnológica de Panamá",
    role: "Avisos a estudiantes y personal",
    primary: false,
    links: [
      { network: "x", label: "X · @utppanama", url: "https://x.com/utppanama" },
      { network: "facebook", label: "Facebook", url: "https://www.facebook.com/paginautp" },
      { network: "instagram", label: "Instagram", url: "https://www.instagram.com/utppanama" },
    ],
  },
];
