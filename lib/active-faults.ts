// Fallas activas en tierra en el centro de Panamá, junto al Canal y la capital. Trazados de la base de datos de fallas activas
// de Centroamérica y el Caribe (CCAF-DB, Styron, García-Peláez y Pagani, 2020, Natural Hazards and Earth System Sciences
// 20:831-857), integrada en la GEM Global Active Faults Database (Styron y Pagani, 2020, Earthquake Spectra 36(1_suppl):160-180),
// licencia Creative Commons Atribución-CompartirIgual 4.0 (CC BY-SA 4.0): esta extracción se comparte con la misma licencia.
// Coordenadas [longitud, latitud], redondeadas a 4 decimales (~10 m). Los trazados están mapeados a escalas de 1:75 000 a
// 1:300 000: su posición puede diferir unos cientos de metros de la real. Inclinación (`dip`) y hacia dónde baja (`dipDir`),
// también de la CCAF-DB; la base de datos no publica la profundidad hasta la que llegan.
//
// Datos de cada falla:
// - Pedro Miguel y Limón: Rockwell, Gath, González y otros (2010), «Neotectonics and paleoseismology of the Limón and Pedro
//   Miguel faults in Panamá: earthquake hazard to the Panamá Canal», Bulletin of the Seismological Society of America
//   100(6):3097-3129, doi:10.1785/0120090342.
// - Gatún: Gath, González, Rockwell y Franceschi, «Tectonic geomorphology and paleoseismology of the Gatún fault in central
//   Panamá: seismic hazards and the Panamá Canal», 35.º Congreso Geológico Internacional (IGC35), resumen 1270.

export type ActiveFault = {
  id: string;
  name: string;
  // Sentido del movimiento, en palabras.
  kind: string;
  // Tramos del trazado (una falla puede tener varios).
  lines: [number, number][][];
  // Inclinación del plano de falla (90 = vertical) y hacia dónde baja, si no es vertical.
  dip: number;
  dipDir: "E" | null;
  // Datos publicados, tal cual.
  facts: string[];
};

