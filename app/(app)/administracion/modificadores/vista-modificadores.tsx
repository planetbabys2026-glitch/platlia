"use client";

import { useEffect, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useActionState } from "react";
import { Boxes, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  archivarGrupo,
  archivarOpcion,
  guardarGrupo,
  guardarInsumosDeOpcion,
  guardarOpcion,
} from "@/features/modificadores/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ESTADO_INICIAL, type EstadoAccion } from "@/lib/actions/estado";
import { formatCop } from "@/lib/money";
import { cn } from "@/lib/utils";

type Insumo = { id: string; name: string; unit: string; costCop: number };

type Opcion = {
  id: string;
  name: string;
  priceDeltaCop: number;
  isDefault: boolean;
  sortOrder: number;
  supplies: Array<{
    quantityRequired: number;
    inventoryItem: { id: string; name: string; unit: string; costCop: number | null };
  }>;
};

type Grupo = {
  id: string;
  name: string;
  helpText: string | null;
  minSelect: number;
  maxSelect: number;
  sortOrder: number;
  active: boolean;
  options: Opcion[];
  _count: { products: number };
};

function Enviar({
  children,
  ...props
}: React.ComponentProps<typeof Button> & { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} {...props}>
      {pending ? "Guardando…" : children}
    </Button>
  );
}

function Error({ estado }: { estado: EstadoAccion<unknown> }) {
  if (estado.ok || !estado.error) return null;
  return (
    <Alert variant="destructive">
      <AlertDescription>{estado.error}</AlertDescription>
    </Alert>
  );
}

/** Cómo se lee el grupo de un vistazo: "Elegí 1", "Hasta 3, opcional". */
function resumenDelGrupo(grupo: Grupo): string {
  const obligatorio = grupo.minSelect > 0;
  if (grupo.maxSelect === 1) return obligatorio ? "Elegí 1" : "Elegí 1 o ninguna";
  return obligatorio
    ? `Elegí entre ${grupo.minSelect} y ${grupo.maxSelect}`
    : `Hasta ${grupo.maxSelect}, opcional`;
}

