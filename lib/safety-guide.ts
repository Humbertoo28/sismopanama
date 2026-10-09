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
      { title: "Agáchate, cúbrete y sujétate", detail: "Ponte de rodillas, protege cabeza y cuello bajo una mesa resistente y sujétate de ella hasta que termine el movimiento." },
      { title: "Aléjate de ventanas y objetos que caen", detail: "Vidrios, espejos, lámparas, estantes y muebles altos pueden caer o romperse." },
      { title: "No corras ni uses el ascensor", detail: "Muchas lesiones ocurren al intentar moverse o salir mientras todavía tiembla." },
      { title: "Si estás en la cama, quédate", detail: "Protégete la cabeza con una almohada y espera a que pase." },
    ],
    despues: [
      { title: "Revisa si hay heridos", detail: "Atiende primero tus lesiones y las de quienes te rodean. Llama al 911 solo si hay una emergencia real." },
      { title: "Ponte calzado resistente", detail: "Puede haber vidrios y escombros en el piso." },
      { title: "Si hueles gas, sal de inmediato", detail: "No uses fósforos, encendedores ni interruptores. Abre ventanas al salir." },
      { title: "Sal si el edificio está dañado", detail: "Con grietas grandes, paredes inclinadas o techos hundidos, baja por las escaleras y no regreses hasta que un especialista lo revise." },
    ],
    replicas: [
      { title: "Identifica un lugar seguro en cada cuarto", detail: "Piensa dónde te agacharías y cubrirías si llega una réplica, sobre todo donde duermes." },
      { title: "Compara las grietas con las de antes", detail: "Si tomaste fotos de las paredes antes del sismo, úsalas para detectar daños nuevos." },
      { title: "Deja a mano linterna, agua y documentos", detail: "Y mantén el teléfono cargado." },
    ],
  },
  calle: {
    durante: [
      { title: "Aléjate de edificios, postes y cables", detail: "Fachadas, balcones, cornisas y cables pueden caer." },
      { title: "Busca un espacio abierto", detail: "Un parque, una plaza o un terreno despejado." },
      { title: "Si no hay espacio abierto, agáchate", detail: "Protégete la cabeza y el cuello hasta que termine el temblor." },
    ],
    despues: [
      { title: "No toques cables caídos", detail: "Considera que tienen corriente y avisa a los demás para que se alejen." },
      { title: "No entres a edificios dañados", detail: "Mantente lejos de fachadas y estructuras agrietadas." },
      { title: "Avisa que estás bien con un mensaje de texto", detail: "Saturan menos las redes que las llamadas." },
    ],
    replicas: [
      { title: "Quédate en espacios abiertos o seguros", detail: "Evita pasar bajo puentes peatonales, fachadas o cables dañados." },
      { title: "Respeta las zonas acordonadas", detail: "Sigue las indicaciones de las autoridades en cierres de calles." },
    ],
  },
  vehiculo: {
    durante: [
      { title: "Detente en un lugar seguro", detail: "Lejos de edificios, árboles, postes, puentes y pasos elevados." },
      { title: "Quédate dentro con el cinturón puesto", detail: "El vehículo te protege de objetos que caen hasta que termine el temblor." },
    ],
    despues: [
      { title: "Avanza con cuidado", detail: "Evita puentes, rampas y túneles que puedan estar dañados, y mira si hay grietas en la vía." },
      { title: "Si cae un cable sobre el vehículo, no salgas", detail: "Quédate dentro y pide ayuda al 911 hasta que personal capacitado desconecte la energía." },
      { title: "Escucha información oficial", detail: "Sintoniza la radio o revisa canales oficiales antes de decidir tu ruta." },
    ],
    replicas: [
      { title: "No conduzcas si no es necesario", detail: "Las calles pueden estar dañadas y las ambulancias necesitan pasar." },
      { title: "Si debes salir, hazlo despacio", detail: "Atento a asfalto agrietado, derrumbes y señales caídas." },
    ],
  },
  costa: {
    durante: [
      { title: "Agáchate, cúbrete y sujétate", detail: "Hazlo mientras dure el movimiento." },
      { title: "Si fue fuerte o largo, no esperes una alerta", detail: "Cuando termine, ve de inmediato a terreno alto o lejos del mar." },
      { title: "Conoce las señales naturales de tsunami", detail: "El mar se retira de golpe, sube rápido o se oye un rugido fuerte desde el océano." },
    ],
    despues: [
      { title: "Aléjate de la playa, ríos y desembocaduras", detail: "Ve a terreno alto, a pie si puedes, para no quedar atrapado en el tráfico." },
      { title: "Sigue las indicaciones oficiales", detail: "Revisa SINAPROC y tsunami.gov mientras te desplazas, si tienes señal." },
      { title: "No vayas a mirar el mar", detail: "Un tsunami puede ser una serie de olas y la primera no siempre es la mayor." },
    ],
    replicas: [
      { title: "No regreses a la costa hasta que sea seguro", detail: "Espera la autorización de las autoridades, aunque el mar parezca tranquilo: un tsunami puede durar horas." },
    ],
  },
  cuidado: {
    durante: [
      { title: "Niños: agáchate junto a ellos", detail: "Cúbrelos con tu cuerpo y protégeles la cabeza y el cuello." },
      { title: "Silla de ruedas o andador: frénalos", detail: "Inclínate, cúbrete la cabeza y el cuello y mantén la posición hasta que termine." },
      { title: "Personas mayores: ayúdalas a cubrirse", detail: "Aléjalas de ventanas y de objetos que puedan caer." },
    ],
    despues: [
      { title: "Mantén a los niños contigo", detail: "Explícales con calma lo que pasó: tu tranquilidad les ayuda." },
      { title: "Pregunta por vecinos mayores o con discapacidad", detail: "Si es seguro, ofrece ayuda para salir o conseguir medicinas." },
      { title: "Si hay que salir, lleva lo esencial", detail: "Medicinas, lentes, audífonos y ayudas de movilidad." },
    ],
    replicas: [
      { title: "Practica con los niños qué hacer en una réplica", detail: "Agacharse, cubrirse y sujetarse." },
      { title: "Deja las medicinas y ayudas de movilidad cerca de la cama", detail: "Así las tienes a mano si hay que moverse de noche." },
    ],
  },
};

