"use client";

import { useState, useTransition } from "react";
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
  crearFacturaCompra,
  crearInsumo,
  crearProveedor,
  editarInsumo,
  guardarReceta,
} from "@/features/inventario/actions";
import { ESTADO_INICIAL } from "@/lib/actions/estado";
import { formatCop } from "@/lib/money";
import { formatDayInTimeZone } from "@/lib/time";
import { toast } from "sonner";
import {
  Boxes,
  FileText,
  Truck,
  BookOpen,
  Plus,
  Search,
  AlertTriangle,
  Settings2,
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
  category: { name: string };
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
  recipesEnabled: boolean;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [openInsumoModal, setOpenInsumoModal] = useState(false);
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
            <p className="numeral text-2xl font-bold text-emerald-600 dark:text-emerald-400">
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
              <p className={`numeral text-2xl font-bold ${summary.bajoStockCount > 0 ? "text-rose-600 dark:text-rose-400" : "text-foreground"}`}>
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
      <Tabs defaultValue="stock" className="w-full">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 border-b border-border pb-3">
          <TabsList className="flex flex-wrap h-auto p-1 bg-muted/60">
            <TabsTrigger value="stock" className="text-xs font-semibold gap-1.5">
              <Boxes className="size-3.5" />
              <span>Stock e Insumos ({summary.totalItems})</span>
            </TabsTrigger>
            <TabsTrigger value="facturas" className="text-xs font-semibold gap-1.5">
              <FileText className="size-3.5" />
              <span>Facturas de Compra ({invoices.length})</span>
            </TabsTrigger>
            {recipesEnabled && (
              <TabsTrigger value="recetas" className="text-xs font-semibold gap-1.5">
                <BookOpen className="size-3.5" />
                <span>Recetas / Escandallos</span>
              </TabsTrigger>
            )}
            <TabsTrigger value="proveedores" className="text-xs font-semibold gap-1.5">
              <Truck className="size-3.5" />
              <span>Proveedores ({suppliers.length})</span>
            </TabsTrigger>
          </TabsList>

          {/* Acciones Rápidas */}
          <div className="flex items-center gap-2 flex-wrap">
            <ModalNuevoInsumo open={openInsumoModal} onOpenChange={setOpenInsumoModal} />
            <ModalNuevaFactura
              open={openFacturaModal}
              onOpenChange={setOpenFacturaModal}
              suppliers={suppliers}
              inventoryItems={summary.items}
            />
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
                    {sup.taxId && <Badge variant="outline" className="text-[10px]">{sup.taxId}</Badge>}
                  </div>
                  {sup.phone && <p className="text-xs text-muted-foreground">Tel: {sup.phone}</p>}
                  {sup.email && <p className="text-xs text-muted-foreground">Correo: {sup.email}</p>}
                  {sup.address && <p className="text-xs text-muted-foreground">Dirección: {sup.address}</p>}
                  <p className="text-[11px] font-semibold text-brand dark:text-[#3E9EA2] pt-1">
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
    <Card className={`p-4 space-y-3 border ${bajoStock ? "border-rose-500/50 bg-rose-500/5" : "border-border"}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="font-bold text-sm text-foreground">{item.name}</h4>
          {item.sku && <p className="text-[11px] text-muted-foreground font-mono">SKU: {item.sku}</p>}
        </div>

        <Badge
          variant="outline"
          className={`text-[11px] font-semibold ${
            bajoStock
              ? "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300"
              : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          }`}
        >
          {bajoStock ? "Bajo Stock" : "Stock Normal"}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-border/60">
        <div>
          <span className="text-muted-foreground block text-[11px]">Stock Actual</span>
          <span className="numeral font-bold text-sm text-foreground">
            {item.stockCurrent} {item.unit}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground block text-[11px]">Stock Mínimo</span>
          <span className="numeral font-medium text-xs text-muted-foreground">
            {item.stockMin} {item.unit}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground block text-[11px]">Costo Unitario</span>
          <span className="numeral font-medium text-xs text-foreground">
            {formatCop(item.costCop)} / {item.unit}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground block text-[11px]">Valor Total</span>
          <span className="numeral font-bold text-xs text-emerald-600 dark:text-emerald-400">
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
        <Button size="sm" className="bg-brand text-brand-foreground hover:bg-brand/90 text-xs">
          <Plus className="size-3.5 mr-1" />
          Cargar Insumo / Stock Inicial
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
        <Button size="sm" variant="outline" className="text-xs gap-1">
          <Plus className="size-3.5" />
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

  // Renglones dinámicos de insumos recibidos en la factura
  const [renglones, setRenglones] = useState<Array<{ inventoryItemId: string; quantity: number; unitCostCop: number; taxRateBp: number }>>([]);

  const agregarRenglon = () => {
    if (inventoryItems.length === 0) return;
    setRenglones([
      ...renglones,
      { inventoryItemId: inventoryItems[0].id, quantity: 1, unitCostCop: inventoryItems[0].costCop, taxRateBp: 0 },
    ]);
  };

  const quitarRenglon = (idx: number) => {
    setRenglones(renglones.filter((_, i) => i !== idx));
  };

  const actualizarRenglon = (
    idx: number,
    campo: "inventoryItemId" | "quantity" | "unitCostCop" | "taxRateBp",
    valor: string | number
  ) => {
    const copia = [...renglones];
    copia[idx] = { ...copia[idx], [campo]: valor };
    setRenglones(copia);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoiceNumber) {
      toast.error("Ingresá el número de factura.");
      return;
    }
    if (renglones.length === 0) {
      toast.error("Agregá al menos un insumo a la factura.");
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" className="bg-brand text-brand-foreground hover:bg-brand/90 text-xs">
          <Plus className="size-3.5 mr-1" />
          Cargar Factura de Compra
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cargar Factura de Compra (Entrada de Insumos)</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold">Proveedor</label>
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="w-full h-9 rounded-md border border-input px-3 text-xs bg-background"
              >
                <option value="">-- Sin proveedor / Varios --</option>
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
                placeholder="FACT-12345"
                required
                className="text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold">Fecha de Factura *</label>
              <Input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                required
                className="text-xs"
              />
            </div>

            <div className="flex items-center gap-2 pt-6">
              <input
                type="checkbox"
                id="includesTax"
                checked={includesTax}
                onChange={(e) => setIncludesTax(e.target.checked)}
                className="accent-primary size-4"
              />
              <label htmlFor="includesTax" className="text-xs font-medium cursor-pointer">
                Los costos ingresados ya incluyen IVA / Impuesto
              </label>
            </div>
          </div>

          {/* Renglones de Insumos */}
          <div className="space-y-2 border-t border-border pt-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-foreground">Insumos Recibidos en la Factura</label>
              <Button type="button" size="sm" variant="outline" onClick={agregarRenglon} className="h-7 text-xs gap-1">
                <Plus className="size-3" />
                <span>Agregar Insumo</span>
              </Button>
            </div>

            {renglones.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-2">
                Hacé clic en &quot;Agregar Insumo&quot; para registrar los insumos de esta factura.
              </p>
            ) : (
              <div className="space-y-2">
                {renglones.map((r, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 border border-border">
                    <select
                      value={r.inventoryItemId}
                      onChange={(e) => actualizarRenglon(idx, "inventoryItemId", e.target.value)}
                      className="flex-1 h-8 rounded border border-input px-2 text-xs bg-background"
                    >
                      {inventoryItems.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} ({item.unit})
                        </option>
                      ))}
                    </select>

                    <Input
                      type="number"
                      min="1"
                      placeholder="Cant."
                      value={r.quantity}
                      onChange={(e) => actualizarRenglon(idx, "quantity", Number(e.target.value))}
                      className="w-20 h-8 text-xs"
                    />

                    <Input
                      type="number"
                      min="0"
                      placeholder="Costo COP"
                      value={r.unitCostCop}
                      onChange={(e) => actualizarRenglon(idx, "unitCostCop", Number(e.target.value))}
                      className="w-28 h-8 text-xs"
                    />

                    <button
                      type="button"
                      onClick={() => quitarRenglon(idx)}
                      className="p-1 text-muted-foreground hover:text-rose-600"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1 pt-2">
            <label className="text-xs font-semibold">Notas / Observaciones de la Factura</label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notas opcionales sobre la compra o entrega..."
              className="text-xs"
            />
          </div>

          <Button type="submit" disabled={isPending} className="w-full bg-brand text-brand-foreground text-xs mt-4">
            {isPending ? "Guardando..." : "Guardar Factura e Incrementar Stock"}
          </Button>
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
            <Badge variant="outline" className="text-[10px]">
              {factura.includesTax ? "Con IVA Incluido" : "Sin IVA"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Proveedor: {factura.supplier ? factura.supplier.name : "Sin especificar"} | Fecha: {formatDayInTimeZone(factura.invoiceDate, "America/Bogota")}
          </p>
        </div>

        <span className="numeral text-base font-bold text-emerald-600 dark:text-emerald-400">
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
                          className="p-1 text-muted-foreground hover:text-rose-600"
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
        <div className="flex justify-between text-muted-foreground font-medium pb-1">
          <span>Insumos por porción:</span>
          <span>Costo Alimentos: <strong className="text-emerald-600 dark:text-emerald-400">{formatCop(costoAlimentosCOP)}</strong></span>
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
      </div>
    </Card>
  );
}