export function VistaModificadores({
  grupos,
  inventoryItems,
  inventoryEnabled,
}: {
  grupos: Grupo[];
  inventoryItems: Insumo[];
  inventoryEnabled: boolean;
}) {
  return (
    <div className="space-y-4">
      <FormularioGrupo />

      {grupos.length === 0 ? (
        <Card className="border-dashed py-12 text-center">
          <p className="text-muted-foreground mx-auto max-w-sm text-sm">
            Todavía no hay grupos. Creá el primero —&quot;Proteína&quot;, &quot;Término de la
            carne&quot;— y cargale las opciones.
          </p>
        </Card>
      ) : (
        <ul className="space-y-4">
          {grupos.map((grupo) => (
            <TarjetaGrupo
              key={grupo.id}
              grupo={grupo}
              inventoryItems={inventoryItems}
              inventoryEnabled={inventoryEnabled}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function FormularioGrupo({ grupo }: { grupo?: Grupo }) {
  const [abierto, setAbierto] = useState(false);
  const [estado, accion] = useActionState(guardarGrupo, ESTADO_INICIAL);
  const campos = !estado.ok ? estado.campos : undefined;

  useEffect(() => {
    if (estado.ok) setAbierto(false);
  }, [estado]);

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>
        {grupo ? (
          <Button variant="outline" size="sm" className="h-8 gap-1 text-xs">
            <Pencil className="size-3.5" /> Editar grupo
          </Button>
        ) : (
          <Button size="sm" className="bg-brand text-brand-foreground hover:bg-brand/90 gap-1">
            <Plus className="size-4" /> Nuevo grupo
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{grupo ? `Editar "${grupo.name}"` : "Nuevo grupo"}</DialogTitle>
          <DialogDescription>
            El mínimo y el máximo deciden cómo se ve al vender: máximo 1 son botones
            excluyentes, más de 1 son casillas.
          </DialogDescription>
        </DialogHeader>

        <form action={accion} className="space-y-4 pt-2">
          <Error estado={estado} />
          {grupo && <input type="hidden" name="id" value={grupo.id} />}

          <div className="space-y-1">
            <Label htmlFor={`nombre-grupo-${grupo?.id ?? "nuevo"}`} className="text-xs">
              Nombre
            </Label>
            <Input
              id={`nombre-grupo-${grupo?.id ?? "nuevo"}`}
              name="name"
              required
              placeholder="Proteína"
              defaultValue={grupo?.name}
            />
            {campos?.name && <p className="text-destructive text-xs">{campos.name[0]}</p>}
          </div>

          <div className="space-y-1">
            <Label htmlFor={`ayuda-grupo-${grupo?.id ?? "nuevo"}`} className="text-xs">
              Ayuda (opcional)
            </Label>
            <Input
              id={`ayuda-grupo-${grupo?.id ?? "nuevo"}`}
              name="helpText"
              placeholder="Elegí con qué querés el plato"
              defaultValue={grupo?.helpText ?? undefined}
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label htmlFor={`min-${grupo?.id ?? "nuevo"}`} className="text-xs">
                Mínimo
              </Label>
              <Input
                id={`min-${grupo?.id ?? "nuevo"}`}
                name="minSelect"
                type="number"
                min={0}
                max={20}
                defaultValue={grupo?.minSelect ?? 1}
              />
              {campos?.minSelect && (
                <p className="text-destructive text-xs">{campos.minSelect[0]}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor={`max-${grupo?.id ?? "nuevo"}`} className="text-xs">
                Máximo
              </Label>
              <Input
                id={`max-${grupo?.id ?? "nuevo"}`}
                name="maxSelect"
                type="number"
                min={1}
                max={20}
                defaultValue={grupo?.maxSelect ?? 1}
              />
              {campos?.maxSelect && (
                <p className="text-destructive text-xs">{campos.maxSelect[0]}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor={`orden-${grupo?.id ?? "nuevo"}`} className="text-xs">
                Orden
              </Label>
              <Input
                id={`orden-${grupo?.id ?? "nuevo"}`}
                name="sortOrder"
                type="number"
                min={0}
                max={999}
                defaultValue={grupo?.sortOrder ?? 0}
              />
            </div>
          </div>

          <p className="text-muted-foreground text-xs">
            Mínimo 0 lo hace opcional. Cada producto puede después volverlo obligatorio u
            opcional por su cuenta.
          </p>

          <Enviar className="bg-brand text-brand-foreground hover:bg-brand/90 w-full">
            {grupo ? "Guardar cambios" : "Crear grupo"}
          </Enviar>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TarjetaGrupo({
  grupo,
  inventoryItems,
  inventoryEnabled,
}: {
  grupo: Grupo;
  inventoryItems: Insumo[];
  inventoryEnabled: boolean;
}) {
  const [estadoArchivo, archivar] = useActionState(archivarGrupo, ESTADO_INICIAL);

  return (
    <li>
      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">{grupo.name}</h3>
              <Badge variant="secondary" className="text-rotulo">
                {resumenDelGrupo(grupo)}
              </Badge>
              <span className="text-muted-foreground text-xs">
                {grupo._count.products === 0
                  ? "sin usar"
                  : `en ${grupo._count.products} ${grupo._count.products === 1 ? "producto" : "productos"}`}
              </span>
            </div>
            {grupo.helpText && (
              <p className="text-muted-foreground text-xs">{grupo.helpText}</p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <FormularioGrupo grupo={grupo} />
            <form action={archivar} className="inline">
              <input type="hidden" name="id" value={grupo.id} />
              <Enviar variant="ghost" size="sm" className="text-destructive h-8 text-xs">
                Archivar
              </Enviar>
            </form>
          </div>
        </div>

        {!estadoArchivo.ok && estadoArchivo.error && (
          <p className="text-destructive text-xs">{estadoArchivo.error}</p>
        )}

        {grupo.options.length === 0 ? (
          <p className="text-muted-foreground text-xs italic">
            Sin opciones todavía. Un grupo vacío no aparece al vender.
          </p>
        ) : (
          <ul className="divide-border divide-y">
            {grupo.options.map((opcion) => (
              <FilaOpcion
                key={opcion.id}
                grupo={grupo}
                opcion={opcion}
                inventoryItems={inventoryItems}
                inventoryEnabled={inventoryEnabled}
              />
            ))}
          </ul>
        )}

        <FormularioOpcion groupId={grupo.id} />
      </Card>
    </li>
  );
}

function FilaOpcion({
  grupo,
  opcion,
  inventoryItems,
  inventoryEnabled,
}: {
  grupo: Grupo;
  opcion: Opcion;
  inventoryItems: Insumo[];
  inventoryEnabled: boolean;
}) {
  const [estadoArchivo, archivar] = useActionState(archivarOpcion, ESTADO_INICIAL);

  const costo = opcion.supplies.reduce(
    (acc, s) => acc + s.quantityRequired * (s.inventoryItem.costCop ?? 0),
    0,
  );

  return (
    <li className="flex flex-wrap items-center gap-2 py-2">
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{opcion.name}</span>
          {opcion.priceDeltaCop > 0 && (
            <span className="numeral text-brand text-xs font-bold">
              +{formatCop(opcion.priceDeltaCop)}
            </span>
          )}
          {opcion.isDefault && (
            <Badge variant="outline" className="text-rotulo">
              por defecto
            </Badge>
          )}
        </div>

        {inventoryEnabled && (
          <p className="text-muted-foreground text-xs">
            {opcion.supplies.length === 0 ? (
              <span className="italic">Sin insumos: no descuenta nada del inventario.</span>
            ) : (
              <>
                {opcion.supplies
                  .map((s) => `${s.quantityRequired} ${s.inventoryItem.unit} de ${s.inventoryItem.name}`)
                  .join(" · ")}
                {costo > 0 && <span className="numeral"> — costo {formatCop(costo)}</span>}
              </>
            )}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {inventoryEnabled && (
          <ModalInsumosDeOpcion opcion={opcion} inventoryItems={inventoryItems} />
        )}
        <FormularioOpcion groupId={grupo.id} opcion={opcion} />
        <form action={archivar} className="inline">
          <input type="hidden" name="id" value={opcion.id} />
          <Enviar variant="ghost" size="sm" className="text-destructive size-8 p-0">
            <Trash2 className="size-3.5" />
          </Enviar>
        </form>
      </div>

      {!estadoArchivo.ok && estadoArchivo.error && (
        <p className="text-destructive w-full text-xs">{estadoArchivo.error}</p>
      )}
    </li>
  );
}

function FormularioOpcion({ groupId, opcion }: { groupId: string; opcion?: Opcion }) {
  const [abierto, setAbierto] = useState(false);
  const [estado, accion] = useActionState(guardarOpcion, ESTADO_INICIAL);
  const campos = !estado.ok ? estado.campos : undefined;

  useEffect(() => {
    if (estado.ok) setAbierto(false);
  }, [estado]);

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>
        {opcion ? (
          <Button variant="ghost" size="sm" className="size-8 p-0">
            <Pencil className="size-3.5" />
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="h-8 w-full gap-1 text-xs">
            <Plus className="size-3.5" /> Agregar opción
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{opcion ? `Editar "${opcion.name}"` : "Nueva opción"}</DialogTitle>
        </DialogHeader>

        <form action={accion} className="space-y-4 pt-2">
          <Error estado={estado} />
          <input type="hidden" name="groupId" value={groupId} />
          {opcion && <input type="hidden" name="id" value={opcion.id} />}

          <div className="space-y-1">
            <Label htmlFor={`nombre-op-${opcion?.id ?? groupId}`} className="text-xs">
              Nombre
            </Label>
            <Input
              id={`nombre-op-${opcion?.id ?? groupId}`}
              name="name"
              required
              placeholder="Pollo"
              defaultValue={opcion?.name}
            />
            {campos?.name && <p className="text-destructive text-xs">{campos.name[0]}</p>}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor={`precio-op-${opcion?.id ?? groupId}`} className="text-xs">
                Recargo
              </Label>
              <Input
                id={`precio-op-${opcion?.id ?? groupId}`}
                name="priceDeltaCop"
                inputMode="numeric"
                placeholder="0"
                defaultValue={
                  opcion ? formatCop(opcion.priceDeltaCop, { symbol: false }) : undefined
                }
              />
              {campos?.priceDeltaCop && (
                <p className="text-destructive text-xs">{campos.priceDeltaCop[0]}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor={`orden-op-${opcion?.id ?? groupId}`} className="text-xs">
                Orden
              </Label>
              <Input
                id={`orden-op-${opcion?.id ?? groupId}`}
                name="sortOrder"
                type="number"
                min={0}
                max={999}
                defaultValue={opcion?.sortOrder ?? 0}
              />
            </div>
          </div>

          <div className="flex items-start gap-2">
            <input
              id={`default-op-${opcion?.id ?? groupId}`}
              name="isDefault"
              type="checkbox"
              defaultChecked={opcion?.isDefault ?? false}
              className="accent-brand mt-0.5 size-4 shrink-0 rounded"
            />
            <Label htmlFor={`default-op-${opcion?.id ?? groupId}`} className="text-xs font-normal">
              Viene marcada al abrir el modal de venta
            </Label>
          </div>

          <p className="text-muted-foreground text-xs">
            Dejá el recargo en cero cuando la opción no cambia el precio, como el término de
            la carne.
          </p>

          <Enviar className="bg-brand text-brand-foreground hover:bg-brand/90 w-full">
            {opcion ? "Guardar cambios" : "Agregar opción"}
          </Enviar>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Los insumos que consume una opción.
 *
 * Mismo patrón que el editor de recetas del inventario: la lista vive en estado
 * de React y viaja como JSON en un solo campo, porque es de largo variable.
 */
function ModalInsumosDeOpcion({
  opcion,
  inventoryItems,
}: {
  opcion: Opcion;
  inventoryItems: Insumo[];
}) {
  const [abierto, setAbierto] = useState(false);
  const [enviando, startTransition] = useTransition();
  const [items, setItems] = useState<Array<{ inventoryItemId: string; quantityRequired: number }>>(
    () =>
      opcion.supplies.map((s) => ({
        inventoryItemId: s.inventoryItem.id,
        quantityRequired: s.quantityRequired,
      })),
  );

  const unidadDe = (id: string) => inventoryItems.find((i) => i.id === id)?.unit ?? "";

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const formData = new FormData();
      formData.append("optionId", opcion.id);
      formData.append("itemsJson", JSON.stringify(items));

      const res = await guardarInsumosDeOpcion(ESTADO_INICIAL, formData);
      if (res.ok) {
        toast.success(`Insumos de ${opcion.name} guardados.`);
        setAbierto(false);
      } else {
        toast.error(res.error || "Ocurrió un error.");
      }
    });
  };

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn("size-8 p-0", opcion.supplies.length > 0 && "text-brand")}
          title="Insumos que consume"
        >
          <Boxes className="size-3.5" />
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Insumos de {opcion.name}</DialogTitle>
          <DialogDescription>
            Lo que se descuenta del inventario cuando alguien elige esta opción. Las cantidades
            van en la unidad del insumo, sin decimales.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={enviar} className="space-y-4 pt-2">
          {inventoryItems.length === 0 ? (
            <p className="text-muted-foreground text-sm italic">
              No hay insumos cargados todavía. Cargalos desde Inventario.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold">Insumos por porción</span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 text-xs"
                  onClick={() =>
                    setItems([
                      ...items,
                      { inventoryItemId: inventoryItems[0].id, quantityRequired: 1 },
                    ])
                  }
                >
                  <Plus className="size-3" /> Agregar
                </Button>
              </div>

              {items.length === 0 ? (
                <p className="text-muted-foreground text-xs italic">
                  Sin insumos: elegir esta opción no descuenta nada.
                </p>
              ) : (
                <ul className="space-y-2">
                  {items.map((item, idx) => (
                    <li key={idx} className="flex items-center gap-2">
                      <select
                        value={item.inventoryItemId}
                        onChange={(e) =>
                          setItems(
                            items.map((it, i) =>
                              i === idx ? { ...it, inventoryItemId: e.target.value } : it,
                            ),
                          )
                        }
                        className="border-input bg-card h-9 min-w-0 flex-1 rounded-lg border px-2 text-sm"
                        aria-label="Insumo"
                      >
                        {inventoryItems.map((ins) => (
                          <option key={ins.id} value={ins.id}>
                            {ins.name}
                          </option>
                        ))}
                      </select>

                      <Input
                        type="number"
                        min={1}
                        value={item.quantityRequired}
                        onChange={(e) =>
                          setItems(
                            items.map((it, i) =>
                              i === idx
                                ? { ...it, quantityRequired: Number(e.target.value) || 1 }
                                : it,
                            ),
                          )
                        }
                        className="h-9 w-20 shrink-0"
                        aria-label="Cantidad requerida"
                      />

                      <span className="text-muted-foreground w-14 shrink-0 text-xs">
                        {unidadDe(item.inventoryItemId)}
                      </span>

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive size-8 shrink-0 p-0"
                        onClick={() => setItems(items.filter((_, i) => i !== idx))}
                        aria-label="Quitar insumo"
                      >
                        <X className="size-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}

              <Button
                type="submit"
                disabled={enviando}
                className="bg-brand text-brand-foreground hover:bg-brand/90 w-full"
              >
                {enviando ? "Guardando…" : "Guardar insumos"}
              </Button>
            </>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
