/**
 * Paleta de colores solidos y vivos para etiquetas de anotacion.
 * El mismo label siempre produce el mismo color (hash djb2 → indice en paleta).
 * Colores claros y distintos para maxima visibilidad sobre el frame.
 */

const PALETTE = [
  { r: 59,  g: 130, b: 246 },  // azul
  { r: 234, g: 179, b: 8   },  // amarillo
  { r: 239, g: 68,  b: 68  },  // rojo
  { r: 34,  g: 197, b: 94  },  // verde
  { r: 249, g: 115, b: 22  },  // naranja
  { r: 168, g: 85,  b: 247 },  // morado
  { r: 236, g: 72,  b: 153 },  // rosa
  { r: 20,  g: 184, b: 166 },  // teal
  { r: 251, g: 191, b: 36  },  // ambar
  { r: 99,  g: 102, b: 241 },  // indigo
  { r: 16,  g: 185, b: 129 },  // esmeralda
  { r: 244, g: 63,  b: 94  },  // rosa fuerte
];

export function labelToColor(label = "", alpha = 160) {
  let hash = 5381;
  for (let i = 0; i < label.length; i++) {
    hash = ((hash << 5) + hash) + label.charCodeAt(i);
    hash |= 0;
  }
  const col = PALETTE[Math.abs(hash) % PALETTE.length];
  return {
    r: col.r,
    g: col.g,
    b: col.b,
    alpha,
    css: `rgba(${col.r},${col.g},${col.b},${(alpha / 255).toFixed(2)})`,
  };
}
