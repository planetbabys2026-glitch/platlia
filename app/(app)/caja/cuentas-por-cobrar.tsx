"use client";

import { useActionState, useEffect, useState } from "react";
import {
  Banknote,
  Bike,
  CreditCard,
  Landmark,
  MoreHorizontal,
  Printer,
  Receipt,
  Smartphone,
} from "lucide-react";
import { PaymentMethod } from "@/generated/prisma/enums";
import { registrarPago } from "@/features/pedidos/actions";
import {
  DatosFiscales,
  valorFiscalInicial,
} from "@/features/pedidos/components/datos-fiscales";
import { SelectorDePropina } from "@/features/pedidos/components/propina";
import { UnirCuentas } from "@/features/pedidos/components/unir-cuentas";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PantallaCargando } from "@/components/marca/loader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ESTADO_INICIAL } from "@/lib/actions/estado";
import { formatCop } from "@/lib/money";
import { computeSuggestedTip } from "@/lib/tax";
import { formatTurno } from "@/lib/turns";
import { cn } from "@/lib/utils";

const METODOS_PAGO = [
  { clave: PaymentMethod.EFECTIVO, etiqueta: "Efectivo", icono: Banknote },
  { clave: PaymentMethod.NEQUI, etiqueta: "Nequi", icono: Smartphone },
  { clave: PaymentMethod.DAVIPLATA, etiqueta: "Daviplata", icono: Smartphone },
  { clave: PaymentMethod.TARJETA_DEBITO, etiqueta: "T. Débito", icono: CreditCard },
  { clave: PaymentMethod.TARJETA_CREDITO, etiqueta: "T. Crédito", icono: CreditCard },
  { clave: PaymentMethod.TRANSFERENCIA, etiqueta: "Transferencia", icono: Landmark },
  { clave: PaymentMethod.BONO, etiqueta: "Bono", icono: Receipt },
  { clave: PaymentMethod.OTRO, etiqueta: "Otro", icono: MoreHorizontal },
] as const;

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
  deliveryFeeCop?: number | null;
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
  const [montoEntregado, setMontoEntregado] = useState("");
  /**
   * El paso de verificación antes de cobrar.
   *
   * Un cobro mal hecho no se deshace: hay que anular el pedido, devolver plata y
   * dejarlo escrito en la bitácora. Los tres errores que cuestan son cobrar otro
   * monto, marcar efectivo como tarjeta y calcular mal la devuelta, así que el
   * resumen dice exactamente esas tres cosas y nada más.
   */
  const [verificando, setVerificando] = useState(false);
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

  const [montoACobrar, setMontoACobrar] = useState<string>("");
  const numEntregado = parseInt(montoEntregado.replace(/\D/g, "") || "0", 10);
  const numACobrar = parseInt((montoACobrar || String(faltanteCop)).replace(/\D/g, "") || "0", 10);

  /**
   * Cualquier cambio cierra la verificación.
   *
   * Es lo único que hace que el resumen signifique algo: sin esto se podía
   * revisar, cambiar el monto o el método con el panel abierto, y confirmar una
   * cifra que ya no era la del formulario. El paso habría dado seguridad falsa,
   * que es peor que no tenerlo.
   */
  useEffect(() => {
    setVerificando(false);
  }, [metodo, montoACobrar, montoEntregado, propinaCop]);
  const cambioDevuelta = metodo === "EFECTIVO" && numEntregado > faltanteCop ? numEntregado - faltanteCop : 0;

  const tieneDomicilio = cuenta.type === "DOMICILIO" || (cuenta.deliveryFeeCop != null && cuenta.deliveryFeeCop > 0);
  const valorDomicilio = cuenta.deliveryFeeCop ?? 0;

  return (
    <form action={accion} className="space-y-4 pt-3.5 border-t border-border">
      <input type="hidden" name="orderId" value={cuenta.id} />
      <input type="hidden" name="method" value={metodo} />
      <input type="hidden" name="tipCop" value={propinaCop} />
      <PantallaCargando forcePending={isPending} />

      {/* Barra sobria de pre-cuenta */}
      <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/40 border border-border p-3">
        <div className="space-y-0.5">
          <p className="text-xs font-semibold text-foreground">Ticket de pre-cuenta</p>
          <p className="text-rotulo text-muted-foreground">Imprimir resumen para llevar a la mesa antes de cobrar</p>
        </div>
        <Button
          asChild
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs font-medium gap-1.5 shrink-0 border-border hover:bg-muted"
        >
          <a href={`/imprimir/pedido/${cuenta.id}`} target="_blank" rel="noopener">
            <Printer className="size-3.5" />
            Imprimir
          </a>
        </Button>
      </div>

      {/* Desglose de totales antes de cobrar */}
      <div className="rounded-xl bg-muted/30 border border-border p-3 space-y-1.5">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Subtotal productos ({cuenta.items.reduce((acc, i) => acc + i.quantity, 0)})</span>
          <span className="numeral">{formatCop(cuenta.subtotalCop)}</span>
        </div>
        {tieneDomicilio && (
          <div className="flex justify-between text-xs font-medium text-brand">
            <span className="flex items-center gap-1.5">
              <Bike className="size-3.5" /> Servicio de domicilio
            </span>
            <span className="numeral font-bold">
              {valorDomicilio > 0 ? `+${formatCop(valorDomicilio)}` : "Gratis ($0)"}
            </span>
          </div>
        )}
        {propinaCop > 0 && (
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Propina voluntaria</span>
            <span className="numeral font-medium">+{formatCop(propinaCop)}</span>
          </div>
        )}
        <div className="flex justify-between items-baseline pt-2 mt-1 border-t border-border font-bold text-foreground">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">Total a cobrar</span>
          <span className="numeral text-lg text-brand font-extrabold">{formatCop(faltanteCop)}</span>
        </div>
      </div>

      {/* Selector de Método de Pago */}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-foreground">
          Método de pago
        </Label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          {METODOS_PAGO.map(({ clave, etiqueta, icono: Icono }) => (
            <button
              key={clave}
              type="button"
              onClick={() => setMetodo(clave)}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-xl border px-2.5 py-2 text-xs font-medium transition-all text-center",
                metodo === clave
                  ? "border-brand bg-brand/10 text-brand font-bold shadow-xs"
                  : "border-border bg-background hover:bg-muted text-foreground",
              )}
            >
              <Icono className="size-3.5 shrink-0 opacity-80" />
              <span>{etiqueta}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Campos de Cobro y Efectivo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor={`monto-${cuenta.id}`} className="text-xs font-medium text-foreground">
            Valor a registrar ($ COP)
          </Label>
          {/* Controlado, y no `defaultValue` con `key`: el resumen de la
              verificación tiene que mostrar lo que el cajero escribió. Leyendo el
              faltante calculado, un monto editado a mano se confirmaba con una
              cifra distinta de la que se iba a cobrar, que es justo lo que este
              paso existe para impedir. */}
          <Input
            id={`monto-${cuenta.id}`}
            name="amountCop"
            inputMode="numeric"
            value={montoACobrar || String(faltanteCop)}
            onChange={(e) => setMontoACobrar(e.target.value)}
            required
            className="numeral h-9 font-mono text-sm font-semibold"
          />
        </div>

        {metodo === "EFECTIVO" && (
          <div className="space-y-1">
            <Label htmlFor={`entregado-${cuenta.id}`} className="text-xs font-medium text-foreground">
              Efectivo recibido (calcula devuelta)
            </Label>
            <Input
              id={`entregado-${cuenta.id}`}
              name="tenderedCop"
              inputMode="numeric"
              value={montoEntregado}
              onChange={(e) => setMontoEntregado(e.target.value)}
              placeholder={faltanteCop.toString()}
              className="h-9 text-sm numeral font-mono"
            />
          </div>
        )}
      </div>

      {/* Presets de Efectivo y Devuelta */}
      {metodo === "EFECTIVO" && (
        <div className="space-y-2 p-3 rounded-xl bg-muted/40 border border-border">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            {[
              { label: "Exacto", val: faltanteCop },
              { label: "$20k", val: 20000 },
              { label: "$50k", val: 50000 },
              { label: "$100k", val: 100000 },
            ].map((b) => (
              <button
                key={b.label}
                type="button"
                onClick={() => setMontoEntregado(b.val.toString())}
                className="px-2.5 py-1 rounded-xl bg-background border border-border text-rotulo font-bold hover:bg-brand hover:text-brand-foreground transition-colors"
              >
                {b.label}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-border text-xs">
            <span className="font-medium text-muted-foreground">Cambio / Devuelta:</span>
            <span className="numeral text-sm font-bold text-success-soft">
              {formatCop(cambioDevuelta)}
            </span>
          </div>
        </div>
      )}

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

      {verificando ? (
        <div className="space-y-3 rounded-xl border border-brand/40 bg-brand/5 p-3.5">
          <p className="font-mono text-rotulo font-bold uppercase tracking-wider text-brand">
            Revisá antes de cobrar
          </p>

          <dl className="space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-xs text-muted-foreground">Se cobra</dt>
              <dd className="numeral text-lg font-bold text-foreground">{formatCop(numACobrar)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-xs text-muted-foreground">Método</dt>
              <dd className="text-sm font-semibold text-foreground">{METODOS_PAGO.find((m) => m.clave === metodo)?.etiqueta ?? metodo}</dd>
            </div>
            {metodo === "EFECTIVO" && (
              <div className="flex items-baseline justify-between gap-3 border-t border-brand/20 pt-2">
                <dt className="text-xs text-muted-foreground">Devuelta</dt>
                {/* Sin efectivo recibido no hay vuelto que calcular, y decir "$0"
                    se lee como "pagó justo" cuando en realidad nadie lo escribió.
                    Son dos cosas distintas y el cajero tiene la plata en la mano. */}
                <dd
                  className={cn(
                    "numeral text-lg font-bold",
                    cambioDevuelta > 0 ? "text-success-soft" : "text-muted-foreground",
                  )}
                >
                  {numEntregado > 0 ? formatCop(cambioDevuelta) : "Paga justo"}
                </dd>
              </div>
            )}
          </dl>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setVerificando(false)}
              className="h-11 flex-1 rounded-xl text-sm font-semibold"
            >
              Corregir
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="h-11 flex-[2] gap-2 rounded-xl bg-brand text-sm font-bold text-brand-foreground shadow-sm hover:bg-brand/90"
            >
              {isPending ? "Cobrando…" : "Cobrar"}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          size="lg"
          onClick={() => setVerificando(true)}
          className="h-11 w-full gap-2 rounded-xl bg-brand text-sm font-bold text-brand-foreground shadow-sm hover:bg-brand/90"
        >
          Cobrar {formatCop(numACobrar)}
        </Button>
      )}

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

  // Los domicilios no se unen —cada uno tiene su dirección y su envío— y la
  // acción los rechaza. No se ofrecen: la pantalla no puede proponer algo que el
  // servidor va a devolver con un error.
  const unibles = cuentas.filter((c) => c.type !== "DOMICILIO");

  if (cuentas.length === 0) {
    return (
      <Card className="border-border shadow-xs">
        <CardContent className="py-10 text-center space-y-2">
          <Receipt className="size-8 text-muted-foreground mx-auto opacity-60" />
          <p className="text-sm font-medium text-foreground">
            No hay cuentas pendientes por cobrar
          </p>
          <p className="text-xs text-muted-foreground">
            Los pedidos enviados a caja desde el salón aparecerán en esta lista listos para el pago.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <section className="space-y-4" aria-label="Cuentas por cobrar">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2.5">
          <span>Cuentas por cobrar</span>
          <Badge variant="secondary" className="font-mono text-rotulo font-semibold">
            {cuentas.length} {cuentas.length === 1 ? "pendiente" : "pendientes"}
          </Badge>
        </h2>
      </div>

      {/* Unir cuentas de MESAS DISTINTAS.
          Es el caso que la pantalla de la mesa no puede resolver: un grupo que
          llegó junto, se repartió en tres mesas y paga con una sola tarjeta. Sin
          esto son tres cobros, tres tiquetes y —si piden factura— tres documentos
          ante la DIAN por una sola venta. */}
      {unibles.length > 1 && (
        <UnirCuentas
          cuentas={unibles.map((c) => ({
            id: c.id,
            code: c.code,
            etiqueta: c.customerName?.trim() || `Pedido #${c.code}`,
            mesa: c.table ? `Mesa ${c.table.name}` : null,
            totalCop: c.totalCop,
          }))}
          titulo="Unir varias cuentas en una"
        />
      )}

      {agruparPorMesa(cuentas).map((grupo) => (
        <div key={grupo.clave} className="space-y-3">
          {/* Encabezado solo cuando la mesa trae varias cuentas */}
          {grupo.cuentas.length > 1 && (
            <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-dashed border-border/80 bg-muted/30 px-3.5 py-2">
              <span className="text-xs font-bold text-foreground">
                Mesa {grupo.mesa}
                <span className="text-muted-foreground ml-2 text-rotulo font-normal">
                  {grupo.cuentas.length} cuentas separadas
                </span>
              </span>
              <span className="numeral text-sm font-bold text-brand">
                {formatCop(grupo.cuentas.reduce((suma, c) => suma + c.totalCop, 0))}
              </span>
            </div>
          )}

          <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-2">
            {grupo.cuentas.map((cuenta) => {
              const esDomicilio = cuenta.type === "DOMICILIO";
              const nombre = cuenta.customerName?.trim();

              const destino = esDomicilio
                ? (nombre ? `Domicilio · ${nombre}` : `Domicilio #${cuenta.code}`)
                : cuenta.table
                  ? (nombre ? `Mesa ${cuenta.table.name} · ${nombre}` : `Mesa ${cuenta.table.name}`)
                  : cuenta.turnNumber !== null
                    ? (nombre ? `Turno ${formatTurno(cuenta.turnNumber, 99, false)} · ${nombre}` : `Turno ${formatTurno(cuenta.turnNumber, 99, false)}`)
                    : (nombre ? `Pedido #${cuenta.code} · ${nombre}` : `Pedido #${cuenta.code}`);

              const expandida = cuentaExpandida === cuenta.id || cuentas.length === 1;
              const tieneDomicilio = esDomicilio || (cuenta.deliveryFeeCop != null && cuenta.deliveryFeeCop > 0);
              const valorDomicilio = cuenta.deliveryFeeCop ?? 0;

              return (
                <Card
                  key={cuenta.id}
                  className={cn(
                    "transition-all duration-200 border-border shadow-xs",
                    cuenta.status === "CUENTA_PEDIDA" && "border-warning/40 bg-warning/[0.02]",
                  )}
                >
                  <CardContent className="p-4 space-y-3">
                    {/* Header de la tarjeta de cuenta */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-bold text-base text-foreground flex items-center gap-1.5">
                            {esDomicilio && <Bike className="size-4 text-brand shrink-0" />}
                            <span>{destino}</span>
                          </h3>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-rotulo font-bold uppercase tracking-wider px-2 py-0.5",
                              cuenta.status === "CUENTA_PEDIDA"
                                ? "bg-warning/15 text-warning-soft border-warning/30"
                                : "text-muted-foreground border-border",
                            )}
                          >
                            {cuenta.status === "CUENTA_PEDIDA" ? "Cuenta pedida" : "Abierta"}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Pedido #{cuenta.code} · Abrió {cuenta.openedBy.name}
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="numeral text-xl font-bold text-foreground block">
                          {formatCop(cuenta.totalCop)}
                        </span>
                        <span className="text-rotulo text-muted-foreground font-mono">
                          {cuenta.items.length} {cuenta.items.length === 1 ? "producto" : "productos"}
                        </span>
                      </div>
                    </div>

                    {/* Resumen de items del ticket con desglose explícito de domicilio */}
                    <div className="rounded-xl bg-muted/40 border border-border/70 p-3 space-y-1.5 text-xs">
                      {cuenta.items.map((item) => (
                        <div key={item.id} className="flex justify-between items-baseline gap-2">
                          <span className="truncate text-foreground">
                            <span className="font-semibold text-muted-foreground mr-1.5">{item.quantity}x</span>
                            {item.nameSnapshot}
                          </span>
                          <span className="numeral text-muted-foreground font-medium shrink-0 font-mono">
                            {formatCop(item.lineTotalCop)}
                          </span>
                        </div>
                      ))}

                      {/* Línea explícita de Domicilio */}
                      {tieneDomicilio && (
                        <div className="flex justify-between items-baseline gap-2 pt-1.5 mt-1 border-t border-border/50 text-xs">
                          <span className="font-semibold text-brand flex items-center gap-1.5">
                            <Bike className="size-3.5 shrink-0" /> Servicio de domicilio
                          </span>
                          <span className="numeral font-bold text-foreground">
                            {valorDomicilio > 0 ? `+${formatCop(valorDomicilio)}` : "Gratis ($0)"}
                          </span>
                        </div>
                      )}

                      {/* Línea de Propina */}
                      {cuenta.tipCop > 0 && (
                        <div className="flex justify-between items-baseline gap-2 text-xs text-muted-foreground">
                          <span>Propina</span>
                          <span className="numeral font-medium">+{formatCop(cuenta.tipCop)}</span>
                        </div>
                      )}
                    </div>

                    {/* Botón para desplegar / cobrar */}
                    {!expandida ? (
                      <div className="flex items-center gap-2 pt-1">
                        <Button
                          asChild
                          variant="outline"
                          size="sm"
                          className="h-9 text-xs font-semibold gap-1.5 border-border hover:bg-muted text-muted-foreground hover:text-foreground shrink-0"
                        >
                          <a href={`/imprimir/pedido/${cuenta.id}`} target="_blank" rel="noopener">
                            <Printer className="size-3.5" />
                            Pre-cuenta
                          </a>
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => setCuentaExpandida(cuenta.id)}
                          className="flex-1 bg-brand hover:bg-brand/90 text-brand-foreground font-bold h-9 text-xs shadow-xs"
                        >
                          Cobrar cuenta
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
