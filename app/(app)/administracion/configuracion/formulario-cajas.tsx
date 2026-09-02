"use client";

import { useActionState, useState, useId } from "react";
import { useFormStatus } from "react-dom";
import { KeyRound, Plus, Trash2 } from "lucide-react";
import {
  archivarCaja,
  guardarCaja,
  guardarClaveGastos,
  quitarClaveGastos,
} from "@/features/caja/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { guardarClaveAnulacion, quitarClaveAnulacion } from "@/features/pedidos/actions";
import { ESTADO_INICIAL } from "@/lib/actions/estado";

/**
 * Las cajas físicas del negocio y la clave que protege las salidas de dinero.
 *
 * Las dos cosas viven en la misma sección porque son la misma pregunta: dónde
 * entra la plata y quién autoriza que salga. Y las dos son del propietario, no
 * del administrador: crear un punto de cobro y poder sacar efectivo son las dos
 * decisiones que un dueño no delega.
 */

export type CajaConfig = {
  id: string;
  name: string;
  active: boolean;
  sortOrder: number;
  /** Cuántos turnos pasaron por ella. */
  turnos: number;
  abierta: { code: number; openedBy: { name: string } } | null;
};

function Enviar({ children, ...props }: React.ComponentProps<typeof Button>) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} {...props}>
      {pending ? "Un momento…" : children}
    </Button>
  );
}

function ErrorDeAccion({ estado }: { estado: { ok: boolean; error?: string } }) {
  if (estado.ok || !estado.error) return null;
  return (
    <Alert variant="destructive" role="alert">
      <AlertDescription>{estado.error}</AlertDescription>
    </Alert>
  );
}

function FilaDeCaja({ caja }: { caja: CajaConfig }) {
  const [estado, accion] = useActionState(guardarCaja, ESTADO_INICIAL);
  const [archivado, archivar] = useActionState(archivarCaja, ESTADO_INICIAL);

  return (
    <li className="space-y-2 rounded-xl border border-border/80 bg-card p-3">
      <ErrorDeAccion estado={estado} />
      <ErrorDeAccion estado={archivado} />

      <form action={accion} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="id" value={caja.id} />
        <div className="min-w-40 flex-1 space-y-1.5">
          <Label htmlFor={`nombre-${caja.id}`}>Nombre</Label>
          <Input id={`nombre-${caja.id}`} name="name" defaultValue={caja.name} required />
        </div>
        <div className="w-20 space-y-1.5">
          <Label htmlFor={`orden-${caja.id}`}>Orden</Label>
          <Input
            id={`orden-${caja.id}`}
            name="sortOrder"
            inputMode="numeric"
            defaultValue={caja.sortOrder}
            className="numeral"
          />
        </div>
        <label className="flex h-11 items-center gap-2 text-sm tableta:h-10">
          <input type="checkbox" name="active" defaultChecked={caja.active} className="size-4" />
          Activa
        </label>
        <Enviar variant="secondary">Guardar</Enviar>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {caja.abierta ? (
            <span className="chip is-live">
              TURNO {caja.abierta.code} · {caja.abierta.openedBy.name}
            </span>
          ) : (
            <>
              {caja.turnos} {caja.turnos === 1 ? "turno registrado" : "turnos registrados"}
            </>
          )}
        </span>
        {/* Archivar y no borrar: los turnos cerrados son el historial del arqueo
            y tienen que seguir diciendo en qué caja pasaron. */}
        <form action={archivar}>
          <input type="hidden" name="id" value={caja.id} />
          <Enviar variant="ghost" className="text-destructive-soft">
            <Trash2 className="size-4" />
            Archivar
          </Enviar>
        </form>
      </div>
    </li>
  );
}

function NuevaCaja() {
  const [estado, accion] = useActionState(guardarCaja, ESTADO_INICIAL);

  return (
    <form action={accion} className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-border p-3">
      <div className="min-w-40 flex-1 space-y-1.5">
        <Label htmlFor="caja-nueva">Nombre de la caja</Label>
        <Input id="caja-nueva" name="name" placeholder="Barra, Mostrador, Caja 2" required />
      </div>
      <Enviar>
        <Plus className="size-4" />
        Agregar caja
      </Enviar>
      <div className="w-full">
        <ErrorDeAccion estado={estado} />
      </div>
    </form>
  );
}

/**
 * Una clave de seguridad del negocio: la de salidas de dinero y la de anulación.
 *
 * Un solo componente para las dos porque son el mismo trámite —poner, cambiar,
 * quitar, siempre conociendo la vigente— y porque copiarlo garantizaba que a la
 * segunda se le olvidara alguna de las tres cosas que lo hacen seguro: exigir la
 * actual para cambiarla, exigirla otra vez para quitarla, y decir en pantalla qué
 * queda desprotegido mientras no haya ninguna.
 */
