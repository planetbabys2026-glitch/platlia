"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  detenerPromocion,
  eliminarPromocion,
  guardarListaBase,
  guardarPromocion,
} from "@/features/superadmin/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ESTADO_INICIAL } from "@/lib/actions/estado";
import { cotizarTodas, type ListaDePrecios } from "@/lib/billing/precios";
import { formatCop } from "@/lib/money";
import { cn } from "@/lib/utils";

/** La forma serializable que viaja del servidor: las fechas como `yyyy-mm-dd`. */
export type TramoPlano = { desdeSedes: number; precioMensualCop: number };

export type ListaPlana = {
  id: string;
  nombre: string;
  precioSedePrincipalCop: number;
  precioSedeAdicionalCop: number;
  mesesGratisSemestral: number;
  mesesGratisAnual: number;
  tramos: TramoPlano[];
  desde: string | null;
  hasta: string | null;
  activa: boolean;
};

function aLista(l: ListaPlana): ListaDePrecios {
  return {
    ...l,
    desde: l.desde ? new Date(l.desde) : null,
    hasta: l.hasta ? new Date(l.hasta) : null,
  };
}

/**
 * Los seis totales que resultan de una lista.
 *
 * Es la pieza que evita el error caro: quien toca un precio ve, antes de guardar,
 * exactamente lo que va a pagar un cliente. Sin esto hay que multiplicar de
 * cabeza y confiar.
 */
