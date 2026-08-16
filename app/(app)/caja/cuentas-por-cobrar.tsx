"use client";

import { useActionState, useState } from "react";
import { PaymentMethod } from "@/generated/prisma/enums";
import { registrarPago } from "@/features/pedidos/actions";
import {
  DatosFiscales,
  valorFiscalInicial,
} from "@/features/pedidos/components/datos-fiscales";
import { SelectorDePropina } from "@/features/pedidos/components/propina";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PantallaCargando } from "@/components/ui/cargando-overlay";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ESTADO_INICIAL } from "@/lib/actions/estado";
import { formatCop } from "@/lib/money";
import { computeSuggestedTip } from "@/lib/tax";
import { formatTurno } from "@/lib/turns";
import { cn } from "@/lib/utils";

const METODOS: Record<string, string> = {
  EFECTIVO: "Efectivo",
  TARJETA_DEBITO: "Tarjeta débito",
  TARJETA_CREDITO: "Tarjeta crédito",
  NEQUI: "Nequi",
  DAVIPLATA: "Daviplata",
  TRANSFERENCIA: "Transferencia",
  BONO: "Bono",
  OTRO: "Otro",
};

type Cuenta = {
  id: string;
  code: number;
  type: string;
  turnNumber: number | null;
  status: string;
  totalCop: number;
  paidCop: number;
  subtotalCop: number;
  taxCop: number;
  tipCop: number;
  customerName: string | null;
  docType: string | null;
  docNumber: string | null;
  customerEmail: string | null;
  billRequestedAt: Date | null;
  openedAt: Date;
  tableId: string | null;
  table: { id: string; name: string } | null;
  openedBy: { name: string };
  items: {
    id: string;
    nameSnapshot: string;
    quantity: number;
    lineTotalCop: number;
  }[];
};

