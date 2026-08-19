import path from "node:path";
import { existsSync } from "node:fs";
import { env } from "@/lib/env";

/**
 * De dónde sale el ejecutable del agente de impresión.
 *
 * Un solo lugar que lo decida, porque son dos los que preguntan —la consulta que
 * arma el panel y la ruta que entrega el archivo— y ya divergieron una vez: la
 * ruta respetaba `DESCARGAS_AGENTE_DIR` y la consulta miraba siempre
 * `public/descargas/`, así que en el VPS el panel escondía los botones aunque el
 * archivo estuviera montado y sirviéndose bien.
 *
 * Hay tres orígenes posibles y se prueban en este orden:
 *
 * 1. **Una URL por sistema** (`DESCARGAS_AGENTE_URL_*`) — Cloudinary, S3, un
 *    release de GitHub. Es la salida cuando no hay dónde montar un volumen.
 * 2. **Una carpeta del servidor** (`DESCARGAS_AGENTE_DIR`) — un volumen del VPS.
 * 3. **`public/descargas/`**, que es donde los deja `pnpm agente:build` en una
 *    máquina de desarrollo con Go.
 *
 * Ninguno de los tres viaja con el despliegue: los binarios no se versionan
 * —~7 MB por sistema— y la imagen de nixpacks no trae Go.
 */

/** Cada sistema con el nombre del archivo que le corresponde. */
export const EJECUTABLES = [
  { so: "windows" as const, etiqueta: "Windows", archivo: "platlia-impresion-windows.exe" },
  { so: "linux" as const, etiqueta: "Linux", archivo: "platlia-impresion-linux" },
  { so: "mac" as const, etiqueta: "macOS", archivo: "platlia-impresion-mac" },
];

export type SistemaOperativo = (typeof EJECUTABLES)[number]["so"];

/** La carpeta del servidor donde buscar, cuando no hay URL configurada. */
export function carpetaDeDescargas(): string {
  return env.DESCARGAS_AGENTE_DIR ?? path.join(process.cwd(), "public", "descargas");
}

const URLS: Record<SistemaOperativo, string | undefined> = {
  windows: env.DESCARGAS_AGENTE_URL_WINDOWS,
  linux: env.DESCARGAS_AGENTE_URL_LINUX,
  mac: env.DESCARGAS_AGENTE_URL_MAC,
};

export type FuenteDelEjecutable =
  | { tipo: "remoto"; url: string }
  | { tipo: "local"; ruta: string };

/**
 * Dónde está el ejecutable de un sistema, o `null` si no está en ninguna parte.
 *
 * La URL le gana a la carpeta: si alguien se tomó el trabajo de configurarla es
 * porque ahí está el binario al día, y un archivo viejo olvidado en el volumen
 * sería un agente desactualizado instalándose sin que nadie lo note.
 */
export function fuenteDelEjecutable(so: SistemaOperativo): FuenteDelEjecutable | null {
  const url = URLS[so];
  if (url) return { tipo: "remoto", url };

  const archivo = EJECUTABLES.find((e) => e.so === so)?.archivo;
  if (!archivo) return null;

  const ruta = path.join(carpetaDeDescargas(), archivo);
  // Se mira el disco acá y no en cada llamador: es lo que hace que el panel diga
  // "no hay programa publicado" en vez de ofrecer un enlace que devuelve 404.
  return existsSync(ruta) ? { tipo: "local", ruta } : null;
}
