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
import { cn } from "@/lib/utils";

export type Tarifa = { id: string; name: string; rateBp: number; isDefault: boolean };

export type GrupoDisponible = {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  _count: { options: number };
};

export type ProductoAdmin = {
  id: string;
  name: string;
  shortDescription: string | null;
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
  hasRecipe: boolean;
  recipeNeedsModifiers: boolean;
  modifierGroups: Array<{ groupId: string; required: boolean }>;
};

/**
 * Una casilla con su explicación al lado.
 *
 * No hay `components/ui/checkbox.tsx` en el proyecto y no vale la pena traer uno
 * para dos campos: un `<input type="checkbox">` nativo ya es accesible, y lo que
 * hace falta acá es el texto que explica qué prende.
 */
function Casilla({
  name,
  label,
  ayuda,
  checked,
  onChange,
  disabled,
  error,
}: {
  name: string;
  label: string;
  ayuda: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  error?: string;
}) {
  const idCampo = `${name}-${label.replace(/\s+/g, "-")}`;

  return (
    <div className={cn("space-y-1", disabled && "opacity-50")}>
      <div className="flex items-start gap-2">
        <input
          id={idCampo}
          name={name}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="accent-brand focus-visible:ring-ring mt-0.5 size-4 shrink-0 rounded focus-visible:ring-3 focus-visible:outline-none"
        />
        <div className="space-y-0.5">
          <Label htmlFor={idCampo} className="text-xs font-medium">
            {label}
          </Label>
          <p className="text-muted-foreground text-xs leading-snug">{ayuda}</p>
        </div>
      </div>
      {error && <p className="text-destructive pl-6 text-xs">{error}</p>}
    </div>
  );
}

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

/**
 * Receta y modificadores del producto.
 *
 * Las dos casillas son declaraciones del dueño, no consecuencias: un producto
 * descuenta insumos porque alguien dijo que lleva receta, no porque la tabla de
 * escandallo tenga filas. Es lo que permite que Inventario → Recetas muestre
 * solo los productos que de verdad se preparan.
 */
