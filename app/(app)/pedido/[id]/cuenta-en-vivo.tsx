"use client";

import { createContext, useContext, useOptimistic } from "react";
import { formatCop, formatRateBp } from "@/lib/money";
import { computeTaxLine, sumTaxLines } from "@/lib/tax";
import { AnularRenglon, ControlCantidad, NotaRenglon, QuitarRenglon } from "./acciones";

/**
 * La cuenta que se ve, con lo que se acaba de tocar ya adentro.
 *
 * El problema que resuelve: agregar un producto es una Server Action que revalida
 * la pantalla, y la pantalla es `force-dynamic` y vuelve a correr `getCarta`
 * entera. Hasta que eso vuelve —y en una tablet no es instantáneo— en la cuenta
 * no aparecía absolutamente nada, mientras el botón ya se había vuelto a
 * habilitar. El mesero tocaba de nuevo. Así una cuenta terminó con seis papas.
 *
 * Con `useOptimistic` el renglón entra en la lista en el mismo momento del toque
 * y React lo descarta solo cuando llega el árbol nuevo del servidor. No hay que
 * limpiarlo a mano, y si la acción falla desaparece: el estado real siempre lo
 * manda el servidor.
 *
 * Los totales optimistas se calculan con `computeTaxLine` y `sumTaxLines`, las
 * mismas funciones que usa el servidor, para que el número que se ve un segundo
 * antes sea idéntico al definitivo. El impuesto se redondea por línea, nunca
 * sobre el total.
 */

export type ModificadorDeRenglon = {
  id: string;
  optionNameSnapshot: string;
  priceDeltaCopSnapshot: number;
};

export type RenglonDeLaCuenta = {
  id: string;
  nameSnapshot: string;
  quantity: number;
  unitPriceCop: number;
  lineTotalCop: number;
  taxRateBpSnapshot: number;
  notes: string | null;
  status: string;
  modifiers: ModificadorDeRenglon[];
  /** Todavía no lo confirmó el servidor: se pinta atenuado y sin controles. */
  optimista?: boolean;
};

export type TotalesDeLaCuenta = {
  subtotalCop: number;
  taxCop: number;
  tipCop: number;
  deliveryFeeCop?: number;
  totalCop: number;
  paidCop: number;
};

/** Lo que la carta sabe en el momento del toque, antes de que el servidor conteste. */
export type RenglonNuevo = {
  nombre: string;
  precioUnitarioCop: number;
  taxRateBp: number;
  cantidad: number;
  modificadores: { nombre: string; precioCop: number }[];
};

type Cuenta = {
  renglones: RenglonDeLaCuenta[];
  totales: TotalesDeLaCuenta;
  agregarOptimista: (nuevo: RenglonNuevo) => void;
};

const ContextoCuenta = createContext<Cuenta | null>(null);

/**
 * Devuelve `null` fuera del proveedor a propósito: la carta también se usa donde
 * no hay una cuenta viva alrededor, y ahí simplemente no hay nada que anticipar.
 */
export function useCuenta(): Cuenta | null {
  return useContext(ContextoCuenta);
}

/** Igual que `useCuenta` pero para lo que sí vive siempre adentro del proveedor. */
export function useCuentaObligatoria(): Cuenta {
  const cuenta = useContext(ContextoCuenta);
  if (!cuenta) throw new Error("Este componente necesita estar dentro de <CuentaEnVivo>.");
  return cuenta;
}

/**
 * Reconstruye los totales sumando renglón por renglón con la misma aritmética de
 * lib/tax.ts que corre el servidor.
 *
 * El total NO es `subtotal + impuesto`: es la suma de los `lineTotalCop` más la
 * propina y el domicilio. Sumar las bases y los impuestos acumulados daría
 * centavos de diferencia con la suma de las líneas por el redondeo por renglón.
 */
function totalesSegunRenglones(
  renglones: readonly RenglonDeLaCuenta[],
  taxIncluded: boolean,
  tipCop: number,
  deliveryFeeCop: number,
  paidCop: number,
): TotalesDeLaCuenta {
  const lineas = renglones.map((r) =>
    computeTaxLine({
      unitPriceCop: r.unitPriceCop,
      quantity: r.quantity,
      taxRateBp: r.taxRateBpSnapshot,
      taxIncluded,
    }),
  );
  const { subtotalCop, taxCop, totalCop } = sumTaxLines(lineas);
  return {
    subtotalCop,
    taxCop,
    tipCop,
    deliveryFeeCop,
    totalCop: totalCop + tipCop + deliveryFeeCop,
    paidCop,
  };
}

