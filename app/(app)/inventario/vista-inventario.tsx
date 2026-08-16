"use client";

import { useState, useTransition } from "react";
import { useVistaEnUrl } from "@/lib/vista-en-url";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  actualizarStockProductoTerminado,
  crearFacturaCompra,
  crearInsumo,
  crearProductoTerminado,
  crearProveedor,
  editarInsumo,
  editarProductoTerminado,
  guardarReceta,
} from "@/features/inventario/actions";
import { ESTADO_INICIAL } from "@/lib/actions/estado";
import { formatCop } from "@/lib/money";
import { formatDayInTimeZone } from "@/lib/time";
import { calcularStockDisponibleProducto } from "@/lib/inventory/stock";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  AlertTriangle,
  BookOpen,
  Boxes,
  Check,
  Edit,
  FileText,
  Filter,
  Plus,
  Search,
  Settings2,
  ShoppingBag,
  Truck,
  X,
} from "lucide-react";

type InsumoItem = {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  stockCurrent: number;
  stockMin: number;
  costCop: number;
};

type ProveedorItem = {
  id: string;
  name: string;
  taxId: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  _count: { invoices: number };
};

type FacturaItem = {
  id: string;
  invoiceNumber: string;
  invoiceDate: Date;
  includesTax: boolean;
  subtotalCop: number;
  taxCop: number;
  totalCop: number;
  notes: string | null;
  supplier: { id: string; name: string; taxId: string | null } | null;
  items: Array<{
    id: string;
    quantity: number;
    unitCostCop: number;
    totalCop: number;
    inventoryItem: { id: string; name: string; unit: string };
  }>;
};

type ProductoReceta = {
  id: string;
  name: string;
  priceCop: number;
  hasRecipe: boolean;
  recipeNeedsModifiers: boolean;
  category: { name: string };
  recipeItems: Array<{
    id: string;
    quantityRequired: number;
    inventoryItem: { id: string; name: string; unit: string; costCop: number; stockCurrent: number };
  }>;
  modifierGroups: Array<{
    required: boolean;
    group: {
      id: string;
      name: string;
      minSelect: number;
      maxSelect: number;
      options: Array<{
        id: string;
        name: string;
        priceDeltaCop: number;
        supplies: Array<{
          quantityRequired: number;
          inventoryItem: {
            id: string;
            name: string;
            unit: string;
            costCop: number;
            stockCurrent: number;
          };
        }>;
      }>;
    };
  }>;
};

export type ProductoTerminadoItem = {
  id: string;
  name: string;
  sku: string | null;
  priceCop: number;
  imageUrl: string | null;
  trackStock: boolean;
  stockQty: number;
  isAvailable: boolean;
  category: { id: string; name: string };
  recipeItems: Array<{
    id: string;
    quantityRequired: number;
    inventoryItem: { id: string; name: string; unit: string; costCop: number; stockCurrent: number };
  }>;
};

