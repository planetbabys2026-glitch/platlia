/**
 * Las reglas de la cartera: quién es quién, y a qué se aplica un abono.
 *
 * Puras y sin `server-only`, como `features/caja/reglas.ts`, para que se puedan
 * probar sin base. Acá se decide plata que alguien debe: equivocarse no rompe
 * ninguna pantalla, deja a un cliente pagando dos veces o al negocio perdonando
 * una deuda sin querer.
 */

/**
 * El teléfono es la identidad del deudor, así que hay que normalizarlo.
 *
 * La misma persona escribe su número distinto cada vez —"300 123 4567",
 * "3001234567", "+57 300 123 4567"— y sin normalizar cada forma sería un deudor
 * nuevo: tres cuentas, tres saldos, y ninguna que cuadre con lo que la persona
 * cree que debe. Se queda con los dígitos, igual que la consulta del rastreo
 * público del menú QR.
 *
 * El indicativo del país se recorta cuando el resto ya es un celular colombiano
 * de diez dígitos: "573001234567" y "3001234567" son el mismo teléfono, y quien
 * lo dicta no siempre dice el 57.
 */
export function normalizarTelefono(bruto: string): string {
  const digitos = bruto.replace(/\D/g, "");
  if (digitos.length === 12 && digitos.startsWith("57")) return digitos.slice(2);
  return digitos;
}

/** Un teléfono sirve como identidad si tiene con qué distinguir a alguien. */
export function telefonoEsUsable(bruto: string): boolean {
  return normalizarTelefono(bruto).length >= 7;
}

/** Un fiado con saldo, visto por la regla que reparte el abono. */
export type FiadoConSaldo = {
  id: string;
  saldoCop: number;
};

export type AplicacionDeAbono = {
  /** Cuánto se le aplica a cada fiado, en el orden en que se saldan. */
  aplicaciones: { fiadoId: string; aplicadoCop: number; saldaCompleto: boolean }[];
  /** Lo que se alcanzó a aplicar. */
  aplicadoCop: number;
  /** Lo que sobró porque el abono superaba la deuda. */
  sobranteCop: number;
};

/**
 * Reparte un abono entre los fiados, **del más viejo al más nuevo**.
 *
 * Es como se cobra un fiado de verdad: la persona dice "te abono cincuenta", no
 * "pago el pedido del martes". Saldar por antigüedad es además lo único
 * defendible cuando alguien debe tres pedidos y trae la mitad de la plata: la
 * deuda más vieja es la que más tiempo lleva sin cobrarse.
 *
 * `fiados` tiene que llegar ordenado por antigüedad —la consulta lo hace—; acá no
 * se reordena, para que la regla no dependa de un campo de fecha que después
 * podría faltar.
 *
 * El sobrante se devuelve en vez de aplicarse: recibir más plata de la que se
 * debe no es un abono, es un error de tecleo, y quien lo llama decide si lo
 * rechaza o lo recorta.
 */
export function aplicarAbono(
  fiados: readonly FiadoConSaldo[],
  montoCop: number,
): AplicacionDeAbono {
  const aplicaciones: AplicacionDeAbono["aplicaciones"] = [];

  if (montoCop <= 0) {
    return { aplicaciones, aplicadoCop: 0, sobranteCop: Math.max(0, montoCop) };
  }

  let restante = montoCop;

  for (const fiado of fiados) {
    if (restante <= 0) break;
    if (fiado.saldoCop <= 0) continue;

    const aplicadoCop = Math.min(restante, fiado.saldoCop);
    aplicaciones.push({
      fiadoId: fiado.id,
      aplicadoCop,
      saldaCompleto: aplicadoCop === fiado.saldoCop,
    });
    restante -= aplicadoCop;
  }

  return {
    aplicaciones,
    aplicadoCop: montoCop - restante,
    sobranteCop: restante,
  };
}

/** Cuánto debe alguien: la suma de lo que le queda vivo. */
export function saldoTotal(fiados: readonly { saldoCop: number }[]): number {
  return fiados.reduce((total, f) => total + Math.max(0, f.saldoCop), 0);
}

/**
 * Hace cuántos días es la deuda más vieja que sigue viva.
 *
 * Es lo que ordena la lista de deudores: quien lleva más tiempo debiendo va
 * arriba. Sin esto la cartera se ordena por monto y el que debe poco desde hace
 * cuatro meses no lo ve nadie.
 */
export function diasDeLaDeudaMasVieja(
  fiados: readonly { saldoCop: number; createdAt: Date }[],
  ahora: Date = new Date(),
): number | null {
  const vivos = fiados.filter((f) => f.saldoCop > 0);
  if (vivos.length === 0) return null;

  const masVieja = vivos.reduce((a, b) => (a.createdAt <= b.createdAt ? a : b));
  const dias = Math.floor((ahora.getTime() - masVieja.createdAt.getTime()) / 86_400_000);
  return Math.max(0, dias);
}