export function CuentaEnVivo({
  renglones,
  totales,
  pricesIncludeTax,
  children,
}: {
  renglones: RenglonDeLaCuenta[];
  totales: TotalesDeLaCuenta;
  pricesIncludeTax: boolean;
  children: React.ReactNode;
}) {
  const [optimistas, agregar] = useOptimistic(
    renglones,
    (previos: RenglonDeLaCuenta[], nuevo: RenglonNuevo): RenglonDeLaCuenta[] => {
      const extra = nuevo.modificadores.reduce((n, m) => n + m.precioCop, 0);
      const unitario = nuevo.precioUnitarioCop + extra;
      const { lineTotalCop } = computeTaxLine({
        unitPriceCop: unitario,
        quantity: nuevo.cantidad,
        taxRateBp: nuevo.taxRateBp,
        taxIncluded: pricesIncludeTax,
      });

      return [
        ...previos,
        {
          // El id solo tiene que ser único dentro de este render: el renglón se
          // reemplaza entero cuando llega el del servidor, con su id de verdad.
          id: `optimista-${previos.length}-${nuevo.nombre}`,
          nameSnapshot: nuevo.nombre,
          quantity: nuevo.cantidad,
          unitPriceCop: unitario,
          lineTotalCop,
          taxRateBpSnapshot: nuevo.taxRateBp,
          notes: null,
          status: "PENDIENTE",
          modifiers: nuevo.modificadores.map((m, i) => ({
            id: `optimista-mod-${i}`,
            optionNameSnapshot: m.nombre,
            priceDeltaCopSnapshot: m.precioCop,
          })),
          optimista: true,
        },
      ];
    },
  );

  // Mientras no haya nada optimista se usan los totales del servidor tal cual:
  // son la verdad, con propina y descuentos incluidos, y recalcularlos acá los
  // empobrecería.
  const hayOptimistas = optimistas.some((r) => r.optimista);
  const totalesVivos = hayOptimistas
    ? totalesSegunRenglones(
        optimistas,
        pricesIncludeTax,
        totales.tipCop,
        totales.deliveryFeeCop ?? 0,
        totales.paidCop,
      )
    : totales;

  return (
    <ContextoCuenta.Provider
      value={{ renglones: optimistas, totales: totalesVivos, agregarOptimista: agregar }}
    >
      {children}
    </ContextoCuenta.Provider>
  );
}

/** Muestra una rama u otra según si la cuenta tiene consumo, ya contando lo optimista. */
export function SegunConsumo({
  conConsumo,
  sinConsumo = null,
}: {
  conConsumo: React.ReactNode;
  sinConsumo?: React.ReactNode;
}) {
  const { renglones } = useCuentaObligatoria();
  return <>{renglones.length > 0 ? conConsumo : sinConsumo}</>;
}

export function ListaDeRenglones({
  editable,
  puedeCobrar,
}: {
  editable: boolean;
  puedeCobrar: boolean;
}) {
  const { renglones } = useCuentaObligatoria();

  if (renglones.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Todavía no hay nada. Tocá un producto de la carta.
      </p>
    );
  }

  return (
    <ul className="divide-border divide-y">
      {renglones.map((item) => (
        <li
          key={item.id}
          className={item.optimista ? "space-y-1 py-2 opacity-60 first:pt-0" : "space-y-1 py-2 first:pt-0"}
        >
          <div className="flex items-start justify-between gap-2">
            <span className="text-sm leading-tight">{item.nameSnapshot}</span>
            <span className="numeral text-sm font-medium whitespace-nowrap">
              {formatCop(item.lineTotalCop)}
            </span>
          </div>
          {item.modifiers.length > 0 && (
            <ul className="text-muted-foreground space-y-0.5 pl-3 text-xs">
              {item.modifiers.map((mod) => (
                <li key={mod.id} className="flex justify-between gap-2">
                  <span>+ {mod.optionNameSnapshot}</span>
                  {mod.priceDeltaCopSnapshot > 0 && (
                    <span className="numeral whitespace-nowrap">
                      {formatCop(mod.priceDeltaCopSnapshot)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {/* Un renglón que el servidor todavía no confirmó no ofrece controles:
              no tiene id real, así que cualquier acción sobre él fallaría. */}
          {item.optimista ? (
            <p className="text-muted-foreground text-xs">Agregando…</p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <ControlCantidad itemId={item.id} quantity={item.quantity} editable={editable} />
                <span className="text-muted-foreground text-xs">
                  {formatCop(item.unitPriceCop)} c/u · {formatRateBp(item.taxRateBpSnapshot)}
                </span>
              </div>
              {editable ? (
                <NotaRenglon itemId={item.id} notes={item.notes} />
              ) : (
                item.notes && <p className="text-muted-foreground text-xs italic">{item.notes}</p>
              )}
              {editable &&
                (item.status === "PENDIENTE" ? (
                  <QuitarRenglon itemId={item.id} />
                ) : (
                  puedeCobrar && <AnularRenglon itemId={item.id} />
                ))}
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

export function TotalesEnVivo() {
  const { totales } = useCuentaObligatoria();
  const faltanteCop = Math.max(0, totales.totalCop - totales.paidCop);

  return (
    <dl className="border-border space-y-1 border-t pt-3 text-sm">
      <Fila termino="Base gravable" valor={totales.subtotalCop} />
      <Fila termino="Impuesto" valor={totales.taxCop} />
      {totales.deliveryFeeCop !== undefined && totales.deliveryFeeCop > 0 && (
        <Fila termino="Domicilio" valor={totales.deliveryFeeCop} />
      )}
      {totales.tipCop > 0 && <Fila termino="Propina" valor={totales.tipCop} />}
      <div className="flex items-baseline justify-between pt-1">
        <dt className="font-medium">Total</dt>
        <dd className="numeral text-2xl font-semibold">{formatCop(totales.totalCop)}</dd>
      </div>
      {totales.paidCop > 0 && (
        <>
          <Fila termino="Pagado" valor={totales.paidCop} />
          {faltanteCop > 0 && <Fila termino="Falta" valor={faltanteCop} />}
        </>
      )}
    </dl>
  );
}

function Fila({ termino, valor }: { termino: string; valor: number }) {
  return (
    <div className="text-muted-foreground flex justify-between gap-2">
      <dt>{termino}</dt>
      <dd className="numeral">{formatCop(valor)}</dd>
    </div>
  );
}
