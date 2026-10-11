// Una profundidad de exactamente 10 o 5 km casi siempre es un valor asignado cuando el catálogo no logra calcularla
// (el USGS lo marca como «operator assigned»: así están los 54 sismos suyos con 10 km que se revisaron uno por uno).
// En la vista 3D se dibuja hueca para no aparentar una precisión que no hay.
export const isRoundDepth = (depth: number | undefined | null) => depth === 10 || depth === 5;
