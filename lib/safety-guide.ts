export type SituationId = "casa" | "calle" | "vehiculo" | "costa" | "cuidado";
export type Phase = "durante" | "despues" | "replicas";
export type Tip = { title: string; detail: string };
export type ChecklistItem = { id: string; title: string; detail?: string };
export type Checklist = { id: string; label: string; note?: string; items: ChecklistItem[] };

export const SITUATIONS: { id: SituationId; label: string }[] = [
  { id: "casa", label: "En casa o edificio" },
  { id: "calle", label: "En la calle" },
  { id: "vehiculo", label: "En un vehículo" },
  { id: "costa", label: "En la costa" },
  { id: "cuidado", label: "Con niños o personas mayores" },
];

export const PHASES: { id: Phase; label: string }[] = [
  { id: "durante", label: "Durante el temblor" },
  { id: "despues", label: "Justo después" },
  { id: "replicas", label: "Próximas horas y réplicas" },
];

export const GUIDE: Record<SituationId, Record<Phase, Tip[]>> = {
  casa: {
    durante: [
      { title: "Agáchate, cúbrete y sujétate", detail: "Bajo una mesa firme o junto a una pared interior. Protege tu cabeza." },
      { title: "Aléjate de ventanas y estantes", detail: "Evita vidrios, espejos y muebles altos que puedan caer." },
      { title: "No corras ni uses el ascensor", detail: "Espera a que cese el temblor antes de moverte." },
      { title: "Si estás en la cama, quédate ahí", detail: "Cubre tu cabeza con una almohada y espera." },
    ],
    despues: [
      { title: "Cierra gas y electricidad", detail: "Si hueles gas o hay chispas, corta llaves y no enciendas fuego." },
      { title: "Ponte zapatos cerrados", detail: "Evita cortes con vidrios o escombros en el piso." },
      { title: "Revisa heridos y estructura", detail: "Si hay grietas profundas en columnas o paredes, evacúa por escalera." },
    ],
    replicas: [
      { title: "Ten a mano linterna y agua", detail: "Mantén el celular cargado y calzado cerca de la cama." },
      { title: "Prepárate para réplicas", detail: "Vuelve a protegerte si comienza a temblar de nuevo." },
    ],
  },
  calle: {
    durante: [
      { title: "Aléjate de postes y cables", detail: "Cuidado con cornisas, balcones, fachadas y tendido eléctrico." },
      { title: "Busca un área despejada", detail: "Parques, plazas o calles abiertas sin cables encima." },
    ],
    despues: [
      { title: "No toques cables caídos", detail: "Asume que tienen corriente y advierte a otros." },
      { title: "No entres a edificios dañados", detail: "Quédate en el exterior, lejos de muros agrietados." },
      { title: "Usa mensajes de texto", detail: "Deja las llamadas libres para ambulancias y bomberos." },
    ],
    replicas: [
      { title: "Permanece en espacios abiertos", detail: "No camines bajo puentes peatonales ni muros inestables." },
      { title: "Respeta los cordones de seguridad", detail: "Sigue las indicaciones de SINAPROC y la policía." },
    ],
  },
  vehiculo: {
    durante: [
      { title: "Detente a un costado seguro", detail: "Lejos de puentes, postes, árboles y pasos elevados." },
      { title: "Quédate dentro del vehículo", detail: "Mantén el cinturón puesto hasta que pase el temblor." },
    ],
    despues: [
      { title: "Avanza despacio y con cuidado", detail: "Vigila grietas en el asfalto, derrumbes o señales caídas." },
      { title: "Si cae un cable, no salgas", detail: "Quédate adentro y pide auxilio al 911." },
    ],
    replicas: [
      { title: "Evita conducir sin necesidad", detail: "Mantén las vías libres para ambulancias y rescate." },
    ],
  },
  costa: {
    durante: [
      { title: "Agáchate y sujétate", detail: "Mantén la posición mientras dure el temblor." },
      { title: "Si fue fuerte o largo: evacúa ya", detail: "No esperes una alerta oficial de tsunami." },
    ],
    despues: [
      { title: "Sube de inmediato a zona alta", detail: "Al menos 30 metros sobre el mar o tierra adentro, a pie." },
      { title: "No vayas a mirar el mar", detail: "Si el agua se retira rápido, la ola viene en camino." },
    ],
    replicas: [
      { title: "No regreses a la costa", detail: "Espera confirmación de SINAPROC; el riesgo puede durar horas." },
    ],
  },
  cuidado: {
    durante: [
      { title: "Protege a niños con tu cuerpo", detail: "Agáchate junto a ellos y cubre su cabeza y cuello." },
      { title: "Silla de ruedas: frena las ruedas", detail: "Inclínate hacia adelante y cubre tu cabeza con los brazos." },
      { title: "Ayuda a adultos mayores", detail: "Aléjalos de ventanas y objetos que puedan caer." },
    ],
    despues: [
      { title: "Transmite calma", detail: "Explica a los niños lo ocurrido con tranquilidad." },
      { title: "Lleva lo indispensable", detail: "Medicamentos de uso diario, anteojos y documentos clave." },
    ],
    replicas: [
      { title: "Ten medicinas y apoyos a mano", detail: "Déjalos listos junto a la cama por si hay que salir de noche." },
    ],
  },
};