function VistaPrevia({ lista }: { lista: ListaDePrecios }) {
  const filas = useMemo(() => {
    // 1 y 2 siempre, más el piso de cada tramo: son los saltos donde el precio
    // cambia, o sea lo único que hace falta ver para saber si quedó bien.
    const pisos = new Set<number>([1, 2]);
    for (const t of lista.tramos ?? []) {
      if (Number.isInteger(t.desdeSedes) && t.desdeSedes >= 1) pisos.add(t.desdeSedes);
    }
    return [...pisos]
      .sort((a, b) => a - b)
      .map((sedes) => ({ sedes, cotizaciones: cotizarTodas(lista, sedes) }));
  }, [lista]);

  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--linea-16)]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-dashed border-[var(--linea-30)] text-rotulo uppercase text-muted-foreground">
            <th className="p-2 text-left font-mono font-normal">Sedes</th>
            <th className="p-2 text-right font-mono font-normal">1 mes</th>
            <th className="p-2 text-right font-mono font-normal">6 meses</th>
            <th className="p-2 text-right font-mono font-normal">12 meses</th>
          </tr>
        </thead>
        <tbody>
          {filas.map(({ sedes, cotizaciones }) => (
            <tr key={sedes} className="border-t border-dashed border-[var(--linea-16)]">
              <td className="p-2 font-semibold text-foreground">{sedes}</td>
              {cotizaciones.map((c) => (
                <td key={c.periodicidad} className="p-2 text-right">
                  <span className="numeral font-bold text-foreground">
                    {formatCop(c.totalCop)}
                  </span>
                  {c.mesesGratis > 0 && (
                    <span className="block text-rotulo text-success-soft">
                      {c.mesesGratis} de regalo
                    </span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Los escalones por cantidad de sedes.
 *
 * De tres locales para arriba el precio se negocia y no sale de sumar sedes
 * adicionales, así que tiene que poder escribirse entero. Sin ningún tramo rige
 * la fórmula de siempre, que es lo razonable hasta dos.
 */
function CamposDeTramos({
  tramos,
  onCambio,
}: {
  tramos: TramoPlano[];
  onCambio: (tramos: TramoPlano[]) => void;
}) {
  const cambiar = (i: number, parcial: Partial<TramoPlano>) =>
    onCambio(tramos.map((t, j) => (i === j ? { ...t, ...parcial } : t)));

  const siguientePiso = tramos.length
    ? Math.max(...tramos.map((t) => t.desdeSedes)) + 1
    : 3;

  return (
    <div className="space-y-3 rounded-lg border border-dashed border-[var(--linea-30)] p-3">
      <div>
        <span className="text-rotulo uppercase text-muted-foreground">
          Tramos por cantidad de sedes
        </span>
        <p className="text-xs text-muted-foreground">
          Cada tramo fija el mensual completo desde esa cantidad de sedes en
          adelante, y le gana a la fórmula. Sin tramos, el precio sale de la
          primera sede más las adicionales.
        </p>
      </div>

      {tramos.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Sin tramos: {`de 3 sedes se cobra principal + adicional × (n − 1)`}.
        </p>
      ) : (
        <ul className="space-y-2">
          {tramos.map((tramo, i) => (
            <li key={i} className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label className="text-rotulo" htmlFor={`tramo-desde-${i}`}>
                  Desde (sedes)
                </Label>
                <Input
                  id={`tramo-desde-${i}`}
                  type="number"
                  min={1}
                  max={999}
                  className="w-28"
                  value={tramo.desdeSedes}
                  onChange={(e) => cambiar(i, { desdeSedes: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-rotulo" htmlFor={`tramo-precio-${i}`}>
                  Mensual, todo incluido
                </Label>
                <Input
                  id={`tramo-precio-${i}`}
                  type="number"
                  min={0}
                  className="w-40"
                  value={tramo.precioMensualCop}
                  onChange={(e) => cambiar(i, { precioMensualCop: Number(e.target.value) })}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onCambio(tramos.filter((_, j) => j !== i))}
              >
                Quitar
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() =>
          onCambio([...tramos, { desdeSedes: siguientePiso, precioMensualCop: 0 }])
        }
      >
        Agregar tramo
      </Button>

      {/* Viaja serializado: un `<form>` no tiene forma natural de mandar una
          lista de largo variable. */}
      <input type="hidden" name="tramos" value={JSON.stringify(tramos)} />
    </div>
  );
}

function Guardar({ children }: { children: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Guardando…" : children}
    </Button>
  );
}

function CamposDePrecio({
  valores,
  onCambio,
}: {
  valores: ListaPlana;
  onCambio: (parcial: Partial<ListaPlana>) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="precioSedePrincipalCop">Primera sede, al mes</Label>
        <Input
          id="precioSedePrincipalCop"
          name="precioSedePrincipalCop"
          type="number"
          min={0}
          value={valores.precioSedePrincipalCop}
          onChange={(e) => onCambio({ precioSedePrincipalCop: Number(e.target.value) })}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="precioSedeAdicionalCop">Cada sede adicional, al mes</Label>
        <Input
          id="precioSedeAdicionalCop"
          name="precioSedeAdicionalCop"
          type="number"
          min={0}
          value={valores.precioSedeAdicionalCop}
          onChange={(e) => onCambio({ precioSedeAdicionalCop: Number(e.target.value) })}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="mesesGratisSemestral">Meses de regalo al comprar 6</Label>
        <Input
          id="mesesGratisSemestral"
          name="mesesGratisSemestral"
          type="number"
          min={0}
          max={5}
          value={valores.mesesGratisSemestral}
          onChange={(e) => onCambio({ mesesGratisSemestral: Number(e.target.value) })}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="mesesGratisAnual">Meses de regalo al comprar 12</Label>
        <Input
          id="mesesGratisAnual"
          name="mesesGratisAnual"
          type="number"
          min={0}
          max={11}
          value={valores.mesesGratisAnual}
          onChange={(e) => onCambio({ mesesGratisAnual: Number(e.target.value) })}
        />
      </div>
    </div>
  );
}

function FormularioBase({ base }: { base: ListaPlana }) {
  const [estado, accion] = useActionState(guardarListaBase, ESTADO_INICIAL);
  const [valores, setValores] = useState(base);
  const cambiar = (p: Partial<ListaPlana>) => setValores((v) => ({ ...v, ...p }));

  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        <div>
          <h2 className="font-display text-xl font-black uppercase tracking-tight text-foreground">
            Lista base
          </h2>
          <p className="text-xs text-muted-foreground">
            El precio de siempre. Rige cuando no hay ninguna promoción vigente.
          </p>
        </div>

        <form action={accion} className="space-y-4">
          {!estado.ok && estado.error && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{estado.error}</AlertDescription>
            </Alert>
          )}
          {estado.ok && estado.data !== undefined && (
            <Alert>
              <AlertDescription>Precios guardados.</AlertDescription>
            </Alert>
          )}

          <CamposDePrecio valores={valores} onCambio={cambiar} />
          <CamposDeTramos
            tramos={valores.tramos}
            onCambio={(tramos) => cambiar({ tramos })}
          />
          <VistaPrevia lista={aLista(valores)} />

          <div className="space-y-1.5">
            <Label htmlFor="motivo-base">Motivo (queda en la bitácora)</Label>
            <Input
              id="motivo-base"
              name="motivo"
              required
              minLength={3}
              placeholder="Ej. Ajuste anual de tarifa"
            />
          </div>

          <Guardar>Guardar lista base</Guardar>
        </form>
      </CardContent>
    </Card>
  );
}

/**
 * En qué momento de su vida está una promoción.
 *
 * Se calcula acá y se dice en la tarjeta porque "apagada" y "todavía no empezó"
 * se ven idénticas mirando dos campos de fecha y una casilla al fondo del
 * formulario, que es exactamente como se pierde de vista una promo corriendo.
 */
function estadoDePromo(
  promo: ListaPlana,
  esVigente: boolean,
): { texto: string; clase: string } {
  if (!promo.activa) {
    return { texto: "Apagada", clase: "bg-[var(--panel-3)] text-muted-foreground" };
  }
  if (esVigente) return { texto: "Rige ahora", clase: "bg-brand/15 text-brand" };

  const hoy = new Date().toISOString().slice(0, 10);
  if (promo.hasta && promo.hasta <= hoy) {
    return { texto: "Terminada", clase: "bg-[var(--panel-3)] text-muted-foreground" };
  }
  if (promo.desde && promo.desde > hoy) {
    return { texto: "Programada", clase: "bg-warning/15 text-warning-soft" };
  }
  return { texto: "Encendida", clase: "bg-success/15 text-success-soft" };
}

/**
 * Detener o borrar una promoción, fuera del formulario de precios.
 *
 * Va aparte a propósito: cortar una promo es urgente y no puede exigir revisar
 * precios, tramos y fechas para llegar a una casilla. Y `<form>` no anida, así
 * que tampoco podría vivir adentro del otro.
 */
function AccionesDePromo({ promo, esVigente }: { promo: ListaPlana; esVigente: boolean }) {
  const [abierto, setAbierto] = useState<"detener" | "eliminar" | null>(null);
  const [estadoDetener, accionDetener] = useActionState(detenerPromocion, ESTADO_INICIAL);
  const [estadoEliminar, accionEliminar] = useActionState(eliminarPromocion, ESTADO_INICIAL);

  const yaEmpezo = !promo.desde || promo.desde <= new Date().toISOString().slice(0, 10);
  const estado = abierto === "detener" ? estadoDetener : estadoEliminar;
  // Aplicada la acción, el panel de confirmación no tiene nada más que hacer ahí:
  // dejarlo abierto invita a confirmar dos veces algo que ya pasó.
  const pendiente = abierto !== null && !estado.ok;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {promo.activa && (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => setAbierto(abierto === "detener" ? null : "detener")}
          >
            {esVigente ? "Detener ahora" : "Apagar"}
          </Button>
        )}
        {!yaEmpezo && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setAbierto(abierto === "eliminar" ? null : "eliminar")}
          >
            Eliminar
          </Button>
        )}
      </div>

      {pendiente && (
        <form
          action={abierto === "detener" ? accionDetener : accionEliminar}
          className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3"
        >
          <input type="hidden" name="id" value={promo.id} />

          {!estado.ok && estado.error && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{estado.error}</AlertDescription>
            </Alert>
          )}

          <p className="text-xs text-muted-foreground">
            {abierto === "detener"
              ? esVigente
                ? "Se corta ya. Los clientes vuelven al precio de lista en la próxima carga de pantalla."
                : "Queda apagada: no va a regir aunque llegue su fecha."
              : "Se borra del todo. Solo se puede con una promoción que todavía no empezó."}
          </p>

          <div className="space-y-1.5">
            <Label htmlFor={`motivo-detener-${promo.id}`}>Motivo (queda en la bitácora)</Label>
            <Input
              id={`motivo-detener-${promo.id}`}
              name="motivo"
              required
              minLength={3}
              placeholder={
                abierto === "detener" ? "Ej. Se agotó el cupo de la campaña" : "Ej. Creada por error"
              }
            />
          </div>

          <div className="flex gap-2">
            <Guardar>{abierto === "detener" ? "Confirmar y detener" : "Confirmar y eliminar"}</Guardar>
            <Button type="button" variant="outline" size="sm" onClick={() => setAbierto(null)}>
              Cancelar
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function FormularioPromo({ promo, esVigente }: { promo: ListaPlana; esVigente: boolean }) {
  const [estado, accion] = useActionState(guardarPromocion, ESTADO_INICIAL);
  const [valores, setValores] = useState(promo);
  const cambiar = (p: Partial<ListaPlana>) => setValores((v) => ({ ...v, ...p }));
  const esNueva = promo.id === "";
  const insignia = estadoDePromo(promo, esVigente);

  return (
    <Card className={cn(esVigente && "border-brand")}>
      <CardContent className="space-y-4 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-xl font-black uppercase tracking-tight text-foreground">
            {esNueva ? "Nueva promoción" : promo.nombre}
          </h2>
          {!esNueva && (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-rotulo font-bold uppercase",
                insignia.clase,
              )}
            >
              {insignia.texto}
            </span>
          )}
        </div>

        {!esNueva && <AccionesDePromo promo={promo} esVigente={esVigente} />}

        <form action={accion} className="space-y-4">
          <input type="hidden" name="id" value={promo.id} />

          {!estado.ok && estado.error && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{estado.error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-1.5">
            <Label htmlFor={`nombre-${promo.id}`}>Nombre</Label>
            <Input
              id={`nombre-${promo.id}`}
              name="nombre"
              required
              value={valores.nombre}
              onChange={(e) => cambiar({ nombre: e.target.value })}
              placeholder="Ej. Promo apertura"
            />
          </div>

          <CamposDePrecio valores={valores} onCambio={cambiar} />
          <CamposDeTramos
            tramos={valores.tramos}
            onCambio={(tramos) => cambiar({ tramos })}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`desde-${promo.id}`}>Empieza</Label>
              <Input
                id={`desde-${promo.id}`}
                name="desde"
                type="date"
                value={valores.desde ?? ""}
                onChange={(e) => cambiar({ desde: e.target.value || null })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`hasta-${promo.id}`}>Termina</Label>
              <Input
                id={`hasta-${promo.id}`}
                name="hasta"
                type="date"
                value={valores.hasta ?? ""}
                onChange={(e) => cambiar({ hasta: e.target.value || null })}
              />
              <p className="text-rotulo text-muted-foreground">
                Vacío = sin fecha de fin.
              </p>
            </div>
          </div>

          <VistaPrevia lista={aLista(valores)} />

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="activa"
              checked={valores.activa}
              onChange={(e) => cambiar({ activa: e.target.checked })}
              className="accent-brand mt-0.5 size-4"
            />
            <span>
              Encendida
              <span className="block text-rotulo text-muted-foreground">
                Apagada no rige aunque esté dentro de sus fechas. Para cortar una que
                ya está corriendo usá &ldquo;Detener ahora&rdquo;, arriba.
              </span>
            </span>
          </label>

          <div className="space-y-1.5">
            <Label htmlFor={`motivo-${promo.id}`}>Motivo (queda en la bitácora)</Label>
            <Input
              id={`motivo-${promo.id}`}
              name="motivo"
              required
              minLength={3}
              placeholder="Ej. Campaña de temporada"
            />
          </div>

          <Guardar>{esNueva ? "Crear promoción" : "Guardar promoción"}</Guardar>
        </form>
      </CardContent>
    </Card>
  );
}

const PROMO_VACIA: ListaPlana = {
  id: "",
  nombre: "",
  precioSedePrincipalCop: 40000,
  precioSedeAdicionalCop: 25000,
  mesesGratisSemestral: 1,
  mesesGratisAnual: 2,
  tramos: [],
  desde: null,
  hasta: null,
  activa: true,
};

export function VistaPrecios({
  listas,
  idVigente,
}: {
  listas: ListaPlana[];
  idVigente: string;
}) {
  const [creando, setCreando] = useState(false);

  const base = listas.find((l) => l.desde === null && l.hasta === null);
  const promos = listas.filter((l) => l.desde !== null || l.hasta !== null);

  return (
    <div className="space-y-6">
      {base ? (
        <FormularioBase base={base} />
      ) : (
        <Alert variant="destructive">
          <AlertDescription>
            No hay lista base. Corré la migración de precios: sin ella el cobro usa
            los valores de fábrica.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-xl font-black uppercase tracking-tight text-foreground">
          Promociones
        </h2>
        {!creando && (
          <Button type="button" variant="outline" onClick={() => setCreando(true)}>
            Nueva promoción
          </Button>
        )}
      </div>

      {creando && <FormularioPromo promo={PROMO_VACIA} esVigente={false} />}

      {promos.length === 0 && !creando && (
        <p className="rounded-lg border border-dashed border-[var(--linea-30)] p-6 text-center text-sm text-muted-foreground">
          No hay ninguna promoción. Mientras tanto rige la lista base.
        </p>
      )}

      {promos.map((p) => (
        <FormularioPromo key={p.id} promo={p} esVigente={p.id === idVigente} />
      ))}
    </div>
  );
}
