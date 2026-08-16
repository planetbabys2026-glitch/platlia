"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  archivarArea,
  archivarMesa,
  cambiarEstadoMesa,
  crearMesasEnLote,
  guardarArea,
  guardarMesa,
} from "@/features/salon/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ESTADO_INICIAL } from "@/lib/actions/estado";

export type AreaSimple = { id: string; name: string };

function Enviar({
  children,
  variant,
  size,
  className,
}: {
  children: React.ReactNode;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size={size} className={className} disabled={pending}>
      {pending ? "…" : children}
    </Button>
  );
}

function Aviso({ estado }: { estado: { ok: boolean; error?: string } }) {
  if (estado.ok || !estado.error) return null;
  return (
    <Alert variant="destructive" role="alert">
      <AlertDescription>{estado.error}</AlertDescription>
    </Alert>
  );
}

function SelectArea({ areas, id }: { areas: AreaSimple[]; id: string }) {
  return (
    <select
      id={id}
      name="areaId"
      className="h-11 tableta:h-10 w-full rounded-lg border border-[var(--linea-16)] bg-[var(--input-bg)] px-3 text-sm focus-visible:border-[var(--papel-60)] focus-visible:bg-[var(--input-bg-focus)] focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:outline-none"
    >
      <option value="">Sin área</option>
      {areas.map((area) => (
        <option key={area.id} value={area.id}>
          {area.name}
        </option>
      ))}
    </select>
  );
}

export function NuevaArea() {
  const [estado, accion] = useActionState(guardarArea, ESTADO_INICIAL);

  return (
    <form action={accion} className="space-y-3">
      <Aviso estado={estado} />
      <div className="flex gap-2">
        <Input name="name" placeholder="Salón, Terraza, Barra…" required aria-label="Nombre del área" />
        <Enviar>Agregar área</Enviar>
      </div>
    </form>
  );
}

export function ArchivarArea({ id }: { id: string }) {
  const [, accion] = useActionState(archivarArea, ESTADO_INICIAL);
  return (
    <form action={accion} className="inline">
      <input type="hidden" name="id" value={id} />
      <Enviar variant="ghost" size="sm" className="h-7 text-xs">
        Quitar área
      </Enviar>
    </form>
  );
}

export function MesasEnLote({ areas }: { areas: AreaSimple[] }) {
  const [estado, accion] = useActionState(crearMesasEnLote, ESTADO_INICIAL);

  return (
    <form action={accion} className="space-y-3">
      <Aviso estado={estado} />

      {estado.ok && estado.data && (
        <Alert role="status">
          <AlertDescription>
            Se crearon {estado.data.creadas} mesas
            {estado.data.salteadas > 0 && ` (${estado.data.salteadas} ya existían)`}.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-2 sm:grid-cols-4">
        <div className="space-y-1">
          <Label htmlFor="lote-area" className="text-xs">
            Área
          </Label>
          <SelectArea areas={areas} id="lote-area" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="lote-prefijo" className="text-xs">
            Prefijo
          </Label>
          <Input id="lote-prefijo" name="prefijo" placeholder="T, Barra…" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="lote-desde" className="text-xs">
            Desde
          </Label>
          <Input id="lote-desde" name="desde" type="number" min={1} defaultValue={1} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="lote-hasta" className="text-xs">
            Hasta
          </Label>
          <Input id="lote-hasta" name="hasta" type="number" min={1} defaultValue={12} required />
        </div>
      </div>

      <p className="text-muted-foreground text-xs">
        El nombre de la mesa es único en todo el negocio. Si la terraza también numera desde 1,
        usá un prefijo (T1, T2…) para que no choque con el salón.
      </p>

      <Enviar>Crear mesas</Enviar>
    </form>
  );
}

export function NuevaMesa({ areas }: { areas: AreaSimple[] }) {
  const [estado, accion] = useActionState(guardarMesa, ESTADO_INICIAL);

  return (
    <form action={accion} className="space-y-3">
      <Aviso estado={estado} />
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_6rem_auto]">
        <Input name="name" placeholder="Nombre" required aria-label="Nombre de la mesa" />
        <SelectArea areas={areas} id="mesa-area" />
        <Input
          name="capacity"
          type="number"
          min={1}
          defaultValue={4}
          aria-label="Capacidad"
        />
        <Enviar>Agregar</Enviar>
      </div>
    </form>
  );
}

export function AccionesMesa({ id, status }: { id: string; status: string }) {
  const [estadoCambio, cambiar] = useActionState(cambiarEstadoMesa, ESTADO_INICIAL);
  const [estadoArchivo, archivar] = useActionState(archivarMesa, ESTADO_INICIAL);
  const ocupada = status === "OCUPADA" || status === "CUENTA_PEDIDA";

  return (
    <span className="flex flex-wrap items-center gap-1">
      {!ocupada && (
        <form action={cambiar} className="inline">
          <input type="hidden" name="id" value={id} />
          <input
            type="hidden"
            name="status"
            value={status === "INACTIVA" ? "LIBRE" : "INACTIVA"}
          />
          <Enviar variant="ghost" size="sm" className="h-7 text-xs">
            {status === "INACTIVA" ? "Habilitar" : "Fuera de servicio"}
          </Enviar>
        </form>
      )}
      <form action={archivar} className="inline">
        <input type="hidden" name="id" value={id} />
        <Enviar variant="ghost" size="sm" className="h-7 text-xs">
          Archivar
        </Enviar>
      </form>
      {[estadoCambio, estadoArchivo].map(
        (e, i) =>
          !e.ok &&
          e.error && (
            <span key={i} className="text-destructive text-xs">
              {e.error}
            </span>
          ),
      )}
    </span>
  );
}
