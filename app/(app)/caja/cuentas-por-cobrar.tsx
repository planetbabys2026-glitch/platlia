"use client";

import { useActionState, useEffect, useState } from "react";
import {
  Bike,
  Printer,
  Receipt,
} from "lucide-react";
import { PaymentMethod } from "@/generated/prisma/enums";
import { registrarPago } from "@/features/pedidos/actions";
import {
  DatosFiscales,
  valorFiscalInicial,
} from "@/features/pedidos/components/datos-fiscales";
import { SelectorDePropina } from "@/features/pedidos/components/propina";
import { UnirCuentas } from "@/features/pedidos/components/unir-cuentas";
import { CamposDeCredito } from "@/features/cartera/components/campos-de-credito";
import {
  etiquetaDeMedio,
  SelectorMedioDePago,
} from "@/features/caja/components/selector-medio-de-pago";
import {
  ESTADOS_EN_ORDEN,
  ETIQUETA_DE_COBRO,
  type EstadoDeCobro,
} from "@/features/caja/reglas";
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
  /** Lo calcula `estadoDeCobro` en el servidor: decide el grupo y el orden. */
  estadoCobro: EstadoDeCobro;
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
  puedeFiar,
  propina,
}: {
  cuenta: Cuenta;
  puedeFiar: boolean;
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
        <SelectorMedioDePago valor={metodo} onChange={setMetodo} puedeFiar={puedeFiar} />
      </div>

      {metodo === PaymentMethod.CREDITO && <CamposDeCredito />}

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
              <dd className="text-sm font-semibold text-foreground">{etiquetaDeMedio(metodo)}</dd>
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

/** Cómo se llama esta cuenta en la lista: es lo que el cajero busca con la vista. */
function destinoDe(cuenta: Cuenta): string {
  const nombre = cuenta.customerName?.trim();
  const con = (base: string) => (nombre ? `${base} · ${nombre}` : base);

  if (cuenta.type === "DOMICILIO") return con(`Domicilio #${cuenta.code}`);
  if (cuenta.table) return con(`Mesa ${cuenta.table.name}`);
  if (cuenta.turnNumber !== null) return con(`Turno ${formatTurno(cuenta.turnNumber, 99, false)}`);
  return con(`Pedido #${cuenta.code}`);
}

/** "hace 40 min": cuánto lleva esperando, que es la mitad de la urgencia. */
function desdeHace(desde: Date): string {
  const minutos = Math.max(0, Math.round((Date.now() - new Date(desde).getTime()) / 60_000));
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  return `${horas} h ${minutos % 60} min`;
}

const CHIP_DE_ESTADO: Record<EstadoDeCobro, string> = {
  PIDIO_CUENTA: "chip is-hot",
  LISTO: "chip is-ok",
  EN_CURSO: "chip is-wait",
};

/** Una cuenta en la columna izquierda. */
function FilaDeCuenta({
  cuenta,
  activa,
  onElegir,
}: {
  cuenta: Cuenta;
  activa: boolean;
  onElegir: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onElegir}
        aria-current={activa ? "true" : undefined}
        className={cn(
          "flex w-full items-baseline justify-between gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors",
          activa
            ? "border-brand bg-brand/10"
            : "border-border/70 bg-card hover:border-border hover:bg-muted/40",
        )}
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold text-foreground">
            {destinoDe(cuenta)}
          </span>
          <span className="text-rotulo text-muted-foreground">
            #{cuenta.code} · {desdeHace(cuenta.billRequestedAt ?? cuenta.openedAt)}
          </span>
        </span>
        <span className="numeral shrink-0 text-sm font-bold text-foreground">
          {formatCop(cuenta.totalCop)}
        </span>
      </button>
    </li>
  );
}

/**
 * Cobrar cuentas, en dos columnas: la lista a la izquierda y el cobro a la derecha.
 *
 * Antes era una rejilla de tarjetas que se desplegaban en el lugar. Con la caja
 * mostrando el piso entero —y no solo lo que alguien mandó— esa forma se cae: la
 * tarjeta abierta empuja a las demás, hay que deslizar para encontrar la que se
 * está cobrando, y el detalle compite por el ancho con las tarjetas vecinas.
 *
 * En dos columnas la lista no se mueve nunca: el cajero elige, cobra, y la lista
 * sigue donde estaba. Es la forma de toda pantalla que atiende una cola.
 *
 * **La lista va agrupada por urgencia, no por mesa.** Quien está parado en la caja
 * no busca "la mesa 4": busca a quién le toca. Primero quien pidió la cuenta
 * —hay una persona esperando—, después lo que ya salió entero de cocina, y al
 * final lo que todavía se está comiendo, que se muestra para saber cuánta plata
 * hay viva en el piso y no para cobrarla ahora.
 */
