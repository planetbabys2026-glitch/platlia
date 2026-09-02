import { PaymentMethod } from "@/generated/prisma/enums";

/**
 * En qué saldo cae cada medio de pago.
 *
 * Un turno cuadra DOS saldos —el cajón y la cuenta del banco— y hasta acá el
 * arqueo solo miraba uno: todo lo que no era efectivo se listaba "por método"
 * como información suelta, sin nada contra qué cuadrarlo. Con el datáfono
 * cobrando la mitad de la noche, eso es la mitad de la plata sin arquear.
 *
 * `OTRO` no es un descarte cómodo: es la categoría de lo que no se puede contar
 * al cierre. Un bono es una promesa de consumo que ya se descontó y no entra
 * plata por él; "Otro" es literalmente "no sabemos qué fue". Sumarlos a
 * cualquiera de los dos saldos haría que el arqueo pidiera contar un dinero que
 * no existe, y el faltante aparecería todas las noches hasta que alguien dejara
 * de mirar la cifra.
 */
export type CuentaDeSaldo = "EFECTIVO" | "BANCO" | "OTRO";

/**
 * El mapa está escrito entero y a mano, sin `default`, a propósito: el día que
 * se agregue un medio de pago al enum, el test exhaustivo falla nombrándolo en
 * vez de dejarlo caer en un saldo por descarte. Un medio nuevo mal clasificado
 * es un arqueo que no cuadra y nadie sabe por qué.
 */
const CUENTA_POR_METODO: Record<PaymentMethod, CuentaDeSaldo> = {
  [PaymentMethod.EFECTIVO]: "EFECTIVO",
  [PaymentMethod.TARJETA_DEBITO]: "BANCO",
  [PaymentMethod.TARJETA_CREDITO]: "BANCO",
  [PaymentMethod.NEQUI]: "BANCO",
  [PaymentMethod.DAVIPLATA]: "BANCO",
  [PaymentMethod.TRANSFERENCIA]: "BANCO",
  [PaymentMethod.BONO]: "OTRO",
  [PaymentMethod.OTRO]: "OTRO",
};

export function cuentaDelMetodo(metodo: PaymentMethod | string): CuentaDeSaldo {
  return CUENTA_POR_METODO[metodo as PaymentMethod] ?? "OTRO";
}

/** Etiquetas para la pantalla, en el orden en que se leen en el arqueo. */
export const NOMBRE_DE_CUENTA: Record<CuentaDeSaldo, string> = {
  EFECTIVO: "Efectivo",
  BANCO: "Bancos",
  OTRO: "Otros medios",
};