function CamposReceta({
  grupos,
  producto,
  campos,
  version,
}: {
  grupos: GrupoDisponible[];
  producto?: ProductoAdmin;
  campos?: Record<string, string[]>;
  version: number;
}) {
  const [conReceta, setConReceta] = useState(producto?.hasRecipe ?? false);
  const [segunModificadores, setSegunModificadores] = useState(
    producto?.recipeNeedsModifiers ?? false,
  );
  const [asignados, setAsignados] = useState<Record<string, boolean>>(() =>
    Object.fromEntries((producto?.modifierGroups ?? []).map((a) => [a.groupId, a.required])),
  );

  // El alta remonta el bloque al guardar (misma `version` que SubirImagen), así
  // que el segundo producto no hereda las casillas del primero.
  useEffect(() => {
    setConReceta(producto?.hasRecipe ?? false);
    setSegunModificadores(producto?.recipeNeedsModifiers ?? false);
    setAsignados(
      Object.fromEntries((producto?.modifierGroups ?? []).map((a) => [a.groupId, a.required])),
    );
  }, [version, producto]);

  const algunoAsignado = Object.keys(asignados).length > 0;

  // Desmarcar "lleva receta" o quitar todos los grupos deja la segunda casilla
  // sin sentido; apagarla sola evita mandar una combinación que el servidor
  // rechazaría con un error que nadie pidió.
  useEffect(() => {
    if (!conReceta || !algunoAsignado) setSegunModificadores(false);
  }, [conReceta, algunoAsignado]);

  return (
    <div className="border-border/70 space-y-3 rounded-lg border border-dashed p-3">
      <Casilla
        name="hasRecipe"
        label="Este producto se prepara con receta"
        ayuda="Descuenta los insumos del inventario al venderse y aparece en Inventario → Recetas."
        checked={conReceta}
        onChange={setConReceta}
      />

      <div className="space-y-2">
        <p className="text-muted-foreground text-xs font-medium tracking-[0.1em] uppercase">
          Modificadores
        </p>

        {grupos.length === 0 ? (
          <p className="text-muted-foreground text-xs italic">
            Todavía no hay grupos. Se crean en Carta → Modificadores.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {grupos.map((grupo) => {
              const marcado = grupo.id in asignados;
              return (
                <li key={grupo.id} className="flex items-center gap-2">
                  <input
                    id={`grupo-${grupo.id}`}
                    type="checkbox"
                    name="modifierGroupIds"
                    value={grupo.id}
                    checked={marcado}
                    onChange={(e) =>
                      setAsignados((prev) => {
                        const copia = { ...prev };
                        if (e.target.checked) copia[grupo.id] = true;
                        else delete copia[grupo.id];
                        return copia;
                      })
                    }
                    className="accent-brand size-4 shrink-0 rounded"
                  />
                  <Label htmlFor={`grupo-${grupo.id}`} className="flex-1 text-xs font-medium">
                    {grupo.name}
                    <span className="text-muted-foreground ml-1 font-normal">
                      ({grupo._count.options}{" "}
                      {grupo._count.options === 1 ? "opción" : "opciones"})
                    </span>
                  </Label>

                  {marcado && (
                    <select
                      value={asignados[grupo.id] ? "si" : "no"}
                      onChange={(e) =>
                        setAsignados((prev) => ({ ...prev, [grupo.id]: e.target.value === "si" }))
                      }
                      className="border-input bg-card h-7 shrink-0 rounded-md border px-1.5 text-xs"
                      aria-label={`${grupo.name}: obligatorio u opcional`}
                    >
                      <option value="si">Obligatorio</option>
                      <option value="no">Opcional</option>
                    </select>
                  )}

                  {marcado && asignados[grupo.id] && (
                    <input type="hidden" name="requiredModifierGroupIds" value={grupo.id} />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Casilla
        name="recipeNeedsModifiers"
        label="La receta depende de los modificadores"
        ayuda="No se descuenta nada hasta que se eligen. Para un menú del día donde el pollo y la carne son insumos distintos."
        checked={segunModificadores}
        onChange={setSegunModificadores}
        disabled={!conReceta || !algunoAsignado}
        error={campos?.recipeNeedsModifiers?.[0]}
      />
    </div>
  );
}

/** Los campos que comparten "agregar producto" y "editar producto". */
function CamposProducto({
  idBase,
  tarifas,
  estaciones,
  grupos,
  producto,
  campos,
  version,
}: {
  idBase: string;
  tarifas: Tarifa[];
  /** Estaciones que ya usa este negocio, para no fragmentar "Cocina"/"cocina". */
  estaciones: string[];
  grupos: GrupoDisponible[];
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

      <div className="space-y-1">
        <Label htmlFor={`desc-corta-${idBase}`} className="text-xs">
          Descripción corta <span className="text-muted-foreground font-normal">(visible en menú QR)</span>
        </Label>
        <Input
          id={`desc-corta-${idBase}`}
          name="shortDescription"
          placeholder="Ej. Carne 150g, queso cheddar, tocineta y papas"
          maxLength={200}
          defaultValue={producto?.shortDescription ?? undefined}
        />
        {campos?.shortDescription && (
          <p className="text-destructive text-xs">{campos.shortDescription[0]}</p>
        )}
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
            className="h-11 tableta:h-10 w-full rounded-lg border border-[var(--linea-16)] bg-[var(--input-bg)] px-3 text-sm focus-visible:border-[var(--papel-60)] focus-visible:bg-[var(--input-bg-focus)] focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:outline-none"
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

      <CamposReceta grupos={grupos} producto={producto} campos={campos} version={version} />
    </>
  );
}

export function NuevoProducto({
  categoryId,
  tarifas,
  estaciones,
  grupos,
}: {
  categoryId: string;
  tarifas: Tarifa[];
  estaciones: string[];
  grupos: GrupoDisponible[];
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
        grupos={grupos}
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
  grupos,
}: {
  producto: ProductoAdmin;
  categoryId: string;
  tarifas: Tarifa[];
  estaciones: string[];
  grupos: GrupoDisponible[];
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
            grupos={grupos}
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
