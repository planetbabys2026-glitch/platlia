import path from "node:path";
import { env } from "@/lib/env";

/**
 * Dónde viven los ejecutables del agente de impresión.
 *
 * Un solo lugar que lo decida, porque son dos los que preguntan —la consulta que
 * arma el panel y la ruta que entrega el archivo— y ya divergieron una vez: la
 * ruta respetaba `DESCARGAS_AGENTE_DIR` y la consulta miraba siempre
 * `public/descargas/`, así que en el VPS el panel escondía los botones aunque el
 * archivo estuviera montado y sirviéndose bien.
 *
 * Por defecto `public/descargas/`, que es donde los deja `pnpm agente:build`. Se
 * puede mover porque en el despliegue esa carpeta llega vacía: los binarios no se
 * versionan y la imagen de nixpacks no trae Go.
 */
export function carpetaDeDescargas(): string {
  return env.DESCARGAS_AGENTE_DIR ?? path.join(process.cwd(), "public", "descargas");
}

/** Cada sistema con el nombre del archivo que le corresponde. */
export const EJECUTABLES = [
  { so: "windows" as const, etiqueta: "Windows", archivo: "platlia-impresion-windows.exe" },
  { so: "linux" as const, etiqueta: "Linux", archivo: "platlia-impresion-linux" },
  { so: "mac" as const, etiqueta: "macOS", archivo: "platlia-impresion-mac" },
];
