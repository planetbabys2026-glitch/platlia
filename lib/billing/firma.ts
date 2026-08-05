import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verificación de la firma de los webhooks de MercadoPago.
 *
 * El webhook es una URL pública que mueve el estado de la licencia: quien logre
 * que le creamos un aviso puede regalarse meses de servicio. Por eso esto es lo
 * único de la integración que se prueba a fondo, y por eso `MP_SIGNATURE_ENFORCE`
 * viene en true y solo se apaga en staging.
 *
 * MercadoPago manda la cabecera `x-signature: ts=…,v1=…`, y `v1` es el HMAC-SHA256
 * —con el secreto del webhook— de un manifiesto con forma fija:
 *
 *     id:{data.id};request-id:{x-request-id};ts:{ts};
 *
 * Módulo puro salvo por node:crypto: no toca base de datos ni red, así que se
 * puede probar entero sin credenciales.
 */

export type ResultadoFirma =
  | { valida: true }
  | { valida: false; motivo: string };

/** Cinco minutos: suficiente para un reintento honesto, corto para un reenvío. */
export const TOLERANCIA_SEGUNDOS = 300;

/**
 * Parsea `ts=1704908010,v1=abc…`. Devuelve null si falta cualquiera de los dos:
 * una cabecera a medias no es una firma parcial, es ninguna.
 */
export function parsearCabeceraFirma(
  cabecera: string | null,
): { ts: string; v1: string } | null {
  if (!cabecera) return null;

  const partes = new Map<string, string>();
  for (const trozo of cabecera.split(",")) {
    const [clave, ...resto] = trozo.split("=");
    if (!clave || resto.length === 0) continue;
    partes.set(clave.trim(), resto.join("=").trim());
  }

  const ts = partes.get("ts");
  const v1 = partes.get("v1");
  return ts && v1 ? { ts, v1 } : null;
}

/**
 * El manifiesto que MercadoPago firma.
 *
 * El identificador va en minúsculas cuando es alfanumérico: así lo arma
 * MercadoPago del otro lado y una diferencia de mayúsculas invalida la firma
 * de un aviso legítimo.
 */
export function construirManifiesto(args: {
  dataId: string;
  requestId: string | null;
  ts: string;
}): string {
  const id = args.dataId.toLowerCase();
  const requestId = args.requestId ?? "";
  return `id:${id};request-id:${requestId};ts:${args.ts};`;
}

function iguales(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  // timingSafeEqual exige el mismo largo; comparar el largo antes no filtra nada
  // útil, porque el largo de un HMAC hexadecimal es siempre el mismo.
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function verificarFirma(args: {
  cabeceraFirma: string | null;
  requestId: string | null;
  dataId: string | null;
  secreto: string;
  /** Se inyecta en los tests; en producción es la hora del servidor. */
  ahora?: Date;
  toleranciaSegundos?: number;
}): ResultadoFirma {
  if (!args.secreto) {
    return { valida: false, motivo: "No hay secreto de webhook configurado." };
  }
  if (!args.dataId) {
    return { valida: false, motivo: "El aviso no trae data.id." };
  }

  const firma = parsearCabeceraFirma(args.cabeceraFirma);
  if (!firma) {
    return { valida: false, motivo: "Falta la cabecera x-signature o está mal formada." };
  }

  // El ts de MercadoPago viene en segundos; se acepta también en milisegundos
  // porque no está garantizado por contrato y equivocarse acá rechaza avisos
  // legítimos.
  const tsNumero = Number(firma.ts);
  if (!Number.isFinite(tsNumero)) {
    return { valida: false, motivo: "El ts de la firma no es un número." };
  }
  const instante = tsNumero > 1e12 ? tsNumero : tsNumero * 1000;
  const ahora = (args.ahora ?? new Date()).getTime();
  const tolerancia = (args.toleranciaSegundos ?? TOLERANCIA_SEGUNDOS) * 1000;

  if (Math.abs(ahora - instante) > tolerancia) {
    return { valida: false, motivo: "La firma está fuera de la ventana de tiempo." };
  }

  const manifiesto = construirManifiesto({
    dataId: args.dataId,
    requestId: args.requestId,
    ts: firma.ts,
  });
  const esperada = createHmac("sha256", args.secreto).update(manifiesto).digest("hex");

  return iguales(esperada, firma.v1.toLowerCase())
    ? { valida: true }
    : { valida: false, motivo: "La firma no coincide." };
}

/** Firma un manifiesto. Existe para los tests y para reproducir un aviso real. */
export function firmarParaPruebas(args: {
  dataId: string;
  requestId: string | null;
  ts: string;
  secreto: string;
}): string {
  const manifiesto = construirManifiesto(args);
  const v1 = createHmac("sha256", args.secreto).update(manifiesto).digest("hex");
  return `ts=${args.ts},v1=${v1}`;
}
