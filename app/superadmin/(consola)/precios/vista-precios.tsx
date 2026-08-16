"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { guardarListaBase, guardarPromocion } from "@/features/superadmin/actions";
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
export type ListaPlana = {
  id: string;
  nombre: string;
  precioSedePrincipalCop: number;
  precioSedeAdicionalCop: number;
  mesesGratisSemestral: number;
  mesesGratisAnual: number;
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
  const filas = useMemo(
    () => [1, 2].map((sedes) => ({ sedes, cotizaciones: cotizarTodas(lista, sedes) })),
    [lista],
  );

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

function FormularioPromo({ promo, esVigente }: { promo: ListaPlana; esVigente: boolean }) {
  const [estado, accion] = useActionState(guardarPromocion, ESTADO_INICIAL);
  const [valores, setValores] = useState(promo);
  const cambiar = (p: Partial<ListaPlana>) => setValores((v) => ({ ...v, ...p }));
  const esNueva = promo.id === "";

  return (
    <Card className={cn(esVigente && "border-brand")}>
      <CardContent className="space-y-4 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-xl font-black uppercase tracking-tight text-foreground">
            {esNueva ? "Nueva promoción" : promo.nombre}
          </h2>
          {esVigente && (
            <span className="rounded-full bg-brand/15 px-2 py-0.5 text-rotulo font-bold uppercase text-brand">
              Rige ahora
            </span>
          )}
        </div>

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

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="activa"
              checked={valores.activa}
              onChange={(e) => cambiar({ activa: e.target.checked })}
              className="accent-brand size-4"
            />
            <span>Encendida</span>
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