export const ALWAYS: Record<Phase, Tip[]> = {
  durante: [],
  despues: [
    { title: "Comunícate por texto", detail: "Usa WhatsApp o SMS para no saturar las líneas del 911." },
    { title: "Espera réplicas", detail: "Vuelve a agacharte y cubrirte si tiembla otra vez." },
  ],
  replicas: [
    { title: "Solo fuentes oficiales", detail: "Sigue a SINAPROC. No compartas rumores ni audios sin confirmar." },
    { title: "Conserva la calma", detail: "Las réplicas son normales y suelen espaciarse con los días." },
  ],
};

export const CHECKLISTS: Checklist[] = [
  {
    id: "despues",
    label: "Acción inmediata",
    items: [
      { id: "heridos", title: "Verificar heridos", detail: "Atiéndete primero a ti y a quienes te rodean." },
      { id: "calzado", title: "Ponerse zapatos cerrados", detail: "Evita cortes con vidrios en el piso." },
      { id: "gas", title: "Revisar olor a gas", detail: "Si hay olor, cierra la llave de paso y sal." },
      { id: "electrico", title: "Revisar cables eléctricos", detail: "Baja los interruptores si hay chispas." },
      { id: "estructura", title: "Verificar muros y techos", detail: "Si el daño es grave, evacúa por escalera." },
      { id: "familia", title: "Avisar que estás bien por mensaje" },
    ],
  },
  {
    id: "mochila",
    label: "Mochila 72h",
    note: "Kit básico de 72 horas recomendado por SINAPROC.",
    items: [
      { id: "agua", title: "Agua embotellada", detail: "2 a 3 litros diarios por persona." },
      { id: "comida", title: "Comida enlatada o seca", detail: "Que no requiera cocinar, con abrelatas." },
      { id: "medicinas", title: "Botiquín y medicamentos diarios" },
      { id: "linterna", title: "Linterna y pilas de repuesto" },
      { id: "cargador", title: "Batería portátil para el celular" },
      { id: "documentos", title: "Copias de cédula y contactos en bolsa plástica" },
      { id: "silbato", title: "Silbato y dinero en efectivo" },
    ],
  },
  {
    id: "familia",
    label: "Plan familiar",
    items: [
      { id: "punto", title: "Punto de encuentro seguro fuera de casa" },
      { id: "contacto", title: "Contacto de emergencia fuera de la ciudad" },
      { id: "llaves", title: "Todos saben cerrar gas, agua y luz" },
      { id: "evacuacion", title: "Ruta de salida despejada hacia zona segura" },
    ],
  },
];
