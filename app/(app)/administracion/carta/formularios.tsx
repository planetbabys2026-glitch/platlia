"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  archivarCategoria,
  archivarProducto,
  cambiarDisponibilidad,
  guardarCategoria,
  guardarProducto,
} from "@/features/carta/actions";
import { SubirImagen } from "@/features/carta/components/subir-imagen";
import { ImagenProducto } from "@/features/pedidos/components/imagen-producto";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ESTADO_INICIAL } from "@/lib/actions/estado";
import { formatCop, formatRateBp } from "@/lib/money";

export type Tarifa = { id: string; name: string; rateBp: number; isDefault: boolean };

export type ProductoAdmin = {
  id: string;
  name: string;
  description: string | null;
  sku: string | null;
  imageUrl: string | null;
  priceCop: number;
  active: boolean;
  isAvailable: boolean;
  kitchenStation: string | null;
  preparationMinutes: number | null;
  taxRateId: string;
  taxRate: { name: string; rateBp: number };
};

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

/**
 * Crea una categoría. Empieza colapsada en un enlace "+ Nueva categoría" —no
 * hace falta plantarle un formulario completo a alguien que solo quiere ver su
 * carta— salvo que `destacada` la abra de entrada: así se usa en el estado
 * vacío, donde crear la primera categoría es lo único que hay para hacer.
 */
export function NuevaCategoria({ destacada = false }: { destacada?: boolean }) {
  const [estado, accion] = useActionState(guardarCategoria, ESTADO_INICIAL);
  const [abierta, setAbierta] = useState(destacada);

  // Se colapsa sola después de crear, salvo que sea la destacada del estado
  // vacío: ahí no hay a qué volver.
  useEffect(() => {
    if (estado.ok && !destacada) setAbierta(false);
  }, [estado, destacada]);

  if (!abierta) {
    return (
      <button
        type="button"
        onClick={() => setAbierta(true)}
        className="text-primary text-sm font-medium hover:underline"
      >
        + Nueva categoría
      </button>
    );
  }

  return (
    <form action={accion} className={destacada ? "mx-auto max-w-sm space-y-3" : "space-y-2"}>
      <Error estado={estado} />
      <div className="flex gap-2">
        <Input
          name="name"
          placeholder="Cervezas, Picadas…"
          required
          aria-label="Nombre de la categoría"
          autoFocus
        />
        <Enviar size={destacada ? "default" : "sm"}>Crear</Enviar>
        {!destacada && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setAbierta(false)}>
            Cancelar
          </Button>
        )}
      </div>
      <input type="hidden" name="sortOrder" value={0} />
    </form>
  );
}

