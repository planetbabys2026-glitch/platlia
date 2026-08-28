/**
 * Quién puede crear una sede más.
 *
 * Módulo puro y sin `server-only`: lo usa la Server Action —que es un POST
 * alcanzable con curl— y también la pantalla, para no ofrecer un botón que el
 * servidor va a rechazar. Y así la regla tiene tests, que es lo que corresponde
 * a algo que decide si a alguien se le cobra o no.
 *
 * **El cupo es la única fuente.** Antes había DOS guardas y la primera cortaba
 * antes de mirar la segunda:
 *
 *     if (status === "PRUEBA") throw …          ← bloqueo tajante
 *     if (sedes >= maxBranches) throw …         ← el cupo, que nunca se leía
 *
 * Con eso, el superadministrador podía subirle el cupo a 3 a una cadena que
 * estaba en prueba y la cuenta seguía sin poder crear la segunda sede: el cupo se
 * guardaba y no servía para nada. Y como extender días a mano tampoco saca de
 * PRUEBA, la única salida era pagar por MercadoPago —justo lo que un cliente de
 * cadena en evaluación no va a hacer todavía—.
 *
 * Ahora la prueba no bloquea por sí sola: nace con cupo 1, así que sigue sin
 * poder crear la segunda por su cuenta, pero un cupo asignado a mano —que es una
 * decisión de soporte, con motivo y en la bitácora— la habilita.
 */

export type CuentaParaSede = {
  /** El estado de la suscripción de la sede principal. */
  status: string;
  /** Cuántas sedes tiene hoy la cuenta. */
  sedes: number;
  /** Cuántas tiene habilitadas. Lo sube un pago o el superadministrador. */
  maxBranches: number;
};

export type VeredictoDeSede =
  | { permitido: true }
  | { permitido: false; motivo: string };

export function puedeCrearSede(cuenta: CuentaParaSede | null): VeredictoDeSede {
  if (!cuenta) {
    return {
      permitido: false,
      motivo: "Tu cuenta no tiene una licencia activa. Escribinos y la revisamos.",
    };
  }

  if (cuenta.sedes < cuenta.maxBranches) return { permitido: true };

  // El mensaje dice qué hacer, y eso depende de por qué no alcanza el cupo.
  if (cuenta.status === "PRUEBA") {
    return {
      permitido: false,
      motivo:
        "La prueba gratuita cubre una sola sede. Escribinos y te habilitamos las que necesites, o activá la licencia para sumarlas.",
    };
  }

  return {
    permitido: false,
    motivo:
      cuenta.maxBranches >= 2
        ? `Tu plan cubre ${cuenta.maxBranches} sedes. Para sumar otra, escribinos y coordinamos la tarifa de cadena.`
        : "Todavía no tenés una sede adicional habilitada. Compralá desde Licencia y volvé acá para crearla.",
  };
}