function ClaveDeSeguridad({
  puesta,
  titulo,
  descripcion,
  sinClave,
  alQuitar,
  guardar,
  quitarAccion,
}: {
  puesta: boolean;
  titulo: string;
  descripcion: string;
  /** Qué queda desprotegido mientras no haya clave. */
  sinClave: string;
  /** Lo mismo, en el momento de quitarla. */
  alQuitar: string;
  /* Las dos parejas de acciones tienen la misma forma —poner/cambiar toma clave
     actual, nueva y repetida; quitar toma solo la actual—, así que alcanza con
     tipar contra una de ellas. Si alguna se separara, el tipo lo diría acá. */
  guardar: typeof guardarClaveGastos;
  quitarAccion: typeof quitarClaveGastos;
}) {
  const [estado, accion] = useActionState(guardar, ESTADO_INICIAL);
  const [quitado, quitar] = useActionState(quitarAccion, ESTADO_INICIAL);
  const [quitando, setQuitando] = useState(false);
  const id = useId();

  return (
    <div className="space-y-3 rounded-xl border border-border/80 bg-card p-4">
      <div className="flex items-start gap-3">
        <KeyRound className="mt-0.5 size-5 shrink-0 text-brand" />
        <div className="space-y-1">
          <h3 className="rotulo-seccion">{titulo}</h3>
          <p className="text-sm text-muted-foreground text-pretty">{descripcion}</p>
        </div>
      </div>

      {!puesta && (
        <Alert className="border-warning/40 bg-warning/10">
          <AlertDescription className="text-warning-soft">{sinClave}</AlertDescription>
        </Alert>
      )}

      {estado.ok && "data" in estado && (
        <Alert role="status">
          <AlertDescription>Clave guardada.</AlertDescription>
        </Alert>
      )}

      <form action={accion} className="space-y-3">
        <ErrorDeAccion estado={estado} />

        {/* Solo cuando ya hay una: cambiarla sin conocer la vigente convertiría un
            descuido —una sesión abierta en un celular— en la llave del negocio. */}
        {puesta && (
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-actual`}>Clave actual</Label>
            <Input
              id={`${id}-actual`}
              name="claveActual"
              type="password"
              autoComplete="off"
              required
            />
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-nueva`}>{puesta ? "Clave nueva" : "Clave"}</Label>
            <Input
              id={`${id}-nueva`}
              name="clave"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-repetida`}>Repetila</Label>
            <Input
              id={`${id}-repetida`}
              name="claveRepetida"
              type="password"
              autoComplete="new-password"
              required
            />
          </div>
        </div>

        <Enviar>{puesta ? "Cambiar la clave" : "Poner la clave"}</Enviar>
      </form>

      {puesta && (
        <div className="border-t border-dashed border-border pt-3">
          {quitando ? (
            <form action={quitar} className="space-y-2">
              <ErrorDeAccion estado={quitado} />
              <Label htmlFor={`${id}-quitar`}>Escribí la clave actual para quitarla</Label>
              <div className="flex flex-wrap gap-2">
                <Input
                  id={`${id}-quitar`}
                  name="claveActual"
                  type="password"
                  autoComplete="off"
                  required
                  className="min-w-40 flex-1"
                />
                <Enviar variant="ghost" className="text-destructive-soft">
                  Quitar la clave
                </Enviar>
                <Button type="button" variant="ghost" onClick={() => setQuitando(false)}>
                  Cancelar
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{alQuitar}</p>
            </form>
          ) : (
            <Button
              type="button"
              variant="ghost"
              className="text-muted-foreground"
              onClick={() => setQuitando(true)}
            >
              Quitar la clave
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export function FormularioCajas({
  cajas,
  claveSalidasPuesta,
  claveAnulacionPuesta,
}: {
  cajas: CajaConfig[];
  claveSalidasPuesta: boolean;
  claveAnulacionPuesta: boolean;
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="space-y-1">
          <h3 className="rotulo-seccion">Cajas del local</h3>
          <p className="text-sm text-muted-foreground text-pretty">
            Una por cada punto de cobro físico. Cada cajero abre su turno en la suya,
            con su base, y ahí cae lo que cobre: dos personas compartiendo un turno es
            un arqueo que no cuadra nunca.
          </p>
        </div>

        <ul className="space-y-2">
          {cajas.map((caja) => (
            <FilaDeCaja key={caja.id} caja={caja} />
          ))}
        </ul>

        <NuevaCaja />
      </div>

      <ClaveDeSeguridad
        puesta={claveSalidasPuesta}
        titulo="Clave de salidas de dinero"
        descripcion="Se pide para registrar un gasto, un retiro o un ajuste negativo. La ponés y la cambiás solo vos: es la puerta por la que sale la plata del negocio."
        sinClave="Todavía no hay clave. Cualquiera con acceso a la caja puede registrar una salida de dinero."
        alQuitar="Sin clave, las salidas de dinero se registran sin autorización."
        guardar={guardarClaveGastos}
        quitarAccion={quitarClaveGastos}
      />

      <ClaveDeSeguridad
        puesta={claveAnulacionPuesta}
        titulo="Clave de anulación"
        descripcion="Se pide para anular un pedido o un renglón que ya tiene consumo. Sin ella cualquiera del equipo puede anular; con ella, anular sigue siendo posible pero deja de ser un descuido. En los dos casos queda el motivo y quién lo hizo."
        sinClave="Todavía no hay clave. Cualquiera que tome pedidos puede anular una cuenta con consumo; queda el motivo y queda registrado, pero nadie tiene que autorizarlo."
        alQuitar="Sin clave, anular una cuenta con consumo no pide autorización."
        guardar={guardarClaveAnulacion}
        quitarAccion={quitarClaveAnulacion}
      />
    </div>
  );
}