/** Renombrar corrige un error de tipeo; no es un campo que se edite seguido. */
export function RenombrarCategoria({ id, name }: { id: string; name: string }) {
  const [estado, accion] = useActionState(guardarCategoria, ESTADO_INICIAL);
  const [editando, setEditando] = useState(false);

  useEffect(() => {
    if (estado.ok) setEditando(false);
  }, [estado]);

  if (!editando) {
    return (
      <button
        type="button"
        onClick={() => setEditando(true)}
        aria-label={`Renombrar "${name}"`}
        className="text-muted-foreground hover:text-foreground text-xs underline decoration-dotted underline-offset-2"
      >
        Renombrar
      </button>
    );
  }

  return (
    <form action={accion} className="flex items-center gap-1.5">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="sortOrder" value={0} />
      <Input
        name="name"
        defaultValue={name}
        required
        autoFocus
        aria-label="Nuevo nombre de la categoría"
        className="h-7 text-xs"
      />
      <Enviar size="sm" className="h-7 shrink-0 text-xs">
        Guardar
      </Enviar>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 shrink-0 text-xs"
        onClick={() => setEditando(false)}
      >
        Cancelar
      </Button>
      {!estado.ok && estado.error && (
        <span className="text-destructive text-xs">{estado.error}</span>
      )}
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

/** Los campos que comparten "agregar producto" y "editar producto". */
function CamposProducto({
  idBase,
  tarifas,
  estaciones,
  producto,
  campos,
  version,
}: {
  idBase: string;
  tarifas: Tarifa[];
  /** Estaciones que ya usa este negocio, para no fragmentar "Cocina"/"cocina". */
  estaciones: string[];
  producto?: ProductoAdmin;
  campos?: Record<string, string[]>;
  version: number;
}) {
  const listaEstaciones = `estaciones-${idBase}`;

  return (
    <>
      <SubirImagen key={version} valorInicial={producto?.imageUrl} />

      <div className="grid gap-2 sm:grid-cols-[1fr_8rem]">
        <div className="space-y-1">
          <Label htmlFor={`nombre-${idBase}`} className="text-xs">
            Producto
          </Label>
          <Input
            id={`nombre-${idBase}`}
            name="name"
            required
            placeholder="Cerveza nacional"
            defaultValue={producto?.name}
          />
          {campos?.name && <p className="text-destructive text-xs">{campos.name[0]}</p>}
        </div>
        <div className="space-y-1">
          <Label htmlFor={`precio-${idBase}`} className="text-xs">
            Precio
          </Label>
          <Input
            id={`precio-${idBase}`}
            name="priceCop"
            inputMode="numeric"
            required
            placeholder="5.000"
            defaultValue={producto ? formatCop(producto.priceCop, { symbol: false }) : undefined}
          />
          {campos?.priceCop && <p className="text-destructive text-xs">{campos.priceCop[0]}</p>}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`tarifa-${idBase}`} className="text-xs">
            Impuesto
          </Label>
          <select
            id={`tarifa-${idBase}`}
            name="taxRateId"
            defaultValue={producto?.taxRateId}
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
          <Label htmlFor={`estacion-${idBase}`} className="text-xs">
            Estación de cocina
          </Label>
          <Input
            id={`estacion-${idBase}`}
            name="kitchenStation"
            placeholder="Cocina, Barra, Parrilla…"
            defaultValue={producto?.kitchenStation ?? undefined}
            list={estaciones.length > 0 ? listaEstaciones : undefined}
          />
          {estaciones.length > 0 && (
            <datalist id={listaEstaciones}>
              {estaciones.map((estacion) => (
                <option key={estacion} value={estacion} />
              ))}
            </datalist>
          )}
          <p className="text-muted-foreground text-xs">
            En qué pantalla de cocina aparece este producto. Vacío si no aplica.
          </p>
        </div>
      </div>
    </>
  );
}

export function NuevoProducto({
  categoryId,
  tarifas,
  estaciones,
}: {
  categoryId: string;
  tarifas: Tarifa[];
  estaciones: string[];
}) {
  const [estado, accion] = useActionState(guardarProducto, ESTADO_INICIAL);
  const campos = !estado.ok ? estado.campos : undefined;

  // El reset nativo del form limpia los campos no controlados, pero SubirImagen
  // guarda su preview y su URL en estado de React: sin este remount, agregar un
  // segundo producto seguido heredaba en silencio la foto del primero.
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (estado.ok) setVersion((v) => v + 1);
  }, [estado]);

  return (
    <form action={accion} className="border-border space-y-4 rounded-lg border border-dashed p-3">
      <Error estado={estado} />
      <input type="hidden" name="categoryId" value={categoryId} />

      <CamposProducto
        idBase={categoryId}
        tarifas={tarifas}
        estaciones={estaciones}
        campos={campos}
        version={version}
      />

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

/**
 * Un renglón de la carta: la vista de siempre, o —al tocar "Editar"— el mismo
 * formulario de `NuevoProducto` pero precargado y guardando sobre el `id`
 * existente en vez de crear uno nuevo.
 */
export function FilaProducto({
  producto,
  categoryId,
  tarifas,
  estaciones,
}: {
  producto: ProductoAdmin;
  categoryId: string;
  tarifas: Tarifa[];
  estaciones: string[];
}) {
  const [editando, setEditando] = useState(false);
  const [estado, accion] = useActionState(guardarProducto, ESTADO_INICIAL);
  const campos = !estado.ok ? estado.campos : undefined;
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (estado.ok) {
      setEditando(false);
      setVersion((v) => v + 1);
    }
  }, [estado]);

  if (editando) {
    return (
      <li className="border-border rounded-lg border border-dashed p-3">
        <form action={accion} className="space-y-4">
          <Error estado={estado} />
          <input type="hidden" name="id" value={producto.id} />
          <input type="hidden" name="categoryId" value={categoryId} />

          <CamposProducto
            idBase={producto.id}
            tarifas={tarifas}
            estaciones={estaciones}
            producto={producto}
            campos={campos}
            version={version}
          />

          <div className="flex gap-2">
            <Enviar size="sm">Guardar cambios</Enviar>
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditando(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="flex gap-3 py-3 first:pt-0">
      <ImagenProducto
        nombre={producto.name}
        imageUrl={producto.imageUrl}
        className="size-14 shrink-0 rounded-lg object-cover"
      />

      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="flex items-center gap-2">
            <span className="text-sm font-medium">{producto.name}</span>
            {!producto.isAvailable && <Badge variant="secondary">Agotado</Badge>}
          </span>
          <span className="numeral text-sm">{formatCop(producto.priceCop)}</span>
        </div>

        <p className="text-muted-foreground text-xs">
          {producto.taxRate.name} {formatRateBp(producto.taxRate.rateBp)}
          {producto.kitchenStation && ` · ${producto.kitchenStation}`}
          {producto.sku && ` · ${producto.sku}`}
        </p>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="text-muted-foreground hover:text-foreground text-xs underline decoration-dotted underline-offset-2"
          >
            Editar
          </button>
          <AccionesProducto productId={producto.id} isAvailable={producto.isAvailable} />
        </div>
      </div>
    </li>
  );
}
