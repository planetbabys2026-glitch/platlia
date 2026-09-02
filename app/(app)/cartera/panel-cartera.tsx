"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { HandCoins, Wallet } from "lucide-react";
import { PaymentMethod } from "@/generated/prisma/enums";
import { condonarFiado, registrarAbono } from "@/features/cartera/actions";
import { aplicarAbono } from "@/features/cartera/reglas";
import type { DeudorDeCartera, FichaDeDeudor } from "@/features/cartera/queries";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Vacio } from "@/components/marca/pantalla";
import { ESTADO_INICIAL } from "@/lib/actions/estado";
import { formatCop } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * La cartera, en dos columnas: la lista a la izquierda y la ficha a la derecha.
 *
 * Es la misma forma que Cobrar cuentas porque es el mismo tipo de trabajo —una
 * cola que se atiende de a uno—, y por la misma razón **se guarda el `id` de la
 * persona elegida y nunca el índice**: al abonar, la lista se rearma y un índice
 * apuntaría a otra persona con el formulario abierto y otro saldo. Abonarle a
 * quien no era es el error que esta pantalla no puede permitir.
 */

/** Los medios con los que se abona: no se paga una deuda con otra deuda. */
const METODOS_DE_ABONO = [
  { clave: PaymentMethod.EFECTIVO, etiqueta: "Efectivo" },
  { clave: PaymentMethod.NEQUI, etiqueta: "Nequi" },
  { clave: PaymentMethod.DAVIPLATA, etiqueta: "Daviplata" },
  { clave: PaymentMethod.TRANSFERENCIA, etiqueta: "Transferencia" },
  { clave: PaymentMethod.TARJETA_DEBITO, etiqueta: "T. Débito" },
  { clave: PaymentMethod.TARJETA_CREDITO, etiqueta: "T. Crédito" },
] as const;

/**
 * La antigüedad manda el color, y nada más.
 *
 * Un saldo grande no es un problema; uno viejo sí. Y lo reciente NO va en
 * `success`: que alguien deba no es un éxito.
 */
function tonoDeAntiguedad(dias: number): string {
  if (dias > 30) return "text-destructive-soft";
  if (dias > 7) return "text-warning-soft";
  return "text-muted-foreground";
}

function etiquetaDeAntiguedad(dias: number): string {
  if (dias === 0) return "hoy";
  if (dias === 1) return "1 día";
  return `${dias} días`;
}

function Enviar({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Un momento…" : children}
    </Button>
  );
}

