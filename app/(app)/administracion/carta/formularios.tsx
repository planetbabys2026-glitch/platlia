"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  archivarCategoria,
  archivarProducto,
  cambiarDisponibilidad,
  guardarCategoria,
  guardarPresentacion,
  guardarProducto,
} from "@/features/carta/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ESTADO_INICIAL } from "@/lib/actions/estado";
import { formatCop } from "@/lib/money";

export type Tarifa = { id: string; name: string; rateBp: number; isDefault: boolean };

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

function Error({ estado }: { estado: { ok: boolean; error?: string } }) {
  if (estado.ok || !estado.error) return null;
  return (
    <Alert variant="destructive" role="alert">
      <AlertDescription>{estado.error}</AlertDescription>
    </Alert>
  );
}

export function NuevaCategoria() {
  const [estado, accion] = useActionState(guardarCategoria, ESTADO_INICIAL);

  return (
    <form action={accion} className="space-y-3">
      <Error estado={estado} />
      <div className="flex gap-2">
        <Input name="name" placeholder="Nombre de la categoría" required aria-label="Nombre de la categoría" />
        <Input
          name="sortOrder"
          type="number"
          min={0}
          defaultValue={0}
          className="w-20"
          aria-label="Orden"
        />
        <Enviar>Agregar</Enviar>
      </div>
    </form>
  );
}

export function ArchivarCategoria({ id, name }: { id: string; name: string }) {
  const [estado, accion] = useActionState(archivarCategoria, ESTADO_INICIAL);

  return (
    <form action={accion} className="inline">
      <input type="hidden" name="id" value={id} />
      <Enviar variant="ghost" size="sm" className="h-7 text-xs">
        Archivar
      </Enviar>
      {!estado.ok && estado.error && (
        <p className="text-destructive mt-1 text-xs">{estado.error}</p>
      )}
      <span className="sr-only">{name}</span>
    </form>
  );
}

export function NuevoProducto({
  categoryId,
  tarifas,
}: {
  categoryId: string;
  tarifas: Tarifa[];
}) {
  const [estado, accion] = useActionState(guardarProducto, ESTADO_INICIAL);
  const campos = !estado.ok ? estado.campos : undefined;

  return (
    <form action={accion} className="border-border space-y-3 rounded-lg border border-dashed p-3">
      <Error estado={estado} />
      <input type="hidden" name="categoryId" value={categoryId} />

      <div className="grid gap-2 sm:grid-cols-[1fr_8rem]">
        <div className="space-y-1">
          <Label htmlFor={`nombre-${categoryId}`} className="text-xs">
            Producto
          </Label>
          <Input id={`nombre-${categoryId}`} name="name" required placeholder="Cerveza nacional" />
          {campos?.name && <p className="text-destructive text-xs">{campos.name[0]}</p>}
        </div>
        <div className="space-y-1">
          <Label htmlFor={`precio-${categoryId}`} className="text-xs">
            Precio
          </Label>
          <Input
            id={`precio-${categoryId}`}
            name="priceCop"
            inputMode="numeric"
            required
            placeholder="5.000"
          />
          {campos?.priceCop && <p className="text-destructive text-xs">{campos.priceCop[0]}</p>}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`tarifa-${categoryId}`} className="text-xs">
            Impuesto
          </Label>
          <select
            id={`tarifa-${categoryId}`}
            name="taxRateId"
            className="border-input bg-card focus-visible:ring-ring h-9 w-full rounded-lg border px-3 text-sm focus-visible:ring-3 focus-visible:outline-none"
          >
            {tarifas.map((tarifa) => (
              <option key={tarifa.id} value={tarifa.id}>
                {tarifa.name} ({tarifa.rateBp / 100}%)
                {tarifa.isDefault ? " · por defecto" : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`estacion-${categoryId}`} className="text-xs">
            Estación
          </Label>
          <Input
            id={`estacion-${categoryId}`}
            name="kitchenStation"
            placeholder="Cocina, Barra…"
          />
        </div>
      </div>

      <Enviar size="sm">Agregar producto</Enviar>
    </form>
  );
}

export function AccionesProducto({
  productId,
  isAvailable,
}: {
  productId: string;
  isAvailable: boolean;
}) {
  const [, cambiar] = useActionState(cambiarDisponibilidad, ESTADO_INICIAL);
  const [estadoArchivo, archivar] = useActionState(archivarProducto, ESTADO_INICIAL);

  return (
    <span className="flex items-center gap-1">
      <form action={cambiar} className="inline">
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="isAvailable" value={String(!isAvailable)} />
        <Enviar variant="ghost" size="sm" className="h-7 text-xs">
          {isAvailable ? "Marcar agotado" : "Hay de nuevo"}
        </Enviar>
      </form>
      <form action={archivar} className="inline">
        <input type="hidden" name="id" value={productId} />
        <Enviar variant="ghost" size="sm" className="h-7 text-xs">
          Archivar
        </Enviar>
      </form>
      {!estadoArchivo.ok && estadoArchivo.error && (
        <span className="text-destructive text-xs">{estadoArchivo.error}</span>
      )}
    </span>
  );
}

export function NuevaPresentacion({ productId }: { productId: string }) {
  const [estado, accion] = useActionState(guardarPresentacion, ESTADO_INICIAL);

  return (
    <form action={accion} className="flex flex-wrap items-center gap-1">
      <input type="hidden" name="productId" value={productId} />
      <Input
        name="name"
        placeholder="Presentación"
        aria-label="Nombre de la presentación"
        required
        className="h-7 w-32 text-xs"
      />
      <Input
        name="priceCop"
        inputMode="numeric"
        placeholder="Precio"
        aria-label="Precio de la presentación"
        required
        className="h-7 w-24 text-xs"
      />
      <Enviar variant="outline" size="sm" className="h-7 text-xs">
        Agregar
      </Enviar>
      {!estado.ok && estado.error && (
        <span className="text-destructive text-xs">{estado.error}</span>
      )}
    </form>
  );
}

export function Precio({ valor }: { valor: number }) {
  return <span className="numeral">{formatCop(valor)}</span>;
}
