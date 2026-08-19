import { createReadStream, statSync } from "node:fs";
import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { fuenteDelEjecutable, type SistemaOperativo } from "@/lib/printing/descargas";

/**
 * Entrega el programa con el código de emparejamiento **en el nombre del archivo**.
 *
 * Es lo que evita que alguien tenga que copiar un token de 43 caracteres a un
 * archivo de texto. El programa lee su propio nombre, saca el código, lo canjea
 * por su token y se guarda la configuración solo: bajar y hacer doble clic es todo.
 *
 * Esta ruta existe por dos cosas que un archivo estático no puede hacer:
 * **cambiarle el nombre al vuelo** —que es donde viaja el código— y traerlo de
 * fuera del proyecto, sea de un volumen del VPS (`DESCARGAS_AGENTE_DIR`) o de un
 * hosting cualquiera (`DESCARGAS_AGENTE_URL_*`). Los binarios no se versionan y
 * la imagen de despliegue no trae Go, así que nunca están adentro.
 *
 * Con una URL configurada el archivo se **retransmite**, no se redirige. Un
 * `302` al hosting entregaría el archivo con el nombre que tenga allá, sin el
 * código adentro, y el doble clic dejaría de alcanzar: habría que ir a pegar el
 * código a mano en la página local del agente. El precio es que los 7 MB pasan
 * por el servidor, una vez por instalación.
 *
 * Es pública: el ejecutable es idéntico para todos los locales y no lleva ningún
 * secreto. El código sí es un secreto, pero lo trae quien pide, no lo damos acá.
 */
export const dynamic = "force-dynamic";

const NOMBRE_BASE = "platlia-impresion";
const SISTEMAS: SistemaOperativo[] = ["windows", "linux", "mac"];

export async function GET(req: Request) {
  const url = new URL(req.url);
  const pedido = url.searchParams.get("so") ?? "windows";
  const codigo = (url.searchParams.get("codigo") ?? "").replace(/[^0-9A-Za-z-]/g, "");

  const so = SISTEMAS.find((s) => s === pedido);
  if (!so) return new Response("Sistema no reconocido", { status: 404 });

  const fuente = fuenteDelEjecutable(so);
  if (!fuente) {
    return new Response(
      "El programa no está publicado en este servidor. Se compila con `pnpm agente:build` " +
        "y se sube a `DESCARGAS_AGENTE_DIR` o a `DESCARGAS_AGENTE_URL_*`.",
      { status: 404 },
    );
  }

  // El código va en el nombre, separado por guiones bajos para que se distinga de
  // los guiones del propio código. La extensión queda al final para que Windows
  // lo siga reconociendo como ejecutable — y como el nombre lo ponemos acá, del
  // otro lado el archivo puede llamarse de cualquier manera.
  const extension = so === "windows" ? ".exe" : "";
  const nombre = codigo
    ? `${NOMBRE_BASE}__${codigo}${extension}`
    : `${NOMBRE_BASE}${extension}`;

  const cabeceras: Record<string, string> = {
    "Content-Type": "application/octet-stream",
    "Content-Disposition": `attachment; filename="${nombre}"`,
    // El binario cambia cuando se recompila y el nombre cambia con cada código:
    // que no quede pegado en ninguna caché intermedia.
    "Cache-Control": "no-store",
  };

  if (fuente.tipo === "local") {
    cabeceras["Content-Length"] = String(statSync(fuente.ruta).size);
    const cuerpo = Readable.toWeb(
      createReadStream(fuente.ruta),
    ) as WebReadableStream<Uint8Array>;
    return new Response(cuerpo as unknown as ReadableStream, { headers: cabeceras });
  }

  const arriba = await fetch(fuente.url, { cache: "no-store" }).catch(() => null);
  if (!arriba?.ok || !arriba.body) {
    // Que el hosting esté caído no puede parecerse a "no está compilado": son dos
    // problemas distintos y los arregla gente distinta.
    return new Response(
      `No pude traer el programa desde donde está publicado (${arriba?.status ?? "sin respuesta"}).`,
      { status: 502 },
    );
  }

  // Se pasa el tamaño de arriba si vino: sin él la barra de progreso del navegador
  // no avanza, y una descarga de 7 MB sin progreso parece colgada.
  const tamano = arriba.headers.get("content-length");
  if (tamano) cabeceras["Content-Length"] = tamano;

  return new Response(arriba.body, { headers: cabeceras });
}