function FormularioDeAbono({ ficha }: { ficha: FichaDeDeudor }) {
  const [estado, accion] = useActionState(registrarAbono, ESTADO_INICIAL);
  const [monto, setMonto] = useState("");
  const [metodo, setMetodo] = useState<string>(PaymentMethod.EFECTIVO);

  const montoCop = Number(monto.replace(/\D/g, "")) || 0;
  const vivos = ficha.fiados.filter((f) => f.saldoCop > 0 && !f.condonadoEn);

  /**
   * La previsualización usa la MISMA función pura que va a correr en el servidor.
   *
   * Sin esto el cajero abona a ciegas y se entera después de qué saldó. Es el
   * equivalente del paso "revisá antes de cobrar" de la caja, y por lo mismo:
   * cualquier cambio del monto lo recalcula.
   */
  const reparto = aplicarAbono(vivos, montoCop);
  const saldados = reparto.aplicaciones
    .filter((a) => a.saldaCompleto)
    .map((a) => vivos.find((f) => f.id === a.fiadoId)?.order.code)
    .filter((c): c is number => c !== undefined);
  const quedaCop = ficha.deudaCop - reparto.aplicadoCop;

  return (
    <form action={accion} className="space-y-3 rounded-xl border border-border/80 p-3">
      <input type="hidden" name="deudorId" value={ficha.id} />
      <input type="hidden" name="method" value={metodo} />

      {!estado.ok && estado.error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{estado.error}</AlertDescription>
        </Alert>
      )}

      <h3 className="rotulo-seccion">Registrar abono</h3>

      <div className="space-y-1.5">
        <Label htmlFor="montoCop">¿Cuánto entregó?</Label>
        <div className="relative">
          <span
            aria-hidden
            className="numeral pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted-foreground"
          >
            $
          </span>
          <Input
            id="montoCop"
            name="montoCop"
            inputMode="numeric"
            value={monto}
            onChange={(e) => setMonto(e.target.value.replace(/\D/g, ""))}
            placeholder="0"
            className="numeral pl-7 text-base"
            required
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>¿Con qué pagó?</Label>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {METODOS_DE_ABONO.map(({ clave, etiqueta }) => (
            <button
              key={clave}
              type="button"
              onClick={() => setMetodo(clave)}
              className={cn(
                "rounded-xl border px-2.5 py-2 text-xs font-medium transition-all",
                metodo === clave
                  ? "border-brand bg-brand/10 font-bold text-brand"
                  : "border-border bg-background text-foreground hover:bg-muted",
              )}
            >
              {etiqueta}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="nota">Nota</Label>
        <Input id="nota" name="nota" placeholder="Opcional" />
      </div>

      {/* Qué va a pasar, antes de que pase. */}
      {montoCop > 0 && (
        <p
          className={cn(
            "rounded-xl border p-2.5 text-xs",
            reparto.sobranteCop > 0
              ? "border-destructive/30 bg-destructive/10 text-destructive-soft"
              : "border-brand/30 bg-brand/10 text-foreground",
          )}
        >
          {reparto.sobranteCop > 0 ? (
            <>
              Debe <span className="numeral font-bold">{formatCop(ficha.deudaCop)}</span> y el
              abono es de <span className="numeral font-bold">{formatCop(montoCop)}</span>. No se
              reciben abonos por encima de la deuda.
            </>
          ) : (
            <>
              {saldados.length > 0 ? (
                <>
                  Salda {saldados.length === 1 ? "el pedido" : "los pedidos"}{" "}
                  {saldados.map((c) => `#${c}`).join(", ")}.{" "}
                </>
              ) : (
                <>Abona al pedido más viejo. </>
              )}
              {quedaCop > 0 ? (
                <>
                  Queda debiendo{" "}
                  <span className="numeral font-bold">{formatCop(quedaCop)}</span>.
                </>
              ) : (
                <>Queda al día.</>
              )}
            </>
          )}
        </p>
      )}

      <Enviar>Registrar abono</Enviar>
    </form>
  );
}

function Ficha({ deudorId, puedeCondonar }: { deudorId: string; puedeCondonar: boolean }) {
  const [ficha, setFicha] = useState<FichaDeDeudor | null>(null);
  const [condonado, condonar] = useActionState(condonarFiado, ESTADO_INICIAL);

  // La ficha se pide al elegir a la persona: traer los fiados y abonos de todos
  // los deudores de una sola vez sería un payload que la lista no usa.
  useEffect(() => {
    let vigente = true;
    void fetch(`/api/cartera/${deudorId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (vigente) setFicha(d);
      })
      .catch(() => {});
    return () => {
      vigente = false;
    };
  }, [deudorId, condonado]);

  if (!ficha) {
    return (
      <Card className="shadow-xs">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Cargando la ficha…
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-xs">
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-0.5">
            <h2 className="font-display text-lg font-black uppercase tracking-tight text-foreground">
              {ficha.nombre}
            </h2>
            <p className="font-mono text-xs text-muted-foreground">{ficha.telefono}</p>
            {ficha.direccion && (
              <p className="text-xs text-muted-foreground">{ficha.direccion}</p>
            )}
          </div>
          <div className="text-right">
            <span className="text-rotulo text-muted-foreground">Debe</span>
            <span className="numeral block text-2xl font-black text-brand">
              {formatCop(ficha.deudaCop)}
            </span>
          </div>
        </div>

        <div className="space-y-1.5">
          <h3 className="rotulo-seccion">Pedidos fiados</h3>
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border/80 text-xs">
            {ficha.fiados.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-2 bg-card p-2.5">
                <span>
                  <a
                    href={`/imprimir/pedido/${f.order.id}`}
                    target="_blank"
                    rel="noopener"
                    className="font-semibold text-foreground underline underline-offset-4"
                  >
                    #{f.order.code}
                  </a>
                  <span className="ml-2 text-muted-foreground">
                    {new Date(f.createdAt).toLocaleDateString("es-CO")}
                  </span>
                  {f.condonadoEn && (
                    <span className="chip is-wait ml-2">PERDONADA</span>
                  )}
                </span>
                <span className="flex items-center gap-2">
                  <span className="numeral text-muted-foreground">{formatCop(f.montoCop)}</span>
                  {f.saldoCop > 0 && (
                    <span className="numeral font-bold text-foreground">
                      debe {formatCop(f.saldoCop)}
                    </span>
                  )}
                  {puedeCondonar && f.saldoCop > 0 && !f.condonadoEn && (
                    <form action={condonar} className="inline">
                      <input type="hidden" name="fiadoId" value={f.id} />
                      <input type="hidden" name="motivo" value="Deuda incobrable" />
                      <Button
                        type="submit"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-destructive-soft"
                      >
                        Perdonar
                      </Button>
                    </form>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {ficha.deudaCop > 0 && <FormularioDeAbono ficha={ficha} />}

        {ficha.abonos.length > 0 && (
          <div className="space-y-1.5">
            <h3 className="rotulo-seccion">Abonos</h3>
            <ul className="space-y-1 text-xs text-muted-foreground">
              {ficha.abonos.map((a) => (
                <li key={a.id} className="flex justify-between gap-2">
                  <span>
                    {new Date(a.createdAt).toLocaleDateString("es-CO")} · {a.method} ·{" "}
                    {a.recibidoPor.name}
                    {a.aplicaciones.length > 0 && (
                      <span className="ml-1">
                        (saldó {a.aplicaciones.map((x) => `#${x.fiado.order.code}`).join(", ")})
                      </span>
                    )}
                  </span>
                  <span className="numeral font-bold text-foreground">
                    {formatCop(a.montoCop)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function PanelCartera({
  deudores,
  totalCop,
  tope,
  puedeCondonar,
}: {
  deudores: DeudorDeCartera[];
  totalCop: number;
  tope: number;
  puedeCondonar: boolean;
}) {
  const [elegido, setElegido] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");

  const q = busqueda.trim().toLowerCase();
  const visibles = q
    ? deudores.filter(
        (d) => d.nombre.toLowerCase().includes(q) || d.telefono.includes(q.replace(/\D/g, "")),
      )
    : deudores;

  const actual = deudores.find((d) => d.id === elegido) ?? visibles[0] ?? null;

  if (deudores.length === 0) {
    return (
      <Vacio
        icono={<Wallet className="size-8" />}
        titulo="Nadie debe nada"
        descripcion="Lo que se cobre con el método Crédito aparece acá hasta que lo paguen."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 border-b border-dashed border-border pb-4">
        <span>
          <span className="text-rotulo block text-muted-foreground">Fiado vivo</span>
          <span className="numeral text-2xl font-black text-brand">{formatCop(totalCop)}</span>
        </span>
        <span>
          <span className="text-rotulo block text-muted-foreground">Personas</span>
          <span className="numeral text-2xl font-black text-foreground">{deudores.length}</span>
        </span>
        <span>
          <span className="text-rotulo block text-muted-foreground">Lo más viejo</span>
          <span className={cn("numeral text-2xl font-black", tonoDeAntiguedad(deudores[0]?.diasDeLaMasVieja ?? 0))}>
            {etiquetaDeAntiguedad(deudores[0]?.diasDeLaMasVieja ?? 0)}
          </span>
        </span>
      </div>

      {deudores.length >= tope && (
        <p className="text-xs text-warning-soft">
          Se muestran los primeros {tope} deudores. Buscá por nombre o teléfono para
          encontrar a alguien que no esté en la lista.
        </p>
      )}

      <div className="grid gap-4 doble:grid-cols-[22rem_1fr] doble:items-start">
        <div className="space-y-2 doble:sticky doble:top-20">
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o teléfono"
            aria-label="Buscar en la cartera"
          />

          <ul className="space-y-2">
            {visibles.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => setElegido(d.id)}
                  aria-current={actual?.id === d.id ? "true" : undefined}
                  className={cn(
                    "flex w-full items-baseline justify-between gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors",
                    actual?.id === d.id
                      ? "border-brand bg-brand/10"
                      : "border-border/70 bg-card hover:border-border hover:bg-muted/40",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-foreground">
                      {d.nombre}
                    </span>
                    <span className="font-mono text-rotulo text-muted-foreground">
                      {d.telefono}
                    </span>
                    <span
                      className={cn("block text-rotulo", tonoDeAntiguedad(d.diasDeLaMasVieja))}
                    >
                      {d.cuantos} {d.cuantos === 1 ? "pedido" : "pedidos"} · hace{" "}
                      {etiquetaDeAntiguedad(d.diasDeLaMasVieja)}
                    </span>
                  </span>
                  <span className="numeral shrink-0 text-sm font-bold text-foreground">
                    {formatCop(d.deudaCop)}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {visibles.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nadie con ese nombre ni ese teléfono.
            </p>
          )}
        </div>

        {actual ? (
          <Ficha deudorId={actual.id} puedeCondonar={puedeCondonar} />
        ) : (
          <Card className="shadow-xs">
            <CardContent className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <HandCoins className="size-4" />
              Elegí a alguien de la lista para ver su cuenta.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
