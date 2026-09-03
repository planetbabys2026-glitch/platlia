"use client";

import {
  Banknote,
  CreditCard,
  Landmark,
  MoreHorizontal,
  Receipt,
  Smartphone,
  Wallet,
} from "lucide-react";
import { PaymentMethod } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

/**
 * Con qué se paga, en un solo lugar.
 *
 * Existe porque la caja y el POS tenían cada uno su propia lista y ya habían
 * divergido: el POS ofrecía seis medios y la caja nueve. Faltaban **Bono**,
 * **Otro** y —lo que más pesa— el **fiado**, así que la misma venta se podía
 * cobrar de una forma parada frente a la caja y de otra parada frente al
 * mostrador. Quien cobra no tiene por qué saber cuál de las dos pantallas
 * acepta qué.
 *
 * Es la misma razón por la que la propina tiene un único selector: un cobro que
 * se calcula de dos maneras según por dónde entre es un arqueo que no cuadra.
 *
 * `features/caja/medios-de-pago.ts` es su hermano del lado del servidor —a qué
 * saldo del arqueo cae cada medio—, y por eso está aparte: aquel es puro y lo
 * consume el cierre de caja; éste trae iconos de React y solo lo mira el
 * navegador.
 */

const MEDIOS = [
  { clave: PaymentMethod.EFECTIVO, etiqueta: "Efectivo", icono: Banknote },
  { clave: PaymentMethod.NEQUI, etiqueta: "Nequi", icono: Smartphone },
  { clave: PaymentMethod.DAVIPLATA, etiqueta: "Daviplata", icono: Smartphone },
  { clave: PaymentMethod.TARJETA_DEBITO, etiqueta: "T. Débito", icono: CreditCard },
  { clave: PaymentMethod.TARJETA_CREDITO, etiqueta: "T. Crédito", icono: CreditCard },
  { clave: PaymentMethod.TRANSFERENCIA, etiqueta: "Transferencia", icono: Landmark },
  { clave: PaymentMethod.BONO, etiqueta: "Bono", icono: Receipt },
  { clave: PaymentMethod.OTRO, etiqueta: "Otro", icono: MoreHorizontal },
] as const;

/** El fiado va aparte: no es un medio de pago más, es no cobrar hoy. */
const CREDITO = {
  clave: PaymentMethod.CREDITO,
  etiqueta: "Crédito (fiado)",
  icono: Wallet,
} as const;

/** Cómo se lee un medio de pago. Lo usa el resumen del cobro. */
export function etiquetaDeMedio(metodo: string): string {
  if (metodo === CREDITO.clave) return CREDITO.etiqueta;
  return MEDIOS.find((m) => m.clave === metodo)?.etiqueta ?? metodo;
}

/** Los medios con los que SÍ entra plata. Sirve para saber si pedir comprobante. */
export function esElectronico(metodo: string): boolean {
  return metodo !== PaymentMethod.EFECTIVO && metodo !== PaymentMethod.CREDITO;
}

export function SelectorMedioDePago({
  valor,
  onChange,
  puedeFiar,
  columnas = "grid-cols-2 sm:grid-cols-4",
}: {
  valor: string;
  onChange: (metodo: string) => void;
  /** Si el negocio tiene el crédito encendido en Configuración. */
  puedeFiar: boolean;
  /** Las columnas de la rejilla: la caja tiene más ancho que el modal del POS. */
  columnas?: string;
}) {
  return (
    <div className={cn("grid gap-1.5", columnas)}>
      {MEDIOS.map(({ clave, etiqueta, icono: Icono }) => (
        <button
          key={clave}
          type="button"
          onClick={() => onChange(clave)}
          aria-pressed={valor === clave}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-xl border px-2.5 py-2 text-center text-xs font-medium transition-all",
            valor === clave
              ? "border-brand bg-brand/10 font-bold text-brand shadow-xs"
              : "border-border bg-background text-foreground hover:bg-muted",
          )}
        >
          <Icono className="size-3.5 shrink-0 opacity-80" />
          <span>{etiqueta}</span>
        </button>
      ))}

      {/* El fiado, ocupando toda la fila y con su propio peso visual: elegirlo no
          es cobrar de otra forma, es no cobrar hoy. */}
      {puedeFiar && (
        <button
          type="button"
          onClick={() => onChange(CREDITO.clave)}
          aria-pressed={valor === CREDITO.clave}
          className={cn(
            "col-span-full flex items-center justify-center gap-1.5 rounded-xl border px-2.5 py-2 text-center text-xs font-medium transition-all",
            valor === CREDITO.clave
              ? "border-warning bg-warning/10 font-bold text-warning-soft shadow-xs"
              : "border-border bg-background text-foreground hover:bg-muted",
          )}
        >
          <CREDITO.icono className="size-3.5 shrink-0 opacity-80" />
          <span>{CREDITO.etiqueta}</span>
        </button>
      )}
    </div>
  );
}
