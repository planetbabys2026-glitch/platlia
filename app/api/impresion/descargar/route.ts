import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { carpetaDeDescargas } from "@/lib/printing/descargas";

/**
 * Entrega el programa con el código de emparejamiento **en el nombre del archivo**.
 *
 * Es lo que evita que alguien tenga que copiar un token de 43 caracteres a un
 * archivo de texto. El programa lee su propio nombre, saca el código, lo canjea
 * por su token y se guarda la configuración solo: bajar y hacer doble clic es todo.
 *
 * Los archivos viven en `public/descargas/` y ahí Next ya los sirve como
 * estáticos. Esta ruta existe por dos cosas que un estático no puede hacer:
 * cambiarles el nombre al vuelo —que es donde viaja el código— y leerlos de una
 * carpeta fuera del proyecto (`DESCARGAS_AGENTE_DIR`), que es lo que permite
 * subirlos a un volumen del VPS sin versionar 20 MB ni meter Go en la imagen de
 * despliegue.
 *
 * Es pública: el ejecutable es idéntico para todos los locales y no lleva ningún
 * secreto. El código sí es un secreto, pero lo trae quien pide, no lo damos acá.
 */
export const dynamic = "force-dynamic";

const ARCHIVOS: Record<string, { archivo: string; nombreBase: string }> = {
  windows: { archivo: "platlia-impresion-windows.exe", nombreBase: "platlia-impresion" },
  linux: { archivo: "platlia-impresion-linux", nombreBase: "platlia-impresion" },
  mac: { archivo: "platlia-impresion-mac", nombreBase: "platlia-impresion" },
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const so = url.searchParams.get("so") ?? "windows";
  const codigo = (url.searchParams.get("codigo") ?? "").replace(/[^0-9A-Za-z-]/g, "");

  const objetivo = ARCHIVOS[so];
  if (!objetivo) return new Response("Sistema no reconocido", { status: 404 });

  const ruta = path.join(carpetaDeDescargas(), objetivo.archivo);
  if (!existsSync(ruta)) {
    return new Response(
      "Todavía no está compilado el programa para ese sistema. Se genera con `pnpm agente:build`.",
      { status: 404 },
    );
  }

  // El código va en el nombre, separado por guiones bajos para que se distinga de
  // los guiones del propio código. La extensión queda al final para que Windows
  // lo siga reconociendo como ejecutable.
  const extension = so === "windows" ? ".exe" : "";
  const nombre = codigo
    ? `${objetivo.nombreBase}__${codigo}${extension}`
    : `${objetivo.nombreBase}${extension}`;

  const tamano = statSync(ruta).size;
  const cuerpo = Readable.toWeb(createReadStream(ruta)) as WebReadableStream<Uint8Array>;

  return new Response(cuerpo as unknown as ReadableStream, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(tamano),
      "Content-Disposition": `attachment; filename="${nombre}"`,
      // El binario cambia cuando se recompila y el nombre cambia con cada código:
      // que no quede pegado en ninguna caché intermedia.
      "Cache-Control": "no-store",
    },
  });
}