export function VistaInventario({
  summary,
  suppliers,
  invoices,
  recipeData,
  finishedProducts = [],
  categories = [],
  recipesEnabled,
}: {
  summary: {
    totalItems: number;
    valorTotalCOP: number;
    bajoStockCount: number;
    items: InsumoItem[];
  };
  suppliers: ProveedorItem[];
  invoices: FacturaItem[];
  recipeData: { products: ProductoReceta[]; inventoryItems: Array<{ id: string; name: string; unit: string; costCop: number }> };
  finishedProducts?: ProductoTerminadoItem[];
  categories?: Array<{ id: string; name: string }>;
  recipesEnabled: boolean;
}) {
  // La pestaña vive en la URL para que el menú lateral pueda enlazar cada vista.
  const [tabActiva, setTabActiva] = useVistaEnUrl(
    "vista",
    ["stock", "bebidas", "facturas", "recetas", "proveedores"] as const,
    "stock",
  );
  const [busqueda, setBusqueda] = useState("");
  const [openInsumoModal, setOpenInsumoModal] = useState(false);
  const [openBebidaModal, setOpenBebidaModal] = useState(false);
  const [openProveedorModal, setOpenProveedorModal] = useState(false);
  const [openFacturaModal, setOpenFacturaModal] = useState(false);

  // Insumos filtrados
  const insumosFiltrados = summary.items.filter(
    (i) =>
      !busqueda ||
      i.name.toLowerCase().includes(busqueda.toLowerCase()) ||
      (i.sku && i.sku.toLowerCase().includes(busqueda.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      
      {/* ─────────────────────────────────────────────────────────────
          TARJETAS DE RESUMEN DE INVENTARIO Y STOCK
          ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 space-y-1">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Valor Total del Stock</p>
            <p className="numeral text-2xl font-bold text-success-soft">
              {formatCop(summary.valorTotalCOP)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-1">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Insumos Registrados</p>
            <p className="numeral text-2xl font-bold text-foreground">
              {summary.totalItems} insumos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-1">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Insumos Bajo Stock Mínimo</p>
            <div className="flex items-center gap-2">
              <p className={`numeral text-2xl font-bold ${summary.bajoStockCount > 0 ? "text-destructive-soft" : "text-foreground"}`}>
                {summary.bajoStockCount}
              </p>
              {summary.bajoStockCount > 0 && (
                <Badge variant="destructive" className="text-xs gap-1">
                  <AlertTriangle className="size-3" />
                  Alerta de Reposición
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          PESTAÑAS DEL MÓDULO DE INVENTARIO
          ───────────────────────────────────────────────────────────── */}
      <Tabs
        value={tabActiva}
        // `Tabs` entrega un `string` suelto; la vista es un conjunto cerrado y el
        // hook ya descarta lo que no pertenece.
        onValueChange={(v) => setTabActiva(v as typeof tabActiva)}
        className="w-full"
      >
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-border pb-3">
          {/* `min-w-0` y sin `shrink-0`: la tira tiene cinco pestañas y no entra
              al lado de los botones de acción. Con `shrink-0` no cedía y empujaba
              la fila 150px fuera de la pantalla en una tablet; ahora se encoge y
              hace su propio scroll, que es para lo que tiene `overflow-x-auto`. */}
          <TabsList className="inline-flex w-full min-w-0 sm:w-auto items-center justify-start overflow-x-auto p-1 bg-muted/60 scrollbar-none rounded-xl border border-border/50 shadow-xs flex-nowrap">
            <TabsTrigger value="stock" className="text-xs font-semibold gap-1.5 shrink-0 whitespace-nowrap px-3 py-1.5">
              <Boxes className="size-3.5" />
              <span>Insumos ({summary.totalItems})</span>
            </TabsTrigger>
            <TabsTrigger value="bebidas" className="text-xs font-semibold gap-1.5 shrink-0 whitespace-nowrap px-3 py-1.5">
              <ShoppingBag className="size-3.5" />
              <span>Bebidas & Reventa ({finishedProducts.length})</span>
            </TabsTrigger>
            <TabsTrigger value="facturas" className="text-xs font-semibold gap-1.5 shrink-0 whitespace-nowrap px-3 py-1.5">
              <FileText className="size-3.5" />
              <span>Facturas ({invoices.length})</span>
            </TabsTrigger>
            {recipesEnabled && (
              <TabsTrigger value="recetas" className="text-xs font-semibold gap-1.5 shrink-0 whitespace-nowrap px-3 py-1.5">
                <BookOpen className="size-3.5" />
                <span>Recetas</span>
              </TabsTrigger>
            )}
            <TabsTrigger value="proveedores" className="text-xs font-semibold gap-1.5 shrink-0 whitespace-nowrap px-3 py-1.5">
              <Truck className="size-3.5" />
              <span>Proveedores ({suppliers.length})</span>
            </TabsTrigger>
          </TabsList>

          {/* Acciones Rápidas Dinámicas según la Pestaña Activa */}
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {tabActiva === "stock" && (
              <>
                <ModalNuevoInsumo open={openInsumoModal} onOpenChange={setOpenInsumoModal} />
                <ModalNuevaFactura
                  open={openFacturaModal}
                  onOpenChange={setOpenFacturaModal}
                  suppliers={suppliers}
                  inventoryItems={summary.items}
                />
              </>
            )}

            {tabActiva === "bebidas" && (
              <>
                <ModalNuevoProductoTerminado
                  open={openBebidaModal}
                  onOpenChange={setOpenBebidaModal}
                  categories={categories}
                />
                <ModalNuevaFactura
                  open={openFacturaModal}
                  onOpenChange={setOpenFacturaModal}
                  suppliers={suppliers}
                  inventoryItems={summary.items}
                />
              </>
            )}

            {tabActiva === "facturas" && (
              <ModalNuevaFactura
                open={openFacturaModal}
                onOpenChange={setOpenFacturaModal}
                suppliers={suppliers}
                inventoryItems={summary.items}
              />
            )}

            {tabActiva === "recetas" && (
              <Button asChild size="sm" className="bg-brand text-brand-foreground hover:bg-brand/90 text-xs shadow-xs font-medium h-7 sm:h-8 gap-1.5 rounded-md px-2.5">
                <Link href="/administracion/menu">
                  <Settings2 className="size-3.5 mr-1" />
                  <span>Gestionar Menú y Platos</span>
                </Link>
              </Button>
            )}

            {tabActiva === "proveedores" && (
              <ModalNuevoProveedor open={openProveedorModal} onOpenChange={setOpenProveedorModal} />
            )}
          </div>
        </div>

        {/* ── PESTAÑA 1: STOCK E INSUMOS ── */}
        <TabsContent value="stock" className="space-y-4 pt-4">
          <div className="flex items-center justify-between gap-4">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar insumo por nombre o SKU..."
                className="pl-9 text-xs h-9"
              />
            </div>
            <p className="text-xs text-muted-foreground hidden sm:block">
              Mostrando {insumosFiltrados.length} de {summary.totalItems} insumos
            </p>
          </div>

          {insumosFiltrados.length === 0 ? (
            <Card className="py-12 text-center border-dashed">
              <CardContent className="space-y-3">
                <Boxes className="size-8 mx-auto text-muted-foreground opacity-50" />
                <p className="text-muted-foreground text-sm font-medium">No se encontraron insumos de inventario.</p>
                <Button size="sm" onClick={() => setOpenInsumoModal(true)}>
                  <Plus className="size-4 mr-1.5" />
                  Cargar Primer Insumo
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {insumosFiltrados.map((item) => (
                <TarjetaInsumo key={item.id} item={item} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── PESTAÑA BEBIDAS Y PRODUCTOS TERMINADOS (STOCK DIRECTO) ── */}
        <TabsContent value="bebidas" className="space-y-4 pt-4">
          <SeccionProductosTerminados products={finishedProducts} categories={categories} />
        </TabsContent>

        {/* ── PESTAÑA 2: FACTURAS DE COMPRA Y ENTRADAS ── */}
        <TabsContent value="facturas" className="space-y-4 pt-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Registro de Facturas de Proveedores</h3>
            <Button size="sm" onClick={() => setOpenFacturaModal(true)} className="bg-brand text-brand-foreground hover:bg-brand/90 text-xs">
              <Plus className="size-3.5 mr-1" />
              Cargar Factura de Compra
            </Button>
          </div>

          {invoices.length === 0 ? (
            <Card className="py-12 text-center border-dashed">
              <CardContent className="space-y-3">
                <FileText className="size-8 mx-auto text-muted-foreground opacity-50" />
                <p className="text-muted-foreground text-sm font-medium">Todavía no has registrado facturas de compra de proveedores.</p>
                <Button size="sm" onClick={() => setOpenFacturaModal(true)}>
                  <Plus className="size-4 mr-1.5" />
                  Registrar Primera Factura
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {invoices.map((inv) => (
                <TarjetaFacturaCompra key={inv.id} factura={inv} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── PESTAÑA 3: RECETAS Y ESCANDALLOS ── */}
        {recipesEnabled && (
          <TabsContent value="recetas" className="space-y-4 pt-4">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-foreground">Recetas e Ingredientes por Producto</h3>
              <p className="text-xs text-muted-foreground">
                Configurá los insumos requeridos por cada porción/unidad de producto para descontar stock automáticamente por cada venta.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {recipeData.products.map((prod) => (
                <TarjetaRecetaProducto
                  key={prod.id}
                  producto={prod}
                  inventoryItems={recipeData.inventoryItems}
                />
              ))}
            </div>
          </TabsContent>
        )}

        {/* ── PESTAÑA 4: PROVEEDORES ── */}
        <TabsContent value="proveedores" className="space-y-4 pt-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Directorio de Proveedores</h3>
            <ModalNuevoProveedor open={openProveedorModal} onOpenChange={setOpenProveedorModal} />
          </div>

          {suppliers.length === 0 ? (
            <Card className="py-12 text-center border-dashed">
              <CardContent className="space-y-3">
                <Truck className="size-8 mx-auto text-muted-foreground opacity-50" />
                <p className="text-muted-foreground text-sm font-medium">No se han registrado proveedores de mercadería.</p>
                <Button size="sm" onClick={() => setOpenProveedorModal(true)}>
                  <Plus className="size-4 mr-1.5" />
                  Agregar Primer Proveedor
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {suppliers.map((sup) => (
                <Card key={sup.id} className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold text-sm text-foreground">{sup.name}</span>
                    {sup.taxId && <Badge variant="outline" className="text-rotulo">{sup.taxId}</Badge>}
                  </div>
                  {sup.phone && <p className="text-xs text-muted-foreground">Tel: {sup.phone}</p>}
                  {sup.email && <p className="text-xs text-muted-foreground">Correo: {sup.email}</p>}
                  {sup.address && <p className="text-xs text-muted-foreground">Dirección: {sup.address}</p>}
                  <p className="text-rotulo font-semibold text-brand pt-1">
                    {sup._count.invoices} facturas asociadas
                  </p>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

      </Tabs>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTES AUXILIARES Y MODALES
// ─────────────────────────────────────────────────────────────────────────────

function TarjetaInsumo({ item }: { item: InsumoItem }) {
  const [openEditar, setOpenEditar] = useState(false);
  const bajoStock = item.stockCurrent <= item.stockMin;
  const valorTotalItem = item.stockCurrent * item.costCop;

  return (
    <Card className={`p-4 space-y-3 border ${bajoStock ? "border-destructive/50 bg-destructive/5" : "border-border"}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="font-bold text-sm text-foreground">{item.name}</h4>
          {item.sku && <p className="text-rotulo text-muted-foreground font-mono">SKU: {item.sku}</p>}
        </div>

        <Badge
          variant="outline"
          className={`text-rotulo font-semibold ${
            bajoStock
              ? "border-destructive/40 bg-destructive/10 text-destructive-soft"
              : "border-success/40 bg-success/10 text-success-soft"
          }`}
        >
          {bajoStock ? "Bajo Stock" : "Stock Normal"}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-border/60">
        <div>
          <span className="text-muted-foreground block text-rotulo">Stock Actual</span>
          <span className="numeral font-bold text-sm text-foreground">
            {item.stockCurrent} {item.unit}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground block text-rotulo">Stock Mínimo</span>
          <span className="numeral font-medium text-xs text-muted-foreground">
            {item.stockMin} {item.unit}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground block text-rotulo">Costo Unitario</span>
          <span className="numeral font-medium text-xs text-foreground">
            {formatCop(item.costCop)} / {item.unit}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground block text-rotulo">Valor Total</span>
          <span className="numeral font-bold text-xs text-success-soft">
            {formatCop(valorTotalItem)}
          </span>
        </div>
      </div>

      <div className="pt-1 flex justify-end">
        <ModalEditarInsumo item={item} open={openEditar} onOpenChange={setOpenEditar} />
      </div>
    </Card>
  );
}

function ModalNuevoInsumo({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const res = await crearInsumo(ESTADO_INICIAL, formData);
      if (res.ok) {
        toast.success("Insumo cargado correctamente en el inventario.");
        onOpenChange(false);
      } else {
        toast.error(res.error || "Ocurrió un error al guardar el insumo.");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" className="bg-brand text-brand-foreground hover:bg-brand/90 text-xs shadow-xs font-medium h-7 sm:h-8 gap-1.5 rounded-md px-2.5">
          <Plus className="size-3.5 mr-1" />
          <span>Cargar Insumo / Stock Inicial</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cargar Nuevo Insumo o Stock Inicial</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-1">
            <label className="text-xs font-semibold">Nombre del Insumo / Producto *</label>
            <Input name="name" placeholder="Ej. Carne Molida, Harina, Queso Mozzarella" required className="text-xs" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold">SKU / Código</label>
              <Input name="sku" placeholder="INS-001" className="text-xs" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold">Unidad de Medida *</label>
              <select name="unit" defaultValue="GRAMO" className="w-full h-9 rounded-md border border-input px-3 text-xs bg-background">
                <option value="UNIDAD">Unidad (UN)</option>
                <option value="GRAMO">Gramo (g)</option>
                <option value="KILOGRAMO">Kilogramo (kg)</option>
                <option value="MILILITRO">Mililitro (ml)</option>
                <option value="LITRO">Litro (L)</option>
                <option value="PAQUETE">Paquete</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold">Stock Inicial *</label>
              <Input name="stockCurrent" type="number" defaultValue="0" min="0" required className="text-xs" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold">Stock Mínimo de Alerta</label>
              <Input name="stockMin" type="number" defaultValue="0" min="0" className="text-xs" />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold">Costo Unitario en COP *</label>
            <Input name="costCop" type="number" defaultValue="0" min="0" required className="text-xs" />
          </div>

          <Button type="submit" disabled={isPending} className="w-full bg-brand text-brand-foreground text-xs">
            {isPending ? "Guardando..." : "Guardar Insumo"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ModalEditarInsumo({ item, open, onOpenChange }: { item: InsumoItem; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.append("id", item.id);

    startTransition(async () => {
      const res = await editarInsumo(ESTADO_INICIAL, formData);
      if (res.ok) {
        toast.success("Insumo actualizado.");
        onOpenChange(false);
      } else {
        toast.error(res.error || "Ocurrió un error.");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
          <Settings2 className="size-3" />
          <span>Editar Stock</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editar {item.name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-1">
            <label className="text-xs font-semibold">Nombre del Insumo *</label>
            <Input name="name" defaultValue={item.name} required className="text-xs" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold">SKU</label>
              <Input name="sku" defaultValue={item.sku ?? ""} className="text-xs" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold">Unidad *</label>
              <Input name="unit" defaultValue={item.unit} required className="text-xs" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold">Stock Actual *</label>
              <Input name="stockCurrent" type="number" defaultValue={item.stockCurrent} min="0" required className="text-xs" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold">Stock Mínimo</label>
              <Input name="stockMin" type="number" defaultValue={item.stockMin} min="0" className="text-xs" />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold">Costo Unitario COP *</label>
            <Input name="costCop" type="number" defaultValue={item.costCop} min="0" required className="text-xs" />
          </div>

          <Button type="submit" disabled={isPending} className="w-full bg-brand text-brand-foreground text-xs">
            {isPending ? "Guardando..." : "Actualizar Insumo"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ModalNuevoProveedor({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const res = await crearProveedor(ESTADO_INICIAL, formData);
      if (res.ok) {
        toast.success("Proveedor registrado.");
        onOpenChange(false);
      } else {
        toast.error(res.error || "Ocurrió un error.");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" className="bg-brand text-brand-foreground hover:bg-brand/90 text-xs shadow-xs font-medium h-7 sm:h-8 gap-1.5 rounded-md px-2.5">
          <Plus className="size-3.5 mr-1" />
          <span>Nuevo Proveedor</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar Proveedor</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 pt-2">
          <div className="space-y-1">
            <label className="text-xs font-semibold">Nombre / Razón Social *</label>
            <Input name="name" placeholder="Ej. Distribuidora Avícola S.A.S." required className="text-xs" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold">NIT / Documento</label>
              <Input name="taxId" placeholder="900123456-1" className="text-xs" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold">Teléfono</label>
              <Input name="phone" placeholder="300 123 4567" className="text-xs" />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold">Correo Electrónico</label>
            <Input name="email" type="email" placeholder="ventas@proveedor.com" className="text-xs" />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold">Dirección</label>
            <Input name="address" placeholder="Calle 45 # 12-34" className="text-xs" />
          </div>

          <Button type="submit" disabled={isPending} className="w-full bg-brand text-brand-foreground text-xs">
            {isPending ? "Guardando..." : "Guardar Proveedor"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ModalNuevaFactura({
  open,
  onOpenChange,
  suppliers,
  inventoryItems,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suppliers: ProveedorItem[];
  inventoryItems: InsumoItem[];
}) {
  const [isPending, startTransition] = useTransition();
  const [supplierId, setSupplierId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split("T")[0]);
  const [includesTax, setIncludesTax] = useState(true);
  const [notes, setNotes] = useState("");
  const [busquedaInsumo, setBusquedaInsumo] = useState("");

  // Renglones dinámicos de insumos recibidos en la factura
  const [renglones, setRenglones] = useState<
    Array<{ inventoryItemId: string; name: string; unit: string; quantity: number; unitCostCop: number; taxRateBp: number }>
  >([]);

  const agregarOIncrementarInsumo = (item: InsumoItem) => {
    setRenglones((prev) => {
      const existe = prev.find((r) => r.inventoryItemId === item.id);
      if (existe) {
        return prev.map((r) =>
          r.inventoryItemId === item.id ? { ...r, quantity: r.quantity + 1 } : r
        );
      }
      return [
        ...prev,
        {
          inventoryItemId: item.id,
          name: item.name,
          unit: item.unit,
          quantity: 1,
          unitCostCop: item.costCop,
          taxRateBp: 0,
        },
      ];
    });
  };

  const quitarRenglon = (idx: number) => {
    setRenglones(renglones.filter((_, i) => i !== idx));
  };

  const actualizarRenglon = (
    idx: number,
    campo: "quantity" | "unitCostCop" | "taxRateBp",
    valor: number
  ) => {
    const copia = [...renglones];
    copia[idx] = { ...copia[idx], [campo]: valor };
    setRenglones(copia);
  };

  // Cálculos de totales
  const subtotalCOP = renglones.reduce((acc, r) => acc + r.quantity * r.unitCostCop, 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoiceNumber.trim()) {
      toast.error("Ingresá el número de factura del proveedor.");
      return;
    }
    if (renglones.length === 0) {
      toast.error("Hacé clic en los insumos del catálogo de la izquierda para agregarlos al comprobante de compra.");
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.append("supplierId", supplierId);
      formData.append("invoiceNumber", invoiceNumber);
      formData.append("invoiceDate", invoiceDate);
      formData.append("includesTax", String(includesTax));
      formData.append("itemsJson", JSON.stringify(renglones));
      formData.append("notes", notes);

      const res = await crearFacturaCompra(ESTADO_INICIAL, formData);
      if (res.ok) {
        toast.success("Factura de compra registrada e inventario actualizado.");
        onOpenChange(false);
        setRenglones([]);
        setInvoiceNumber("");
      } else {
        toast.error(res.error || "Ocurrió un error al guardar la factura.");
      }
    });
  };

  const insumosFiltrados = inventoryItems.filter(
    (i) =>
      !busquedaInsumo ||
      i.name.toLowerCase().includes(busquedaInsumo.toLowerCase()) ||
      (i.sku && i.sku.toLowerCase().includes(busquedaInsumo.toLowerCase()))
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" className="bg-brand text-brand-foreground hover:bg-brand/90 text-xs shadow-xs font-medium h-7 sm:h-8 gap-1.5 rounded-md px-2.5">
          <Plus className="size-3.5 mr-1" />
          <span>Cargar Factura de Compra</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-hidden flex flex-col p-0 rounded-2xl">
        <DialogHeader className="p-4 border-b border-border bg-muted/30 flex items-center justify-between">
          <DialogTitle className="text-base font-bold flex items-center gap-2">
            <FileText className="size-5 text-brand" />
            <span>Carga Express de Factura de Compra (POS de Compras)</span>
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex-1 overflow-hidden flex flex-col">
          {/* Cuerpo dividido en 2 columnas (Izquierda: Catálogo | Derecha: Comprobante) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 overflow-hidden divide-y lg:divide-y-0 lg:divide-x divide-border">
            
            {/* ── PANEL IZQUIERDO: CATALOGO RAPIDO DE INSUMOS (5 COLS / 40%) ── */}
            <div className="lg:col-span-5 p-4 space-y-3 bg-muted/10 flex flex-col overflow-hidden">
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
                  1. Elegir Insumos a Ingresar
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 size-3.5 text-muted-foreground" />
                  <Input
                    value={busquedaInsumo}
                    onChange={(e) => setBusquedaInsumo(e.target.value)}
                    placeholder="🔍 Buscar insumo..."
                    className="h-8 pl-8 text-xs bg-background rounded-lg"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
                {insumosFiltrados.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-4 text-center">No se encontraron insumos.</p>
                ) : (
                  insumosFiltrados.map((item) => {
                    const renglon = renglones.find((r) => r.inventoryItemId === item.id);
                    const cantStaged = renglon?.quantity ?? 0;

                    return (
                      <div
                        key={item.id}
                        onClick={() => agregarOIncrementarInsumo(item)}
                        className={cn(
                          "p-2.5 rounded-xl border bg-card hover:border-brand/60 transition-all cursor-pointer flex items-center justify-between select-none",
                          cantStaged > 0 ? "border-brand bg-brand/5 shadow-xs" : "border-border"
                        )}
                      >
                        <div className="space-y-0.5">
                          <span className="font-semibold text-xs text-foreground block line-clamp-1">
                            {item.name}
                          </span>
                          <span className="text-rotulo text-muted-foreground font-mono block">
                            Unidad: {item.unit} | Costo ref: {formatCop(item.costCop)}
                          </span>
                        </div>

                        {cantStaged > 0 ? (
                          <Badge className="bg-brand text-brand-foreground text-xs font-bold px-2 py-0.5 rounded-full">
                            +{cantStaged}
                          </Badge>
                        ) : (
                          <Button type="button" size="sm" variant="ghost" className="h-7 text-rotulo font-bold gap-1 px-2">
                            <Plus className="size-3" /> Agregar
                          </Button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* ── PANEL DERECHO: DETALLE DE LA FACTURA (7 COLS / 60%) ── */}
            <div className="lg:col-span-7 p-4 space-y-4 flex flex-col overflow-hidden bg-background">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
                2. Encabezado y Renglones de la Compra
              </label>

              {/* Campos Principales */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl bg-muted/30 border border-border">
                <div className="space-y-1">
                  <label className="text-xs font-semibold">Proveedor</label>
                  <select
                    value={supplierId}
                    onChange={(e) => setSupplierId(e.target.value)}
                    className="w-full h-8 rounded-lg border border-input px-2 text-xs bg-background font-medium"
                  >
                    <option value="">-- Varios / Sin Proveedor --</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} {s.taxId ? `(${s.taxId})` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold">Número de Factura *</label>
                  <Input
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    placeholder="FAC-9876"
                    required
                    className="h-8 text-xs rounded-lg bg-background"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold">Fecha Factura *</label>
                  <Input
                    type="date"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    required
                    className="h-8 text-xs rounded-lg bg-background"
                  />
                </div>

                <div className="flex items-center gap-2 pt-4">
                  <input
                    type="checkbox"
                    id="includesTax"
                    checked={includesTax}
                    onChange={(e) => setIncludesTax(e.target.checked)}
                    className="accent-primary size-4"
                  />
                  <label htmlFor="includesTax" className="text-xs font-medium cursor-pointer">
                    Costos incluyen IVA / Impuestos
                  </label>
                </div>
              </div>

              {/* Tabla de Renglones Seleccionados */}
              <div className="flex-1 overflow-y-auto space-y-2 border border-border rounded-xl p-2 bg-card">
                {renglones.length === 0 ? (
                  <div className="p-8 text-center space-y-1 text-muted-foreground">
                    <p className="text-xs font-semibold">No se han agregado insumos</p>
                    <p className="text-rotulo">Hacé clic en los insumos del panel izquierdo para ir armando el comprobante de compra.</p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {renglones.map((r, idx) => (
                      <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-muted/40 border border-border text-xs">
                        <div className="flex-1 min-w-0">
                          <strong className="text-foreground block truncate">{r.name}</strong>
                          <span className="text-rotulo text-muted-foreground font-mono">Unidad: {r.unit}</span>
                        </div>

                        <div className="w-20">
                          <label className="text-rotulo text-muted-foreground block font-semibold">Cantidad</label>
                          <Input
                            type="number"
                            min="1"
                            value={r.quantity}
                            onChange={(e) => actualizarRenglon(idx, "quantity", Math.max(1, Number(e.target.value)))}
                            className="h-7 text-xs px-1.5 font-bold"
                          />
                        </div>

                        <div className="w-28">
                          <label className="text-rotulo text-muted-foreground block font-semibold">Costo COP</label>
                          <Input
                            type="number"
                            min="0"
                            value={r.unitCostCop}
                            onChange={(e) => actualizarRenglon(idx, "unitCostCop", Math.max(0, Number(e.target.value)))}
                            className="h-7 text-xs px-1.5 font-bold"
                          />
                        </div>

                        <div className="w-24 text-right pr-1">
                          <label className="text-rotulo text-muted-foreground block font-semibold">Subtotal</label>
                          <span className="numeral font-bold text-xs text-foreground">
                            {formatCop(r.quantity * r.unitCostCop)}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => quitarRenglon(idx)}
                          className="text-muted-foreground hover:text-destructive p-1"
                        >
                          <X className="size-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Pie de Totales y Envío */}
              <div className="space-y-3 pt-2 border-t border-border">
                <div className="flex items-center justify-between p-3 rounded-xl bg-brand/5 border border-brand/20">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Total Factura Compra
                  </span>
                  <span className="numeral text-xl font-extrabold text-brand">
                    {formatCop(subtotalCOP)}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <Input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Notas opcionales de la compra..."
                    className="h-9 text-xs rounded-xl flex-1"
                  />
                  <Button
                    type="submit"
                    disabled={isPending || renglones.length === 0}
                    className="h-9 bg-brand text-brand-foreground font-bold text-xs rounded-xl px-4"
                  >
                    {isPending ? "Guardando..." : "🚀 Guardar e Incrementar Stock"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TarjetaFacturaCompra({ factura }: { factura: FacturaItem }) {
  return (
    <Card className="p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm text-foreground">Factura #{factura.invoiceNumber}</span>
            <Badge variant="outline" className="text-rotulo">
              {factura.includesTax ? "Con IVA Incluido" : "Sin IVA"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Proveedor: {factura.supplier ? factura.supplier.name : "Sin especificar"} | Fecha: {formatDayInTimeZone(factura.invoiceDate, "America/Bogota")}
          </p>
        </div>

        <span className="numeral text-base font-bold text-success-soft">
          {formatCop(factura.totalCop)}
        </span>
      </div>

      <div className="text-xs space-y-1 pt-2 border-t border-border/60">
        <span className="font-semibold text-muted-foreground">Insumos Ingresados:</span>
        <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
          {factura.items.map((it) => (
            <li key={it.id}>
              <strong className="text-foreground">{it.inventoryItem.name}</strong>: {it.quantity} {it.inventoryItem.unit} @ {formatCop(it.unitCostCop)} = <span className="font-semibold text-foreground">{formatCop(it.totalCop)}</span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

function TarjetaRecetaProducto({
  producto,
  inventoryItems,
}: {
  producto: ProductoReceta;
  inventoryItems: Array<{ id: string; name: string; unit: string; costCop: number }>;
}) {
  const [openModal, setOpenModal] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Renglones de la receta
  const [items, setItems] = useState<Array<{ inventoryItemId: string; quantityRequired: number }>>(
    producto.recipeItems.map((r) => ({
      inventoryItemId: r.inventoryItem.id,
      quantityRequired: r.quantityRequired,
    }))
  );

  const agregarItemReceta = () => {
    if (inventoryItems.length === 0) return;
    setItems([
      ...items,
      { inventoryItemId: inventoryItems[0].id, quantityRequired: 1 },
    ]);
  };

  const quitarItemReceta = (idx: number) => {
    setItems(items.filter((_, i) => i !== idx));
  };

  const actualizarItemReceta = (
    idx: number,
    campo: "inventoryItemId" | "quantityRequired",
    valor: string | number
  ) => {
    const copia = [...items];
    copia[idx] = { ...copia[idx], [campo]: valor };
    setItems(copia);
  };

  // Costo total de alimentos (Food Cost)
  let costoAlimentosCOP = 0;
  for (const r of producto.recipeItems) {
    costoAlimentosCOP += r.quantityRequired * r.inventoryItem.costCop;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const formData = new FormData();
      formData.append("productId", producto.id);
      formData.append("itemsJson", JSON.stringify(items));

      const res = await guardarReceta(ESTADO_INICIAL, formData);
      if (res.ok) {
        toast.success(`Receta de ${producto.name} guardada.`);
        setOpenModal(false);
      } else {
        toast.error(res.error || "Ocurrió un error.");
      }
    });
  };

  const porcionesDisponibles = calcularStockDisponibleProducto(producto);

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="font-bold text-sm text-foreground">{producto.name}</h4>
          <p className="text-xs text-muted-foreground">Categoría: {producto.category.name} | Precio Venta: {formatCop(producto.priceCop)}</p>
        </div>

        <Dialog open={openModal} onOpenChange={setOpenModal}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1">
              <Settings2 className="size-3.5" />
              <span>Editar Receta</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Receta / Escandallo de {producto.name}</DialogTitle>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4 pt-2">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold">Insumos Requeridos por Porción</label>
                  <Button type="button" size="sm" variant="outline" onClick={agregarItemReceta} className="h-7 text-xs gap-1">
                    <Plus className="size-3" />
                    <span>Agregar Insumo</span>
                  </Button>
                </div>

                {items.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic py-2">
                    Sin receta configurada. Hacé clic en &quot;Agregar Insumo&quot;.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {items.map((it, idx) => (
                      <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 border border-border">
                        <select
                          value={it.inventoryItemId}
                          onChange={(e) => actualizarItemReceta(idx, "inventoryItemId", e.target.value)}
                          className="flex-1 h-8 rounded border border-input px-2 text-xs bg-background"
                        >
                          {inventoryItems.map((ins) => (
                            <option key={ins.id} value={ins.id}>
                              {ins.name} ({ins.unit})
                            </option>
                          ))}
                        </select>

                        <Input
                          type="number"
                          min="1"
                          placeholder="Cant."
                          value={it.quantityRequired}
                          onChange={(e) => actualizarItemReceta(idx, "quantityRequired", Number(e.target.value))}
                          className="w-24 h-8 text-xs"
                        />

                        <button
                          type="button"
                          onClick={() => quitarItemReceta(idx)}
                          className="p-1 text-muted-foreground hover:text-destructive-soft"
                        >
                          <X className="size-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Button type="submit" disabled={isPending} className="w-full bg-brand text-brand-foreground text-xs">
                {isPending ? "Guardando..." : "Guardar Receta"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="text-xs space-y-1 pt-2 border-t border-border/60">
        <div className="flex items-center justify-between text-muted-foreground font-medium pb-1 flex-wrap gap-2">
          <span>Insumos por porción:</span>
          <div className="flex items-center gap-2">
            {porcionesDisponibles !== null && (
              <span
                className={cn(
                  "px-2 py-0.5 rounded-md font-bold text-rotulo border flex items-center gap-1",
                  porcionesDisponibles === 0
                    ? "bg-destructive/10 text-destructive-soft border-destructive/30 dark:text-destructive-soft"
                    : porcionesDisponibles <= 5
                    ? "bg-warning/10 text-warning-soft border-warning/30 dark:text-warning-soft"
                    : "bg-success/10 text-success-soft border-success/30 dark:text-success-soft"
                )}
              >
                📦 {porcionesDisponibles} porción{porcionesDisponibles === 1 ? "" : "es"} preparable{porcionesDisponibles === 1 ? "" : "s"}
              </span>
            )}
            <span>Costo Alimentos: <strong className="text-success-soft">{formatCop(costoAlimentosCOP)}</strong></span>
          </div>
        </div>

        {producto.recipeItems.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">Sin ingredientes asignados.</p>
        ) : (
          <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
            {producto.recipeItems.map((r) => (
              <li key={r.id}>
                <strong className="text-foreground">{r.inventoryItem.name}</strong>: {r.quantityRequired} {r.inventoryItem.unit}
              </li>
            ))}
          </ul>
        )}

        {/* Lo que aportan los modificadores. En solo lectura: se editan donde se
            definen, para no tener dos lugares que escriban lo mismo. */}
        {producto.modifierGroups.length > 0 && (
          <div className="pt-2 mt-2 border-t border-border/60 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-muted-foreground font-medium">Según lo que se elija:</span>
              <Link
                href="/administracion/carta/modificadores"
                className="text-brand text-rotulo font-semibold hover:underline"
              >
                Editar modificadores ↗
              </Link>
            </div>

            {producto.modifierGroups.map((asignado) => (
              <div key={asignado.group.id} className="space-y-0.5">
                <span className="text-rotulo font-bold uppercase tracking-wider text-muted-foreground">
                  {asignado.group.name}
                  {!asignado.required && " (opcional)"}
                </span>
                <ul className="list-disc list-inside space-y-0.5 text-muted-foreground pl-1">
                  {asignado.group.options.map((opcion) => (
                    <li key={opcion.id}>
                      <strong className="text-foreground">{opcion.name}</strong>
                      {opcion.supplies.length === 0 ? (
                        <span className="italic"> — sin insumos</span>
                      ) : (
                        <>
                          :{" "}
                          {opcion.supplies
                            .map(
                              (s) =>
                                `${s.quantityRequired} ${s.inventoryItem.unit} de ${s.inventoryItem.name}`,
                            )
                            .join(", ")}
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            {producto.recipeNeedsModifiers && (
              <p className="text-rotulo text-warning-soft font-medium">
                No descuenta nada hasta que se eligen los modificadores al tomar el pedido.
              </p>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

function SeccionProductosTerminados({
  products,
  categories,
}: {
  products: ProductoTerminadoItem[];
  categories: Array<{ id: string; name: string }>;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [categoriaSel, setCategoriaSel] = useState<string | null>(null);

  const categoriasMap = new Map<string, { id: string; name: string; count: number }>();
  for (const p of products) {
    const cat = p.category;
    const actual = categoriasMap.get(cat.id);
    if (actual) {
      actual.count++;
    } else {
      categoriasMap.set(cat.id, { id: cat.id, name: cat.name, count: 1 });
    }
  }

  const categoriasList = Array.from(categoriasMap.values());

  const productosFiltrados = products.filter((p) => {
    const coincideCat = categoriaSel === null || p.category.id === categoriaSel;
    const coincideBusqueda =
      !busqueda ||
      p.name.toLowerCase().includes(busqueda.toLowerCase()) ||
      (p.sku && p.sku.toLowerCase().includes(busqueda.toLowerCase()));
    return coincideCat && coincideBusqueda;
  });

  return (
    <div className="space-y-4 pt-2">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <button
            type="button"
            onClick={() => setCategoriaSel(null)}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all border flex items-center gap-1.5",
              categoriaSel === null
                ? "bg-brand text-brand-foreground border-brand font-bold shadow-xs"
                : "bg-card text-muted-foreground hover:text-foreground border-border"
            )}
          >
            <Filter className="size-3.5" />
            <span>Todas ({products.length})</span>
          </button>
          {categoriasList.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategoriaSel(categoriaSel === c.id ? null : c.id)}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all border flex items-center gap-1.5",
                categoriaSel === c.id
                  ? "bg-brand text-brand-foreground border-brand font-bold shadow-xs"
                  : "bg-card text-muted-foreground hover:text-foreground border-border"
              )}
            >
              <ShoppingBag className="size-3.5" />
              <span>{c.name} ({c.count})</span>
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-2.5 size-3.5 text-muted-foreground" />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="🔍 Buscar bebida o producto..."
            className="h-9 pl-8 text-xs rounded-xl"
          />
        </div>
      </div>

      {productosFiltrados.length === 0 ? (
        <Card className="p-8 text-center border-dashed space-y-2">
          <ShoppingBag className="size-8 mx-auto text-muted-foreground opacity-50" />
          <p className="text-sm font-semibold text-foreground">No hay bebidas ni productos terminados en esta vista</p>
          <p className="text-xs text-muted-foreground">
            Probá seleccionando otra categoría o cambiando el texto de búsqueda.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {productosFiltrados.map((prod) => (
            <CardProductoTerminado key={prod.id} producto={prod} categories={categories} />
          ))}
        </div>
      )}
    </div>
  );
}

function CardProductoTerminado({
  producto,
  categories,
}: {
  producto: ProductoTerminadoItem;
  categories: Array<{ id: string; name: string }>;
}) {
  const [openModalStock, setOpenModalStock] = useState(false);
  const [openModalEdit, setOpenModalEdit] = useState(false);
  const [stockInput, setStockInput] = useState(String(producto.stockQty));
  const [isPending, startTransition] = useTransition();

  const esSinStock = producto.stockQty <= 0;
  const esBajoStock = producto.stockQty > 0 && producto.stockQty <= 5;
  const costoCompra = producto.recipeItems[0]?.inventoryItem.costCop ?? 0;
  const gananciaCop = producto.priceCop - costoCompra;

  const handleSubmitStock = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await actualizarStockProductoTerminado(
        ESTADO_INICIAL,
        new FormData(e.currentTarget)
      );
      if (res.ok) {
        toast.success(`Stock de ${producto.name} actualizado a ${stockInput} unidades.`);
        setOpenModalStock(false);
      } else {
        toast.error(res.error || "Ocurrió un error al actualizar el stock.");
      }
    });
  };

  return (
    <Card className="p-4 space-y-3 flex flex-col justify-between hover:border-brand/50 transition-all">
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <Badge variant="outline" className="text-rotulo uppercase font-mono">
            {producto.category.name}
          </Badge>
          <span
            className={cn(
              "px-2 py-0.5 rounded text-rotulo font-bold font-mono border",
              esSinStock
                ? "bg-destructive/10 text-destructive-soft border-destructive/30 dark:text-destructive-soft"
                : esBajoStock
                ? "bg-warning/10 text-warning-soft border-warning/30 dark:text-warning-soft"
                : "bg-success/10 text-success-soft border-success/30 dark:text-success-soft"
            )}
          >
            {esSinStock ? "AGOTADO" : esBajoStock ? "STOCK BAJO" : "EN STOCK"}
          </span>
        </div>

        <div>
          <h4 className="font-bold text-sm text-foreground line-clamp-1">{producto.name}</h4>

          <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
            <div>
              <span className="text-rotulo text-muted-foreground block font-mono">Costo Compra</span>
              <span className="numeral font-bold text-xs text-muted-foreground">{formatCop(costoCompra)}</span>
            </div>
            <div>
              <span className="text-rotulo text-muted-foreground block font-mono">Precio Venta</span>
              <span className="numeral font-bold text-xs text-brand">{formatCop(producto.priceCop)}</span>
            </div>
          </div>
          {costoCompra > 0 && (
            <p className="text-rotulo text-success-soft font-mono font-semibold pt-0.5">
              Margen: +{formatCop(gananciaCop)} / und.
            </p>
          )}
        </div>
      </div>

      <div className="pt-2 border-t border-border flex items-center justify-between gap-2">
        <div>
          <span className="text-rotulo text-muted-foreground block uppercase font-mono">Stock</span>
          <span className="numeral font-extrabold text-base text-foreground">
            {producto.stockQty} <span className="text-xs font-normal text-muted-foreground">und.</span>
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setOpenModalEdit(true)}
            className="size-8 p-0 text-muted-foreground hover:text-foreground border-border"
            title="Editar producto o corregir nombre"
          >
            <Edit className="size-3.5" />
          </Button>

          <Button
            size="sm"
            onClick={() => setOpenModalStock(true)}
            className="bg-brand text-brand-foreground hover:bg-brand/90 text-xs shadow-xs font-medium h-8 gap-1 px-2.5"
          >
            <Plus className="size-3.5 mr-0.5" />
            <span>Stock</span>
          </Button>
        </div>

        {/* Modal Editar Producto / Corregir Nombre */}
        <ModalEditarProductoTerminado
          producto={producto}
          open={openModalEdit}
          onOpenChange={setOpenModalEdit}
          categories={categories}
        />

        {/* Modal Ajustar Stock */}
        <Dialog open={openModalStock} onOpenChange={setOpenModalStock}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base font-bold flex items-center gap-2">
                <Boxes className="size-4 text-brand" />
                <span>Ingresar / Ajustar Stock Directo</span>
              </DialogTitle>
            </DialogHeader>

            <form onSubmit={handleSubmitStock} className="space-y-4 pt-2">
              <input type="hidden" name="productId" value={producto.id} />
              
              <div className="space-y-1 p-3 rounded-xl bg-muted/40 border border-border">
                <label className="text-xs font-semibold text-muted-foreground block">Producto de Reventa</label>
                <p className="text-sm font-bold text-foreground">{producto.name}</p>
                <p className="text-xs font-mono text-brand">Categoría: {producto.category.name} | Precio: {formatCop(producto.priceCop)}</p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold">Stock Físico Actual (Unidades) *</label>
                <Input
                  name="stockQty"
                  type="number"
                  min="0"
                  value={stockInput}
                  onChange={(e) => setStockInput(e.target.value)}
                  placeholder="Ej. 24"
                  required
                  className="text-sm font-bold"
                />
                <p className="text-rotulo text-muted-foreground">
                  Ingresá el número total de unidades reales disponibles en bodega/refrigerador.
                </p>
              </div>

              <Button type="submit" disabled={isPending} className="w-full bg-brand text-brand-foreground text-xs font-bold h-9">
                {isPending ? "Guardando..." : "🚀 Actualizar Stock en Inventario"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </Card>
  );
}

function ModalNuevoProductoTerminado({
  open,
  onOpenChange,
  categories,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Array<{ id: string; name: string }>;
}) {
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const res = await crearProductoTerminado(ESTADO_INICIAL, formData);
      if (res.ok) {
        toast.success("Bebida / producto registrado correctamente en el inventario.");
        onOpenChange(false);
      } else {
        toast.error(res.error || "Ocurrió un error al registrar el producto.");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" className="bg-brand text-brand-foreground hover:bg-brand/90 text-xs shadow-xs font-medium h-7 sm:h-8 gap-1.5 rounded-md px-2.5">
          <Plus className="size-3.5 mr-1" />
          <span>Nueva Bebida / Prod. Terminado</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-bold flex items-center gap-2">
            <ShoppingBag className="size-4 text-brand" />
            <span>Agregar Bebida o Producto Terminado</span>
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-1">
            <label className="text-xs font-semibold">Nombre de la Bebida / Producto *</label>
            <Input name="name" placeholder="Ej. Coca-Cola 350ml, Cerveza Club Colombia, Agua Mineral" required className="text-xs font-semibold" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold">Categoría *</label>
              <select name="categoryId" required className="w-full h-9 rounded-md border border-input px-2 text-xs bg-background font-medium">
                <option value="">-- Elegir Categoría --</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold">SKU / Código</label>
              <Input name="sku" placeholder="BEB-001" className="text-xs" />
            </div>
          </div>

          {/* Costo de Compra + Precio de Venta COP */}
          <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-muted/30 border border-border">
            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground">🛒 Costo Compra COP *</label>
              <Input name="costCop" type="number" min="0" defaultValue="2500" required className="text-xs font-bold" />
              <span className="text-rotulo text-muted-foreground block">¿En cuánto se compró?</span>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-brand">💰 Precio Venta COP *</label>
              <Input name="priceCop" type="number" min="0" defaultValue="4500" required className="text-xs font-bold" />
              <span className="text-rotulo text-muted-foreground block">¿En cuánto se vende?</span>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold">Stock Inicial Disponible (Unidades) *</label>
            <Input name="stockQty" type="number" min="0" defaultValue="12" required className="text-xs font-bold" />
            <p className="text-rotulo text-muted-foreground">
              Unidades reales iniciales disponibles en refrigerador/bodega.
            </p>
          </div>

          <Button type="submit" disabled={isPending} className="w-full bg-brand text-brand-foreground text-xs font-bold h-9">
            {isPending ? "Guardando..." : "🚀 Registrar Producto en Inventario"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ModalEditarProductoTerminado({
  producto,
  open,
  onOpenChange,
  categories,
}: {
  producto: ProductoTerminadoItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Array<{ id: string; name: string }>;
}) {
  const [isPending, startTransition] = useTransition();

  const costoActual = producto.recipeItems[0]?.inventoryItem.costCop ?? 0;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.append("productId", producto.id);

    startTransition(async () => {
      const res = await editarProductoTerminado(ESTADO_INICIAL, formData);
      if (res.ok) {
        toast.success(`Producto ${producto.name} actualizado correctamente.`);
        onOpenChange(false);
      } else {
        toast.error(res.error || "Ocurrió un error al actualizar el producto.");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-bold flex items-center gap-2">
            <Edit className="size-4 text-brand" />
            <span>Editar Bebida / Producto (Corregir Datos)</span>
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-1">
            <label className="text-xs font-semibold">Nombre de la Bebida / Producto *</label>
            <Input name="name" defaultValue={producto.name} required className="text-xs font-semibold" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold">Categoría *</label>
              <select name="categoryId" defaultValue={producto.category.id} required className="w-full h-9 rounded-md border border-input px-2 text-xs bg-background font-medium">
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold">SKU / Código</label>
              <Input name="sku" defaultValue={producto.sku ?? ""} className="text-xs" />
            </div>
          </div>

          {/* Costo de Compra + Precio de Venta COP */}
          <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-muted/30 border border-border">
            <div className="space-y-1">
              <label className="text-xs font-bold text-muted-foreground">🛒 Costo Compra COP *</label>
              <Input name="costCop" type="number" min="0" defaultValue={costoActual} required className="text-xs font-bold" />
              <span className="text-rotulo text-muted-foreground block">Costo unitario de proveedor</span>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-brand">💰 Precio Venta COP *</label>
              <Input name="priceCop" type="number" min="0" defaultValue={producto.priceCop} required className="text-xs font-bold" />
              <span className="text-rotulo text-muted-foreground block">Precio al cliente final</span>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold">Stock Físico Disponible (Unidades) *</label>
            <Input name="stockQty" type="number" min="0" defaultValue={producto.stockQty} required className="text-xs font-bold" />
          </div>

          <Button type="submit" disabled={isPending} className="w-full bg-brand text-brand-foreground text-xs font-bold h-9">
            {isPending ? "Guardando..." : "Guardar Cambios del Producto"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
