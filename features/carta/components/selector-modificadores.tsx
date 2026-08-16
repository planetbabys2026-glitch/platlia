"use client";

import { useMemo, useState } from "react";
import { Check, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  alternarOpcion,
  calcularRecargoCop,
  minimoEfectivo,
  seleccionInicial,
  validarSeleccion,
  type GrupoModificador,
} from "@/lib/modificadores";
import { calcularStockDisponibleCombinacion } from "@/lib/inventory/stock";
import type { OpcionConInsumos, RenglonDeReceta } from "@/lib/inventory/receta";
import { formatCop } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * El paso intermedio entre tocar un producto y agregarlo al pedido.
 *
 * Solo aparece cuando hay algo que elegir. Un producto sin grupos sigue
 * entrando de un toque, que es la promesa que la carta hacía desde el principio
 * y que un modal para todo habría roto: nadie quiere confirmar dos veces una
 * gaseosa.
 *
 * Es cliente puro y lo comparten el POS, la mesa y el menú QR. Las tres
 * pantallas tienen que cotizar igual, así que las tres usan las mismas funciones
 * puras de lib/modificadores.ts que después vuelve a correr el servidor.
 */

export type ProductoConModificadores = {
  id: string;
  name: string;
  priceCop: number;
  imageUrl?: string | null;
  hasRecipe?: boolean;
  trackStock?: boolean;
  stockQty?: number;
  recipeItems?: RenglonDeReceta[];
  modifierGroups?: Array<{
    required: boolean;
    group: {
      id: string;
      name: string;
      helpText?: string | null;
      minSelect: number;
      maxSelect: number;
      options: Array<OpcionConInsumos & { priceDeltaCop: number; isDefault?: boolean }>;
    };
  }>;
};

/** Los grupos de un producto en la forma que entienden las reglas puras. */
export function gruposDeProducto(producto: ProductoConModificadores): GrupoModificador[] {
  return (producto.modifierGroups ?? []).map((a) => ({
    id: a.group.id,
    name: a.group.name,
    minSelect: a.group.minSelect,
    maxSelect: a.group.maxSelect,
    required: a.required,
    options: a.group.options.map((o) => ({
      id: o.id,
      name: o.name,
      priceDeltaCop: o.priceDeltaCop,
      isDefault: o.isDefault,
    })),
  }));
}

export function tieneModificadores(producto: ProductoConModificadores): boolean {
  return (producto.modifierGroups ?? []).some((a) => a.group.options.length > 0);
}

/** Busca la opción con sus insumos, para poder calcular disponibilidad. */
function opcionesConInsumos(
  producto: ProductoConModificadores,
  ids: string[],
): OpcionConInsumos[] {
  const todas = (producto.modifierGroups ?? []).flatMap((a) => a.group.options);
  return ids.map((id) => todas.find((o) => o.id === id)).filter((o) => o !== undefined);
}