export const ALWAYS: Record<Phase, Tip[]> = {
  durante: [],
  despues: [
    { title: "Escribe en vez de llamar", detail: "Usa mensajes de texto para avisar que estás bien y deja libres las líneas para emergencias." },
    { title: "Espera réplicas", detail: "Si tiembla de nuevo, vuelve a agacharte, cubrirte y sujetarte." },
    { title: "Sigue a las autoridades", detail: "Si te indican evacuar o permanecer en un lugar, hazles caso." },
  ],
  replicas: [
    { title: "Espera réplicas durante días o semanas", detail: "Algunas pueden ser fuertes. Con el tiempo se vuelven menos frecuentes, pero no desaparecen de inmediato." },
    { title: "Infórmate solo en canales oficiales", detail: "SINAPROC y USGS. No compartas fotos, videos ni cifras sin verificar." },
    { title: "Documenta los daños con fotos antes de limpiar", detail: "Te servirá para reportes y seguros." },
    { title: "Cuida tu bienestar", detail: "Es normal sentir miedo o dormir mal. Hablar con otras personas y mantener rutinas ayuda; si no mejora, busca apoyo profesional." },
  ],
};

export const CHECKLISTS: Checklist[] = [
  {
    id: "despues",
    label: "Después del temblor",
    items: [
      { id: "heridos", title: "Revisé si hay heridos", detail: "Primero tú, luego quienes te rodean." },
      { id: "calzado", title: "Me puse calzado resistente" },
      { id: "gas", title: "No huelo a gas ni oigo siseo", detail: "Si lo hay: sal, abre ventanas y no uses llamas ni interruptores." },
      { id: "electrico", title: "No hay cables dañados, chispas ni agua cerca de enchufes", detail: "Si los hay, no toques nada eléctrico y avisa." },
      { id: "estructura", title: "Revisé grietas, techos y columnas", detail: "Compáralas con fotos previas. Si el daño es serio, sal y no regreses." },
      { id: "familia", title: "Avisé que estoy bien por mensaje de texto" },
      { id: "vecinos", title: "Pregunté por vecinos mayores o con discapacidad" },
      { id: "fotos", title: "Tomé fotos de los daños antes de limpiar" },
    ],
  },
  {
    id: "mochila",
    label: "Mochila de 72 horas",
    note: "Kit de 72 horas: recomendación del director de SINAPROC.",
    items: [
      { id: "agua", title: "Agua potable", detail: "Unos 3 a 4 litros por persona al día, para 3 días." },
      { id: "comida", title: "Alimentos secos y enlatados", detail: "Que no necesiten refrigeración ni cocción; incluye abrelatas." },
      { id: "medicinas", title: "Medicinas y botiquín", detail: "Medicamentos de uso diario para al menos 3 días." },
      { id: "linterna", title: "Linterna y baterías de repuesto" },
      { id: "radio", title: "Radio a pilas" },
      { id: "cargador", title: "Cargador portátil para el celular" },
      { id: "documentos", title: "Copias de documentos y contactos", detail: "Cédula, seguros y teléfonos de familiares, en una bolsa impermeable." },
      { id: "ropa", title: "Ropa, abrigo y calzado resistente" },
      { id: "silbato", title: "Silbato", detail: "Para pedir ayuda si quedas atrapado." },
      { id: "efectivo", title: "Efectivo en billetes pequeños", detail: "Los cajeros y los pagos electrónicos pueden fallar." },
    ],
  },
  {
    id: "familia",
    label: "Plan familiar",
    items: [
      { id: "punto", title: "Acordamos un punto de encuentro fuera de casa" },
      { id: "contacto", title: "Tenemos un contacto fuera de la zona", detail: "Alguien a quien todos avisamos que estamos bien." },
      { id: "practica", title: "Todos sabemos agacharnos, cubrirnos y sujetarnos" },
      { id: "servicios", title: "Sabemos cortar gas, agua y luz" },
      { id: "ruta", title: "Conocemos la salida y, si vivimos cerca del mar, la zona alta" },
    ],
  },
];
