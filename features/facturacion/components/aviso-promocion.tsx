import { Sparkles } from "lucide-react";
import { cotizar, type ListaDePrecios } from "@/lib/billing/precios";
import { formatCop } from "@/lib/money";
import { diaFinalDeVentana, formatDayInTimeZone } from "@/lib/time";

/**
 * "Este precio es una promoción y se termina."
 *
 * Sin esto, una promoción vigente se ve exactamente igual que la tarifa de
 * siempre: el número baja y nadie sabe por qué ni hasta cuándo. Peor todavía
 * cuando se termina, porque el precio sube solo y parece un error de facturación.
 *
 * Va al lado del precio en las tres pantallas que lo muestran —la portada, la
 * licencia y el checkout— y siempre dice las mismas tres cosas: cuánto es, contra
 * cuánto, y hasta cuándo.
 *
 * Sin hooks a propósito: la usan tanto componentes de servidor como de cliente.
 */
export function AvisoPromocion({
  promo,
  base,
  sedes,
  timeZone,
  className,
}: {
  /** La promoción vigente. Si es null no se pinta nada. */
  promo: ListaDePrecios | null;
  /** La lista de siempre, para poder decir de cuánto bajó. */
  base: ListaDePrecios;
  sedes: number;
  timeZone: string;
  className?: string;
}) {
  if (!promo) return null;

  const conPromo = cotizar({ lista: promo, sedes, periodicidad: "MENSUAL" }).mensualCop;
  const sinPromo = cotizar({ lista: base, sedes, periodicidad: "MENSUAL" }).mensualCop;

  // Una promoción más cara que la lista no es una oferta: se anuncia igual que
  // rige —para que el número no aparezca sin explicación— pero sin prometer un
  // ahorro que no existe.
  const ahorra = sinPromo > conPromo;

  return (
    <div
      className={`rounded-xl border border-brand/30 bg-brand/10 p-3 text-xs space-y-1 ${className ?? ""}`}
    >
      <span className="flex items-center gap-1.5 font-bold text-brand">
        <Sparkles className="size-3.5 shrink-0" />
        Promoción vigente: {promo.nombre}
      </span>

      <p className="text-muted-foreground leading-relaxed">
        {ahorra ? (
          <>
            Estás pagando <span className="numeral font-bold text-foreground">{formatCop(conPromo)}</span>{" "}
            al mes en vez de <span className="numeral line-through">{formatCop(sinPromo)}</span>.
          </>
        ) : (
          <>
            Rige un precio promocional de{" "}
            <span className="numeral font-bold text-foreground">{formatCop(conPromo)}</span> al mes.
          </>
        )}{" "}
        {promo.hasta ? (
          <>
            Es por tiempo limitado: va hasta el{" "}
            <span className="numeral font-semibold text-foreground">
              {formatDayInTimeZone(diaFinalDeVentana(promo.hasta), timeZone)}
            </span>
            {ahorra ? (
              <>
                , y después vuelve a{" "}
                <span className="numeral">{formatCop(sinPromo)}</span>.
              </>
            ) : (
              "."
            )}
          </>
        ) : (
          "No tiene fecha de fin definida."
        )}
      </p>
    </div>
  );
}