function FormularioCobro({
  cuenta,
  puedeFacturar,
  propina,
}: {
  cuenta: Cuenta;
  puedeFacturar: boolean;
  propina: { habilitada: boolean; rateBp: number };
}) {
  const [metodo, setMetodo] = useState<string>(PaymentMethod.EFECTIVO);
  const [fiscal, setFiscal] = useState(() => valorFiscalInicial(cuenta));
  // Arranca con lo que ya tuviera el pedido, que normalmente es 0.
  const [propinaCop, setPropinaCop] = useState(cuenta.tipCop);
  const [estado, accion, isPending] = useActionState(registrarPago, ESTADO_INICIAL);

  // La sugerencia va sobre el consumo COMPLETO con impuesto —el número que el
  // cliente ve—, descontando la propina que el pedido ya tuviera para no
  // calcular un porcentaje sobre otra propina.
  const consumoCop = cuenta.totalCop - cuenta.tipCop;
  const sugeridaCop = computeSuggestedTip(consumoCop, propina.rateBp);

  // El total del pedido ya incluye la propina que tuviera guardada, así que lo
  // que cambia el faltante es la DIFERENCIA contra la elegida ahora.
  const faltanteCop = Math.max(
    0,
    cuenta.totalCop - cuenta.paidCop + (propinaCop - cuenta.tipCop),
  );

  return (
    <form action={accion} className="space-y-4 pt-3 border-t border-border/80">
      <input type="hidden" name="orderId" value={cuenta.id} />
      <input type="hidden" name="method" value={metodo} />
      <input type="hidden" name="tipCop" value={propinaCop} />
      <PantallaCargando forcePending={isPending} />

      {/* Botón de impresión de pre-cuenta para entregar a la mesera antes de cobrar */}
      <div className="flex items-center justify-between gap-2 rounded-lg bg-warning/10 border border-warning/30 p-2.5">
        <div className="space-y-0.5">
          <p className="text-xs font-bold text-warning-soft">Ticket de Pre-cuenta</p>
          <p className="text-rotulo text-muted-foreground">Imprimir factura para llevar a la mesa</p>
        </div>
        <a
          href={`/imprimir/pedido/${cuenta.id}`}
          target="_blank"
          rel="noopener"
          className="inline-flex min-h-11 tableta:min-h-8 items-center gap-1.5 rounded-md bg-warning hover:bg-warning/90 text-warning-foreground font-bold px-3 py-1.5 text-xs shadow-sm transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          🖨️ Imprimir ticket
        </a>
      </div>

      <div className="space-y-2">
        <Label className="font-mono text-rotulo uppercase tracking-wider text-muted-foreground">
          Método de pago
        </Label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          {Object.entries(METODOS).map(([clave, etiqueta]) => (
            <button
              key={clave}
              type="button"
              onClick={() => setMetodo(clave)}
              className={cn(
                "rounded-lg border px-2.5 py-2 text-xs font-medium transition-all text-center",
                metodo === clave
                  ? "border-[var(--brasa)] bg-[var(--brasa)]/15 text-[var(--brasa)] font-bold ring-1 ring-[var(--brasa)]/30"
                  : "border-[var(--linea-30)] bg-[var(--panel-2)] hover:bg-[var(--panel-3)] text-[var(--papel)]",
              )}
            >
              {etiqueta}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor={`monto-${cuenta.id}`} className="text-xs font-medium">
            Valor a cobrar
          </Label>
          {/* `key` y no `defaultValue` a secas: al cambiar la propina cambia el
              faltante, y un campo no controlado no se entera. Remontarlo lo deja
              con el valor nuevo y sigue permitiendo escribir un monto distinto
              para un pago parcial. */}
          <Input
            key={faltanteCop}
            id={`monto-${cuenta.id}`}
            name="amountCop"
            inputMode="numeric"
            defaultValue={faltanteCop}
            required
            className="h-9 text-sm font-semibold numeral"
          />
        </div>
        {metodo === "EFECTIVO" && (
          <div className="space-y-1">
            <Label htmlFor={`entregado-${cuenta.id}`} className="text-xs font-medium">
              Con cuánto paga (vuelto)
            </Label>
            <Input
              id={`entregado-${cuenta.id}`}
              name="tenderedCop"
              inputMode="numeric"
              placeholder="opcional"
              className="h-9 text-sm numeral"
            />
          </div>
        )}
      </div>

      <SelectorDePropina
        habilitado={propina.habilitada}
        sugeridaCop={sugeridaCop}
        rateBp={propina.rateBp}
        valorCop={propinaCop}
        onCambiar={setPropinaCop}
        id={cuenta.id}
      />

      <DatosFiscales
        puedeFacturar={puedeFacturar}
        orderId={cuenta.id}
        valor={fiscal}
        onChange={setFiscal}
      />

      <Button
        type="submit"
        size="lg"
        disabled={isPending}
        className="w-full bg-success hover:bg-success/90 text-white font-bold h-11 text-sm shadow-md gap-2"
      >
        {isPending ? "Procesando cobro…" : `💳 Confirmar pago de ${formatCop(faltanteCop)}`}
      </Button>

      {!estado.ok && estado.error && (
        <Alert variant="destructive" role="alert" className="py-2 text-xs">
          <AlertDescription>{estado.error}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}

/**
 * Agrupa las cuentas por mesa, conservando el orden de prioridad que trae la
 * consulta (primero las que pidieron la cuenta).
 *
 * Sin esto, las tres cuentas separadas de la mesa 12 se ven como tres pedidos
 * sueltos entre los de otras mesas, y el cajero termina cobrándole a una persona
 * la cuenta de otra. Lo que no es de mesa —para llevar, domicilio— queda suelto,
 * porque ahí cada pedido es de una persona distinta.
 */
function agruparPorMesa(cuentas: Cuenta[]) {
  const grupos: { clave: string; mesa: string | null; cuentas: Cuenta[] }[] = [];
  const porMesa = new Map<string, number>();

  for (const cuenta of cuentas) {
    if (!cuenta.tableId) {
      grupos.push({ clave: cuenta.id, mesa: null, cuentas: [cuenta] });
      continue;
    }
    const indice = porMesa.get(cuenta.tableId);
    if (indice === undefined) {
      porMesa.set(cuenta.tableId, grupos.length);
      grupos.push({
        clave: cuenta.tableId,
        mesa: cuenta.table?.name ?? null,
        cuentas: [cuenta],
      });
    } else {
      grupos[indice].cuentas.push(cuenta);
    }
  }

  return grupos;
}

export function CuentasPorCobrar({
  cuentas,
  puedeFacturar,
  propina,
}: {
  cuentas: Cuenta[];
  puedeFacturar: boolean;
  propina: { habilitada: boolean; rateBp: number };
}) {
  const [cuentaExpandida, setCuentaExpandida] = useState<string | null>(null);

  if (cuentas.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center space-y-2">
          <p className="text-sm text-muted-foreground">
            No hay cuentas ni tickets pendientes por cobrar en este momento.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <section className="space-y-4" aria-label="Cuentas por cobrar">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
          <span>💳 Cuentas por cobrar</span>
          <Badge variant="default" className="bg-success text-white">
            {cuentas.length}
          </Badge>
        </h2>
      </div>

      {agruparPorMesa(cuentas).map((grupo) => (
        <div key={grupo.clave} className="space-y-3">
          {/* Encabezado solo cuando la mesa trae varias cuentas: si es una sola,
              el título de la tarjeta ya dice de qué mesa es. */}
          {grupo.cuentas.length > 1 && (
            <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-dashed border-border/80 bg-card/60 px-3 py-2">
              <span className="text-sm font-bold">
                Mesa {grupo.mesa}
                <span className="text-muted-foreground ml-2 text-xs font-normal">
                  {grupo.cuentas.length} cuentas separadas
                </span>
              </span>
              <span className="numeral text-sm font-semibold">
                {formatCop(grupo.cuentas.reduce((suma, c) => suma + c.totalCop, 0))}
              </span>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2">
            {grupo.cuentas.map((cuenta) => {
              const destino = cuenta.table
                ? `Mesa ${cuenta.table.name}`
                : cuenta.turnNumber !== null
                  ? `Turno ${formatTurno(cuenta.turnNumber, 99, false)}`
                  : `Pedido #${cuenta.code}`;
              // Con varias cuentas en la misma mesa, el nombre es lo único que
              // distingue a quién se le está cobrando.
              const nombre = cuenta.customerName?.trim();
              const titulo = nombre && cuenta.table ? `${destino} · ${nombre}` : destino;

              const expandida = cuentaExpandida === cuenta.id || cuentas.length === 1;

              return (
                <Card
                  key={cuenta.id}
                  className={cn(
                    "transition-all duration-200 border-border/80",
                    cuenta.status === "CUENTA_PEDIDA" && "border-warning/50 bg-warning/5 ring-1 ring-warning/20",
                  )}
                >
                  <CardContent className="p-4 space-y-3">
                    {/* Header de la tarjeta de cuenta */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-base">{titulo}</h3>
                          <Badge
                            variant={cuenta.status === "CUENTA_PEDIDA" ? "default" : "outline"}
                            className={cn(
                              cuenta.status === "CUENTA_PEDIDA"
                                ? "bg-warning text-warning-foreground font-bold"
                                : "border-[var(--linea-30)] text-muted-foreground",
                            )}
                          >
                            {cuenta.status === "CUENTA_PEDIDA" ? "CUENTA PEDIDA 🧾" : "Abierta"}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Pedido #{cuenta.code} · Abrió {cuenta.openedBy.name}
                          {cuenta.customerName && ` · ${cuenta.customerName}`}
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="numeral text-xl font-extrabold text-[var(--papel)] block font-display">
                          {formatCop(cuenta.totalCop)}
                        </span>
                        <span className="text-rotulo text-muted-foreground font-mono">
                          {cuenta.items.length} {cuenta.items.length === 1 ? "producto" : "productos"}
                        </span>
                      </div>
                    </div>

                    {/* Resumen de items del ticket */}
                    <div className="rounded-lg bg-[var(--panel-2)] border border-[var(--linea-16)] p-2.5 space-y-1 text-xs">
                      {cuenta.items.map((item) => (
                        <div key={item.id} className="flex justify-between gap-2">
                          <span className="truncate">
                            <strong className="text-[var(--brasa)] font-semibold">{item.quantity}x</strong>{" "}
                            {item.nameSnapshot}
                          </span>
                          <span className="numeral text-muted-foreground font-medium shrink-0 font-mono">
                            {formatCop(item.lineTotalCop)}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Botón para desplegar / cobrar */}
                    {!expandida ? (
                      <div className="flex items-center gap-2 pt-1">
                        <a
                          href={`/imprimir/pedido/${cuenta.id}`}
                          target="_blank"
                          rel="noopener"
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-warning/40 bg-warning/15 hover:bg-warning/25 text-warning-soft font-bold px-3 h-11 tableta:h-10 text-xs shadow-sm transition-all hover:scale-[1.02] shrink-0"
                        >
                          🖨️ Pre-cuenta
                        </a>
                        <Button
                          type="button"
                          onClick={() => setCuentaExpandida(cuenta.id)}
                          className="flex-1 bg-success hover:bg-success/90 text-white font-bold h-10 text-xs shadow-sm"
                        >
                          Cobrar en caja →
                        </Button>
                      </div>
                    ) : (
                      <FormularioCobro
                        cuenta={cuenta}
                        puedeFacturar={puedeFacturar}
                        propina={propina}
                      />
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}