export const ACTIVE_FAULTS: ActiveFault[] = [
  {
    id: "pedro-miguel",
    name: "Falla de Pedro Miguel",
    kind: "de desplazamiento lateral derecho: los dos bloques se mueven de lado, uno respecto del otro",
    lines: [
      [[-79.6414, 9.1804], [-79.6409, 9.1745], [-79.6394, 9.1685], [-79.6394, 9.1656], [-79.639, 9.1628], [-79.6397, 9.157], [-79.6399, 9.1539], [-79.6414, 9.1473], [-79.6416, 9.1403], [-79.6423, 9.1375], [-79.6423, 9.1341], [-79.6409, 9.1282], [-79.6397, 9.1234], [-79.6387, 9.1196], [-79.6356, 9.1148], [-79.6344, 9.1112], [-79.6328, 9.1076], [-79.6311, 9.1026], [-79.6304, 9.0993], [-79.6289, 9.0952], [-79.6275, 9.0919], [-79.6266, 9.0893], [-79.6251, 9.085], [-79.6247, 9.0821], [-79.6249, 9.0788], [-79.6261, 9.0742], [-79.6242, 9.0695], [-79.6235, 9.0657], [-79.623, 9.0614], [-79.6206, 9.0573], [-79.6194, 9.0537], [-79.6184, 9.0502], [-79.617, 9.0473], [-79.6165, 9.044], [-79.6156, 9.0416], [-79.6134, 9.0382], [-79.6122, 9.0366], [-79.6118, 9.0313], [-79.6115, 9.0277], [-79.6118, 9.0218], [-79.6099, 9.0134], [-79.6085, 9.01], [-79.6063, 9.0084], [-79.5998, 9.0017], [-79.5989, 8.9977], [-79.5979, 8.9907], [-79.5944, 8.9822], [-79.5934, 8.9762], [-79.591, 8.9678], [-79.5905, 8.959], [-79.5908, 8.9502], [-79.5913, 8.9416], [-79.5913, 8.9366], [-79.5922, 8.9313], [-79.5924, 8.9261], [-79.5932, 8.9134], [-79.5951, 8.9049], [-79.5965, 8.8999], [-79.5975, 8.8946], [-79.5975, 8.8925]],
    ],
    dip: 90,
    dipDir: null,
    facts: [
      "Tres rupturas en la superficie en unos 1 600 años; la más reciente fue el terremoto del 2 de mayo de 1621, que destruyó en parte Panamá Viejo.",
      "En ese sismo de 1621 el terreno se desplazó al menos 2,1 m cerca del Canal.",
      "Se desliza unos 5 mm por año (entre 3,5 y 8 mm, según la base de datos de GEM).",
    ],
  },
  {
    id: "limon",
    name: "Falla de Limón",
    kind: "de desplazamiento lateral derecho, con algo de hundimiento de uno de sus lados",
    lines: [
      [[-79.5593, 9.3576], [-79.5629, 9.3481], [-79.5682, 9.3389], [-79.5767, 9.3264], [-79.5829, 9.3179], [-79.5849, 9.3074], [-79.5875, 9.295], [-79.5938, 9.2805], [-79.6036, 9.2691], [-79.6174, 9.2573], [-79.6272, 9.2497], [-79.6351, 9.2402], [-79.6387, 9.231], [-79.6423, 9.2212], [-79.6482, 9.2074], [-79.6511, 9.1946], [-79.6557, 9.1825], [-79.657, 9.1717], [-79.6583, 9.1677], [-79.6597, 9.1635], [-79.6679, 9.1481], [-79.6777, 9.1264], [-79.6856, 9.1159]],
    ],
    dip: 80,
    dipDir: "E",
    facts: [
      "Al menos tres rupturas en la superficie en los últimos 950 a 1 400 años; la más reciente, en los últimos 365 años.",
      "Junto con la de Pedro Miguel podría romperse en un mismo sismo de magnitud cercana a 7, a lo largo de más de 40 km.",
    ],
  },
  {
    id: "gatun",
    name: "Falla de Gatún",
    kind: "de desplazamiento lateral izquierdo, con un leve levantamiento del lado norte",
    lines: [
      [[-79.4547, 9.4042], [-79.4426, 9.4051], [-79.4357, 9.4051], [-79.4255, 9.4058], [-79.4193, 9.4068], [-79.4108, 9.4101], [-79.4029, 9.413], [-79.3963, 9.4166], [-79.3901, 9.4222], [-79.3862, 9.4261], [-79.3822, 9.4297], [-79.377, 9.435], [-79.3718, 9.4386], [-79.3603, 9.4488], [-79.3554, 9.4534], [-79.3504, 9.4609], [-79.3429, 9.4714], [-79.3367, 9.4793], [-79.3337, 9.4829], [-79.3281, 9.4852], [-79.3235, 9.4861], [-79.3199, 9.4884], [-79.3085, 9.4914], [-79.3006, 9.495], [-79.2901, 9.5006], [-79.2868, 9.5035], [-79.2793, 9.5071], [-79.2704, 9.5111], [-79.2619, 9.5173], [-79.2563, 9.5199], [-79.2494, 9.5235], [-79.2426, 9.5278], [-79.233, 9.5284], [-79.2278, 9.5275], [-79.2222, 9.5268], [-79.218, 9.5271], [-79.2117, 9.5281], [-79.2048, 9.5301], [-79.1884, 9.537], [-79.1773, 9.5455], [-79.1681, 9.5521], [-79.1596, 9.5566], [-79.1511, 9.5612]],
      [[-79.8699, 9.2158], [-79.8688, 9.2175], [-79.8672, 9.2187], [-79.8653, 9.2203], [-79.8643, 9.2217], [-79.8631, 9.2235], [-79.8624, 9.2242], [-79.8608, 9.2248], [-79.8592, 9.2261], [-79.8582, 9.2271], [-79.8577, 9.2281], [-79.8574, 9.2288], [-79.8563, 9.2299], [-79.8543, 9.2316], [-79.852, 9.2331], [-79.8496, 9.2362], [-79.848, 9.2408], [-79.8441, 9.2423], [-79.8334, 9.246], [-79.8243, 9.2479], [-79.8167, 9.2513], [-79.8079, 9.2565], [-79.801, 9.2582], [-79.7931, 9.2627], [-79.7895, 9.2658], [-79.7823, 9.2682], [-79.7745, 9.2727], [-79.7695, 9.2747], [-79.7597, 9.2778], [-79.7516, 9.2804], [-79.7399, 9.2835], [-79.7342, 9.2856], [-79.7237, 9.2868], [-79.7155, 9.2883], [-79.707, 9.2928], [-79.706, 9.2935], [-79.6993, 9.2973], [-79.6893, 9.2995], [-79.6857, 9.3018], [-79.6814, 9.304], [-79.6767, 9.305], [-79.6705, 9.3066], [-79.6678, 9.3095], [-79.6643, 9.3131], [-79.6578, 9.3178], [-79.6542, 9.32], [-79.6485, 9.3228], [-79.6423, 9.3243], [-79.6328, 9.3276], [-79.6299, 9.33], [-79.6244, 9.3317], [-79.6182, 9.3341], [-79.6125, 9.3357], [-79.6091, 9.3372], [-79.6072, 9.3381], [-79.6051, 9.3395], [-79.6015, 9.3412], [-79.5948, 9.3438], [-79.591, 9.3462], [-79.5867, 9.3505], [-79.5848, 9.3565], [-79.5812, 9.3622], [-79.5755, 9.3694], [-79.5691, 9.3732], [-79.5595, 9.3775], [-79.5531, 9.3791], [-79.5438, 9.3808], [-79.5333, 9.3834], [-79.5244, 9.3894], [-79.5163, 9.3908], [-79.5085, 9.3913], [-79.4965, 9.3925], [-79.4914, 9.3943], [-79.4864, 9.3956], [-79.4801, 9.3955], [-79.4729, 9.3975], [-79.4659, 9.3999], [-79.4596, 9.4007], [-79.4557, 9.4024], [-79.4549, 9.4031]],
      [[-80.0775, 9.0315], [-80.0679, 9.0406], [-80.045, 9.0554], [-80.0154, 9.0731], [-79.9711, 9.0969], [-79.9558, 9.1227], [-79.9501, 9.1317], [-79.9429, 9.1551], [-79.9324, 9.1723], [-79.9238, 9.1795], [-79.8995, 9.1933], [-79.8833, 9.2047], [-79.8732, 9.2138]],
      [[-80.6202, 8.7482], [-80.6073, 8.7554], [-80.5973, 8.7597], [-80.5957, 8.7609], [-80.5835, 8.7649], [-80.5735, 8.7685], [-80.5601, 8.7709], [-80.546, 8.7769], [-80.5374, 8.7819], [-80.5281, 8.7866], [-80.5215, 8.7895], [-80.5105, 8.7931], [-80.4962, 8.7988], [-80.4821, 8.805], [-80.4661, 8.8124], [-80.4573, 8.8208], [-80.4484, 8.8274], [-80.4463, 8.8296], [-80.4363, 8.8375], [-80.427, 8.8451], [-80.4217, 8.8508], [-80.4158, 8.8563], [-80.4086, 8.8597], [-80.3952, 8.868], [-80.3874, 8.8709], [-80.3754, 8.8733], [-80.364, 8.8752], [-80.3463, 8.8814], [-80.3392, 8.8847], [-80.3311, 8.888], [-80.3215, 8.8942], [-80.311, 8.9043], [-80.3072, 8.9071], [-80.301, 8.9109], [-80.2919, 8.9181], [-80.2829, 8.9229], [-80.2681, 8.9305], [-80.249, 8.9391], [-80.2409, 8.9415], [-80.2118, 8.9434], [-80.1948, 8.9513], [-80.1855, 8.9553], [-80.1789, 8.9587], [-80.1719, 8.961], [-80.1588, 8.9661], [-80.1288, 8.9808], [-80.1237, 8.9854], [-80.1123, 8.9902], [-80.1056, 8.9925]],
    ],
    dip: 90,
    dipDir: null,
    facts: [
      "Se desliza entre 6 y 9 mm por año.",
      "Al menos dos, y posiblemente tres, sismos que rompieron la superficie desde el año 1490; el más reciente, a mediados o finales del siglo XIX, la desplazó al menos 0,7 m.",
      "Un tramo de 40 km produciría sismos de magnitud cercana a 6,8 cada 110 a 170 años; si se rompieran sus 120 km, hasta 7,4.",
    ],
  },
];

export const ACTIVE_FAULTS_SOURCE = "Fallas: CCAF-DB / GEM Global Active Faults (Styron et al., 2020), CC BY-SA 4.0";

// Hasta qué profundidad se dibujan los planos de falla en el 3D: la base de datos no la publica; 15 km es el grosor típico de la
// corteza que se rompe en estos sismos. Es ilustrativo y así se dice en la escena.
export const FAULT_DEPTH_KM = 15;

// Punto donde rotular una falla: el del medio de su tramo con más puntos.
export function labelPoint(fault: ActiveFault): [number, number] {
  const longest = fault.lines.reduce((best, line) => (line.length > best.length ? line : best));
  return longest[Math.floor(longest.length / 2)];
}