export function CuentasPorCobrar({
  cuentas,
  puedeFacturar,
  puedeFiar,
  propina,
}: {
  cuentas: Cuenta[];
  puedeFacturar: boolean;
  /** El negocio fía: lo enciende el dueño en Configuración. */
  puedeFiar: boolean;
  propina: { habilitada: boolean; rateBp: number };
}) {
  /**
   * Arranca en la primera, que la consulta ya dejó siendo la más urgente.
   *
   * Se guarda el id y no el índice: al cobrar una, la lista se rearma y un índice
   * apuntaría a otra cuenta —la de abajo— con el formulario ya abierto. Cobrarle a
   * quien no era es exactamente el error que esta pantalla no puede permitir.
   */
  const [elegida, setElegida] = useState<string | null>(null);
  const cuenta = cuentas.find((c) => c.id === elegida) ?? cuentas[0] ?? null;

  const unibles = cuentas.filter((c) => c.type !== "DOMICILIO");

  const grupos = ESTADOS_EN_ORDEN.map((estado) => ({
    estado,
    cuentas: cuentas.filter((c) => c.estadoCobro === estado),
  })).filter((g) => g.cuentas.length > 0);

  if (cuentas.length === 0) {
    return (
      <Card className="border-border shadow-xs">
        <CardContent className="space-y-2 py-10 text-center">
          <Receipt className="mx-auto size-8 text-muted-foreground opacity-60" />
          <p className="text-sm font-medium text-foreground">No hay cuentas por cobrar</p>
          <p className="text-xs text-muted-foreground">
            Apenas el mesero mande una comanda a cocina, la cuenta aparece acá sola.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <section className="space-y-4" aria-label="Cuentas por cobrar">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2.5 text-lg font-bold tracking-tight text-foreground">
          <span>Cuentas por cobrar</span>
          <Badge variant="secondary" className="font-mono text-rotulo font-semibold">
            {cuentas.length} {cuentas.length === 1 ? "abierta" : "abiertas"}
          </Badge>
        </h2>

        {/* Unir cuentas de MESAS DISTINTAS: el grupo que llegó junto, se repartió
            en tres mesas y paga con una sola tarjeta. Los domicilios no se unen. */}
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
      </div>

      {/* Una sola columna hasta 1180px: en una tableta vertical, dos columnas
          dejan el cobro en 300px y el formulario deja de ser usable. */}
      <div className="grid gap-4 doble:grid-cols-[20rem_1fr] doble:items-start">
        <div className="space-y-4 doble:sticky doble:top-20">
          {grupos.map((grupo) => (
            <div key={grupo.estado} className="space-y-2">
              <div className="flex items-center gap-2">
                <span className={CHIP_DE_ESTADO[grupo.estado]}>
                  {ETIQUETA_DE_COBRO[grupo.estado]}
                </span>
                <span className="numeral text-rotulo font-bold text-muted-foreground">
                  {grupo.cuentas.length}
                </span>
                <span className="flex-1 border-t border-dashed border-border/80" />
              </div>

              <ul className="space-y-2">
                {grupo.cuentas.map((c) => (
                  <FilaDeCuenta
                    key={c.id}
                    cuenta={c}
                    activa={cuenta?.id === c.id}
                    onElegir={() => setElegida(c.id)}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>

        {cuenta && (
          <Card className="border-border shadow-xs">
            <CardContent className="space-y-3.5 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="space-y-1">
                  <h3 className="flex items-center gap-1.5 text-base font-bold text-foreground">
                    {cuenta.type === "DOMICILIO" && <Bike className="size-4 shrink-0 text-brand" />}
                    <span>{destinoDe(cuenta)}</span>
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Pedido #{cuenta.code} · abrió {cuenta.openedBy.name} ·{" "}
                    {desdeHace(cuenta.openedAt)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <span className="numeral block text-2xl font-black text-foreground">
                    {formatCop(cuenta.totalCop)}
                  </span>
                  <span className={CHIP_DE_ESTADO[cuenta.estadoCobro]}>
                    {ETIQUETA_DE_COBRO[cuenta.estadoCobro]}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5 rounded-xl border border-border/70 bg-muted/40 p-3 text-xs">
                {cuenta.items.map((item) => (
                  <div key={item.id} className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-foreground">
                      <span className="mr-1.5 font-semibold text-muted-foreground">
                        {item.quantity}x
                      </span>
                      {item.nameSnapshot}
                    </span>
                    <span className="numeral shrink-0 font-medium text-muted-foreground">
                      {formatCop(item.lineTotalCop)}
                    </span>
                  </div>
                ))}

                {(cuenta.type === "DOMICILIO" ||
                  (cuenta.deliveryFeeCop != null && cuenta.deliveryFeeCop > 0)) && (
                  <div className="mt-1 flex items-baseline justify-between gap-2 border-t border-border/50 pt-1.5">
                    <span className="flex items-center gap-1.5 font-semibold text-brand">
                      <Bike className="size-3.5 shrink-0" /> Servicio de domicilio
                    </span>
                    <span className="numeral font-bold text-foreground">
                      {(cuenta.deliveryFeeCop ?? 0) > 0
                        ? `+${formatCop(cuenta.deliveryFeeCop ?? 0)}`
                        : "Gratis ($0)"}
                    </span>
                  </div>
                )}

                {cuenta.tipCop > 0 && (
                  <div className="flex items-baseline justify-between gap-2 text-muted-foreground">
                    <span>Propina</span>
                    <span className="numeral font-medium">+{formatCop(cuenta.tipCop)}</span>
                  </div>
                )}
              </div>

              {/* La cuenta todavía puede crecer: decirlo evita cobrar de menos y
                  tener que anular para volver a cobrar. */}
              {cuenta.estadoCobro === "EN_CURSO" && (
                <p className="text-xs text-warning-soft">
                  Todavía hay renglones en cocina: esta cuenta puede crecer antes de que
                  la pidan.
                </p>
              )}

              <FormularioCobro
                cuenta={cuenta}
                puedeFacturar={puedeFacturar}
                puedeFiar={puedeFiar}
                propina={propina}
              />
            </CardContent>
          </Card>
        )}
      </div>
    </section>
  );
}
