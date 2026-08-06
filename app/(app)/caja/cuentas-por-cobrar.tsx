"use client";

import { useActionState, useState } from "react";
import { PaymentMethod } from "@/generated/prisma/enums";
import { registrarPago } from "@/features/pedidos/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PantallaCargando } from "@/components/ui/cargando-overlay";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ESTADO_INICIAL } from "@/lib/actions/estado";
import { formatCop } from "@/lib/money";
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
  billRequestedAt: Date | null;
  openedAt: Date;
  table: { id: string; name: string } | null;
  openedBy: { name: string };
  items: {
    id: string;
    nameSnapshot: string;
    quantity: number;
    lineTotalCop: number;
  }[];
};

function FormularioCobro({ cuenta }: { cuenta: Cuenta }) {
  const [metodo, setMetodo] = useState<string>(PaymentMethod.EFECTIVO);
  const [estado, accion, isPending] = useActionState(registrarPago, ESTADO_INICIAL);
  const faltanteCop = Math.max(0, cuenta.totalCop - cuenta.paidCop);

  return (
    <form action={accion} className="space-y-4 pt-3 border-t border-border/80">
      <input type="hidden" name="orderId" value={cuenta.id} />
      <input type="hidden" name="method" value={metodo} />
      <PantallaCargando forcePending={isPending} />

      {/* Botón de impresión de pre-cuenta para entregar a la mesera antes de cobrar */}
      <div className="flex items-center justify-between gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 p-2.5">
        <div className="space-y-0.5">
          <p className="text-xs font-bold text-amber-800 dark:text-amber-300">Ticket de Pre-cuenta</p>
          <p className="text-[11px] text-muted-foreground">Imprimir factura para llevar a la mesa</p>
        </div>
        <a
          href={`/imprimir/pedido/${cuenta.id}`}
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-1.5 rounded-md bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-3 py-1.5 text-xs shadow-sm transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          🖨️ Imprimir ticket
        </a>
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
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
                  ? "border-emerald-500 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold ring-1 ring-emerald-500/30"
                  : "border-border/80 bg-muted/40 hover:bg-accent text-foreground",
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
          <Input
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

      <Button
        type="submit"
        size="lg"
        disabled={isPending}
        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-11 text-sm shadow-md gap-2"
      >
        {isPending ? "Procesando cobro…" : `💳 Confirmar pago de ${formatCop(faltanteCop)} y liberar mesa`}
      </Button>

      {!estado.ok && estado.error && (
        <Alert variant="destructive" role="alert" className="py-2 text-xs">
          <AlertDescription>{estado.error}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}

export function CuentasPorCobrar({ cuentas }: { cuentas: Cuenta[] }) {
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
          <Badge variant="default" className="bg-emerald-600 text-white">
            {cuentas.length}
          </Badge>
        </h2>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2">
        {cuentas.map((cuenta) => {
          const titulo = cuenta.table
            ? `Mesa ${cuenta.table.name}${cuenta.turnNumber !== null ? ` · ${formatTurno(cuenta.turnNumber, 99, true)}` : ""}`
            : cuenta.turnNumber !== null
              ? `Turno ${formatTurno(cuenta.turnNumber, 99, false)}`
              : `Pedido #${cuenta.code}`;

          const expandida = cuentaExpandida === cuenta.id || cuentas.length === 1;

          return (
            <Card
              key={cuenta.id}
              className={cn(
                "transition-all duration-200 border-border/80",
                cuenta.status === "CUENTA_PEDIDA" && "border-amber-500/50 bg-amber-500/5 ring-1 ring-amber-500/20",
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
                            ? "bg-amber-500 text-slate-950 font-bold"
                            : "text-muted-foreground",
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
                    <span className="numeral text-xl font-extrabold text-foreground block">
                      {formatCop(cuenta.totalCop)}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {cuenta.items.length} {cuenta.items.length === 1 ? "producto" : "productos"}
                    </span>
                  </div>
                </div>

                {/* Resumen de items del ticket */}
                <div className="rounded-lg bg-muted/30 p-2.5 space-y-1 text-xs">
                  {cuenta.items.map((item) => (
                    <div key={item.id} className="flex justify-between gap-2">
                      <span className="truncate">
                        <strong className="text-brand font-semibold">{item.quantity}x</strong>{" "}
                        {item.nameSnapshot}
                      </span>
                      <span className="numeral text-muted-foreground font-medium shrink-0">
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
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold px-3 h-10 text-xs shadow-sm transition-all hover:scale-[1.02] shrink-0"
                    >
                      🖨️ Pre-cuenta
                    </a>
                    <Button
                      type="button"
                      onClick={() => setCuentaExpandida(cuenta.id)}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-10 text-xs shadow-sm"
                    >
                      Cobrar en caja →
                    </Button>
                  </div>
                ) : (
                  <FormularioCobro cuenta={cuenta} />
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
