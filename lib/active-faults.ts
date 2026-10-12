// Fallas activas en tierra junto al Canal de Panamá y la capital. Trazados de la base de datos de fallas activas de
// Centroamérica y el Caribe (CCAF-DB, Styron, García-Peláez y Pagani, 2020, Natural Hazards and Earth System Sciences 20:831-857),
// integrada en la GEM Global Active Faults Database (Styron y Pagani, 2020, Earthquake Spectra 36(1_suppl):160-180),
// licencia Creative Commons Atribución-CompartirIgual 4.0 (CC BY-SA 4.0): esta extracción se comparte con la misma licencia.
// Coordenadas [longitud, latitud], redondeadas a 4 decimales (~10 m). Los trazados están mapeados a escala 1:100 000
// (Pedro Miguel) y 1:150 000 (Limón): su posición puede diferir unos cientos de metros de la real.
//
// Datos de cada falla: Rockwell, Gath, González y otros (2010), «Neotectonics and paleoseismology of the Limón and Pedro Miguel
// faults in Panamá: earthquake hazard to the Panamá Canal», Bulletin of the Seismological Society of America 100(6):3097-3129,
// doi:10.1785/0120090342.

export type ActiveFault = {
  id: string;
  name: string;
  short: string;
  // Sentido del movimiento, en palabras.
  kind: string;
  points: [number, number][];
  // Datos publicados (Rockwell et al., 2010), tal cual.
  facts: string[];
  source: string;
};

export const ACTIVE_FAULTS: ActiveFault[] = [
  {
    id: "pedro-miguel",
    name: "Falla de Pedro Miguel",
    short: "Pedro Miguel",
    kind: "de desplazamiento lateral derecho: los dos bloques se mueven de lado, uno respecto del otro",
    points: [[-79.6414, 9.1804], [-79.6409, 9.1745], [-79.6394, 9.1685], [-79.6394, 9.1656], [-79.639, 9.1628], [-79.6397, 9.157], [-79.6399, 9.1539], [-79.6414, 9.1473], [-79.6416, 9.1403], [-79.6423, 9.1375], [-79.6423, 9.1341], [-79.6409, 9.1282], [-79.6397, 9.1234], [-79.6387, 9.1196], [-79.6356, 9.1148], [-79.6344, 9.1112], [-79.6328, 9.1076], [-79.6311, 9.1026], [-79.6304, 9.0993], [-79.6289, 9.0952], [-79.6275, 9.0919], [-79.6266, 9.0893], [-79.6251, 9.085], [-79.6247, 9.0821], [-79.6249, 9.0788], [-79.6261, 9.0742], [-79.6242, 9.0695], [-79.6235, 9.0657], [-79.623, 9.0614], [-79.6206, 9.0573], [-79.6194, 9.0537], [-79.6184, 9.0502], [-79.617, 9.0473], [-79.6165, 9.044], [-79.6156, 9.0416], [-79.6134, 9.0382], [-79.6122, 9.0366], [-79.6118, 9.0313], [-79.6115, 9.0277], [-79.6118, 9.0218], [-79.6099, 9.0134], [-79.6085, 9.01], [-79.6063, 9.0084], [-79.5998, 9.0017], [-79.5989, 8.9977], [-79.5979, 8.9907], [-79.5944, 8.9822], [-79.5934, 8.9762], [-79.591, 8.9678], [-79.5905, 8.959], [-79.5908, 8.9502], [-79.5913, 8.9416], [-79.5913, 8.9366], [-79.5922, 8.9313], [-79.5924, 8.9261], [-79.5932, 8.9134], [-79.5951, 8.9049], [-79.5965, 8.8999], [-79.5975, 8.8946], [-79.5975, 8.8925]],
    facts: [
      "Tres rupturas en la superficie en unos 1 600 años; la más reciente fue el terremoto del 2 de mayo de 1621, que destruyó en parte Panamá Viejo.",
      "En ese sismo de 1621 el terreno se desplazó al menos 2,1 m cerca del Canal.",
      "Se desliza unos 5 mm por año (entre 3,5 y 8 mm, según la base de datos de GEM).",
    ],
    source: "Rockwell et al. (2010), BSSA 100(6); trazado: CCAF-DB / GEM (CC BY-SA 4.0)",
  },
  {
    id: "limon",
    name: "Falla de Limón",
    short: "Limón",
    kind: "de desplazamiento lateral derecho, con algo de hundimiento de uno de sus lados",
    points: [[-79.5593, 9.3576], [-79.5629, 9.3481], [-79.5682, 9.3389], [-79.5767, 9.3264], [-79.5829, 9.3179], [-79.5849, 9.3074], [-79.5875, 9.295], [-79.5938, 9.2805], [-79.6036, 9.2691], [-79.6174, 9.2573], [-79.6272, 9.2497], [-79.6351, 9.2402], [-79.6387, 9.231], [-79.6423, 9.2212], [-79.6482, 9.2074], [-79.6511, 9.1946], [-79.6557, 9.1825], [-79.657, 9.1717], [-79.6583, 9.1677], [-79.6597, 9.1635], [-79.6679, 9.1481], [-79.6777, 9.1264], [-79.6856, 9.1159]],
    facts: [
      "Al menos tres rupturas en la superficie en los últimos 950 a 1 400 años; la más reciente, en los últimos 365 años.",
      "Junto con la de Pedro Miguel podría romperse en un mismo sismo de magnitud cercana a 7, a lo largo de más de 40 km.",
    ],
    source: "Rockwell et al. (2010), BSSA 100(6); trazado: CCAF-DB / GEM (Bennett et al., 2014) (CC BY-SA 4.0)",
  },
];

export const ACTIVE_FAULTS_SOURCE = "Fallas: CCAF-DB / GEM Global Active Faults (Styron et al., 2020), CC BY-SA 4.0";