export function SelectorModificadores({
  producto,
  abierto,
  onCerrar,
  onConfirmar,
  /** Cuántas unidades de este producto ya hay en el carrito, para no pasarse del stock. */
  yaEnCarrito = 0,
  permitirCantidad = true,
  permitirNota = true,
  inventoryEnabled = true,
}: {
  producto: ProductoConModificadores | null;
  abierto: boolean;
  onCerrar: () => void;
  onConfirmar: (seleccion: {
    opcionIds: string[];
    quantity: number;
    notes: string;
    recargoCop: number;
  }) => void;
  yaEnCarrito?: number;
  permitirCantidad?: boolean;
  permitirNota?: boolean;
  inventoryEnabled?: boolean;
}) {
  const grupos = useMemo(() => (producto ? gruposDeProducto(producto) : []), [producto]);

  // La clave remonta el estado cuando cambia el producto: sin esto, abrir un
  // segundo plato heredaba en silencio la proteína del primero.
  return (
    <Dialog open={abierto && producto !== null} onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        {producto && (
          <CuerpoSelector
            key={producto.id}
            producto={producto}
            grupos={grupos}
            yaEnCarrito={yaEnCarrito}
            permitirCantidad={permitirCantidad}
            permitirNota={permitirNota}
            inventoryEnabled={inventoryEnabled}
            onConfirmar={onConfirmar}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CuerpoSelector({
  producto,
  grupos,
  yaEnCarrito,
  permitirCantidad,
  permitirNota,
  inventoryEnabled = true,
  onConfirmar,
}: {
  producto: ProductoConModificadores;
  grupos: GrupoModificador[];
  yaEnCarrito: number;
  permitirCantidad: boolean;
  permitirNota: boolean;
  inventoryEnabled?: boolean;
  onConfirmar: (seleccion: {
    opcionIds: string[];
    quantity: number;
    notes: string;
    recargoCop: number;
  }) => void;
}) {
  const [elegidas, setElegidas] = useState<string[]>(() => seleccionInicial(grupos));
  const [cantidad, setCantidad] = useState(1);
  const [nota, setNota] = useState("");

  const recargoCop = calcularRecargoCop(grupos, elegidas);
  const precioUnitario = producto.priceCop + recargoCop;
  const problema = validarSeleccion(grupos, elegidas);

  // Cuántas se pueden preparar con lo que hay, para esta combinación exacta.
  const disponibles = calcularStockDisponibleCombinacion(
    producto,
    opcionesConInsumos(producto, elegidas),
    inventoryEnabled,
  );
  const techo = disponibles === null ? Infinity : Math.max(0, disponibles - yaEnCarrito);
  const sinStock = cantidad > techo;

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-baseline justify-between gap-3">
          <span>{producto.name}</span>
          <span className="numeral text-muted-foreground shrink-0 text-sm font-medium">
            {formatCop(producto.priceCop)}
          </span>
        </DialogTitle>
        <DialogDescription>
          Elegí cómo se prepara antes de mandarlo a cocina.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-5 py-2">
        {producto.modifierGroups?.map((asignado) => {
          const grupo = grupos.find((g) => g.id === asignado.group.id);
          if (!grupo || grupo.options.length === 0) return null;

          const minimo = minimoEfectivo(grupo);
          const cuantas = grupo.options.filter((o) => elegidas.includes(o.id)).length;
          const completo = cuantas >= minimo;

          return (
            <section key={grupo.id} className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <h4 className="text-xs font-semibold tracking-[0.12em] uppercase">
                  {grupo.name}
                </h4>
                <span
                  className={cn(
                    "shrink-0 text-rotulo font-bold uppercase",
                    minimo > 0 && !completo ? "text-destructive" : "text-muted-foreground",
                  )}
                >
                  {minimo > 0 ? "Obligatorio" : "Opcional"}
                  {grupo.maxSelect > 1 ? ` · hasta ${grupo.maxSelect}` : ""}
                </span>
              </div>

              {asignado.group.helpText && (
                <p className="text-muted-foreground text-xs">{asignado.group.helpText}</p>
              )}

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {asignado.group.options.map((opcion) => {
                  const activa = elegidas.includes(opcion.id);

                  // Una opción cuyos insumos no alcanzan se deshabilita sola, en
                  // vez de dejar que el pedido reviente al confirmarlo. El resto
                  // del grupo sigue tocable: que no haya pollo no significa que
                  // el plato no se pueda vender con carne.
                  const conEsta = calcularStockDisponibleCombinacion(
                    producto,
                    opcionesConInsumos(producto, alternarOpcion(grupo, elegidas, opcion.id)),
                    inventoryEnabled,
                  );
                  const agotada = !activa && conEsta !== null && conEsta - yaEnCarrito <= 0;

                  return (
                    <button
                      key={opcion.id}
                      type="button"
                      disabled={agotada}
                      onClick={() => setElegidas(alternarOpcion(grupo, elegidas, opcion.id))}
                      title={agotada ? `No hay insumos para "${opcion.name}"` : undefined}
                      className={cn(
                        "relative flex min-h-14 flex-col justify-center gap-0.5 rounded-xl border p-2.5 text-left transition-all",
                        "focus-visible:ring-ring focus-visible:ring-3 focus-visible:outline-none",
                        activa
                          ? "border-brand bg-brand/10 ring-brand/30 ring-2"
                          : "border-border bg-card hover:border-brand/40 hover:bg-accent/60",
                        agotada && "cursor-not-allowed opacity-40 hover:border-border hover:bg-card",
                      )}
                    >
                      {activa && (
                        <Check className="text-brand absolute top-1.5 right-1.5 size-3.5" />
                      )}
                      <span className="pr-4 text-xs leading-tight font-semibold">
                        {opcion.name}
                      </span>
                      {opcion.priceDeltaCop > 0 && (
                        <span className="numeral text-brand text-rotulo font-bold">
                          +{formatCop(opcion.priceDeltaCop)}
                        </span>
                      )}
                      {agotada && (
                        <span className="text-destructive text-rotulo font-medium">Sin insumos</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}

        {permitirNota && (
          <div className="space-y-1">
            <Label htmlFor="nota-modificadores" className="text-xs">
              Nota para cocina
            </Label>
            <Input
              id="nota-modificadores"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              maxLength={200}
              placeholder="Sin cebolla, aparte…"
              className="h-9 text-sm"
            />
          </div>
        )}

        {permitirCantidad && (
          <div className="flex items-center justify-between gap-3">
            <Label className="text-xs">Cantidad</Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="size-9 shrink-0 p-0"
                onClick={() => setCantidad((c) => Math.max(1, c - 1))}
                aria-label="Quitar uno"
              >
                <Minus className="size-4" />
              </Button>
              <span className="numeral w-8 text-center text-base font-bold">{cantidad}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="size-9 shrink-0 p-0"
                disabled={cantidad + 1 > techo}
                onClick={() => setCantidad((c) => c + 1)}
                aria-label="Agregar uno"
              >
                <Plus className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <DialogFooter className="flex-col gap-2 sm:flex-col">
        {(problema || sinStock) && (
          <p className="text-destructive w-full text-center text-xs font-medium" role="alert">
            {problema ??
              (techo <= 0
                ? `No hay insumos suficientes para preparar "${producto.name}".`
                : `Solo quedan ${techo} para preparar con esa combinación.`)}
          </p>
        )}

        <Button
          type="button"
          disabled={problema !== null || sinStock}
          onClick={() =>
            onConfirmar({ opcionIds: elegidas, quantity: cantidad, notes: nota, recargoCop })
          }
          className="bg-brand text-brand-foreground hover:bg-brand/90 h-11 w-full text-sm font-bold"
        >
          Agregar · {formatCop(precioUnitario * cantidad)}
        </Button>
      </DialogFooter>
    </>
  );
}
