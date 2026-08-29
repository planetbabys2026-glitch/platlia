import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { rootDb } from "@/lib/db/root";
import { licenciaVigente } from "@/lib/auth/reglas";

/**
 * Cómo entra la IA de un negocio.
 *
 * Mismo esquema que el agente de impresión: no hay sesión ni cookie del otro
 * lado —es un cliente de IA, no un navegador—, así que presenta un token en cada
 * llamada y de ahí sale el `businessId` con el que después se acota TODO.
 *
 * Del token se guarda solo el hash. SHA-256 y no argon2 por lo mismo de siempre:
 * son 32 bytes aleatorios, no una contraseña, y esto se verifica en cada pregunta
 * que hace el asistente.
 *
 * El prefijo `plt_ia_` no es decoración: hace que un token pegado por error en un
 * repositorio lo detecten los escáneres de secretos, y que quien lo ve en un
 * archivo de configuración sepa qué es y de dónde sacarlo.
 */

/** Se exporta para que el canje de OAuth emita llaves con el mismo prefijo. */
export const PREFIJO_TOKEN = "plt_ia_";
const PREFIJO = PREFIJO_TOKEN;

export type NegocioAutenticado = { tokenId: string; businessId: string; nombre: string };

/** Por qué se rechazó, para que la ruta conteste distinto en cada caso. */
export type Rechazo = "TOKEN" | "LICENCIA";

function hashear(crudo: string): string {
  return createHash("sha256").update(crudo).digest("hex");
}

export function generarToken(): string {
  return PREFIJO + randomBytes(32).toString("base64url");
}

export function hashDeToken(crudo: string): string {
  return hashear(crudo.trim());
}

/**
 * Del token al negocio.
 *
 * Se busca por el hash, que es único: no hay comparación en tiempo constante
 * porque no hay nada que comparar —o la fila existe o no—. Es la misma razón por
 * la que `PrintAgent` tampoco la necesita, a diferencia del token de bootstrap,
 * que sí se compara contra un valor del entorno.
 */
export async function autenticar(
  cabecera: string | null,
): Promise<NegocioAutenticado | Rechazo> {
  if (!cabecera) return "TOKEN";
  const crudo = cabecera.replace(/^Bearer\s+/i, "").trim();
  if (!crudo.startsWith(PREFIJO)) return "TOKEN";

  const fila = await rootDb.tokenIa.findUnique({
    where: { tokenHash: hashear(crudo) },
    select: {
      id: true,
      businessId: true,
      nombre: true,
      expiresAt: true,
      business: {
        select: {
          status: true,
          subscription: {
            select: { status: true, currentPeriodEnd: true, trialEndsAt: true, graceUntil: true },
          },
        },
      },
    },
  });
  if (!fila) return "TOKEN";

  /**
   * Las llaves que salen de OAuth caducan; las creadas a mano tienen `expiresAt`
   * nulo y no. No es una inconsistencia: del otro lado de una llave manual no hay
   * nadie que sepa renovarla, así que caducarla sería cortar la conexión sin que
   * nadie se entere. Una vencida se contesta como inválida —el cliente la renueva
   * con su refresco, que es exactamente lo que va a hacer.
   */
  if (fila.expiresAt && fila.expiresAt <= new Date()) return "TOKEN";

  /**
   * La licencia manda acá también.
   *
   * Esto no pasa por `defineAction` —del otro lado hay un cliente de IA, no una
   * sesión— así que el chequeo que el wrapper hace por todos hay que hacerlo a
   * mano. Es el mismo olvido que tuvo `crearPedidoClienteQR`: sin esto, un
   * negocio vencido o suspendido seguiría entregando sus ventas, sus costos y sus
   * márgenes para siempre, y una llave emitida antes del corte no caducaría nunca.
   *
   * `Business.status` va aparte de la suscripción porque son dos decisiones
   * distintas: una es el cobro y la otra es soporte suspendiendo la cuenta a mano.
   */
  if (fila.business.status !== "ACTIVO") return "LICENCIA";
  if (!licenciaVigente(fila.business.subscription).vigente) return "LICENCIA";

  /**
   * El "último uso" se escribe sin esperar.
   *
   * Es un dato para que el dueño vea si una conexión sigue viva; hacer que cada
   * pregunta del asistente espere ese UPDATE sería pagar una escritura de latencia
   * por un dato que nadie mira en tiempo real. Si falla, no pasa nada.
   */
  void rootDb.tokenIa
    .update({ where: { id: fila.id }, data: { ultimoUsoEn: new Date() } })
    .catch(() => {});

  return { tokenId: fila.id, businessId: fila.businessId, nombre: fila.nombre };
}
