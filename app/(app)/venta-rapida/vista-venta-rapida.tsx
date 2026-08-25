"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  CheckCircle2,
  Clock,
  Minus,
  Plus,
  QrCode,
  RotateCcw,
  ScanLine,
  Search,
  ShoppingBag,
  Trash2,
  X,
} from "lucide-react";
import { abrirCaja } from "@/features/caja/actions";
import { procesarVentaPosCompleta } from "@/features/pedidos/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ESTADO_INICIAL } from "@/lib/actions/estado";
import {
  SelectorModificadores,
  tieneModificadores,
  type ProductoConModificadores,
} from "@/features/carta/components/selector-modificadores";
import {
  auditarStockCarritoRecetas,
  calcularStockDisponibleProducto,
} from "@/lib/inventory/stock";
import {
  DatosFiscales,
  valorFiscalInicial,
  type DatosFiscalesValor,
} from "@/features/pedidos/components/datos-fiscales";
import { claveDeLinea } from "@/lib/modificadores";
import { formatCop } from "@/lib/money";
import { cn } from "@/lib/utils";

export type PosProducto = ProductoConModificadores & {
  id: string;
  name: string;
  priceCop: number;
  isAvailable: boolean;
  imageUrl: string | null;
  sku?: string | null;
  trackStock?: boolean;
  stockQty?: number;
  taxRate?: { rateBp: number };
  category?: { name: string };
  recipeItems?: Array<{
    quantityRequired: number;
    inventoryItem: {
      id: string;
      name: string;
      unit: string;
      stockCurrent: number;
    };
  }>;
};

export type PosCategoria = {
  id: string;
  name: string;
  products: PosProducto[];
};

export type PosPedidoAbierto = {
  id: string;
  code: number;
  turnNumber: number | null;
  type: string;
  status: string;
  totalCop: number;
  openedAt: Date;
  customerName: string | null;
};

export type PosPedidoDetalle = {
  id: string;
  code: number;
  turnNumber: number | null;
  type: string;
  status: string;
  customerName: string | null;
  customerPhone: string | null;
  deliveryAddress: string | null;
  docType: string | null;
  docNumber: string | null;
  customerEmail: string | null;
  notes: string | null;
  items: {
    id: string;
    productId: string;
    nameSnapshot: string;
    unitPriceCop: number;
    basePriceCopSnapshot: number;
    quantity: number;
    status?: string;
    notes: string | null;
    modifiers: Array<{
      id: string;
      optionId: string | null;
      groupNameSnapshot: string;
      optionNameSnapshot: string;
      priceDeltaCopSnapshot: number;
    }>;
  }[];
};

function cartDesdePedido(pedido: PosPedidoDetalle): CartItem[] {
  return pedido.items.map((i) => {
    const opciones = i.modifiers.map((m) => ({
      id: m.optionId ?? m.id,
      groupName: m.groupNameSnapshot,
      name: m.optionNameSnapshot,
      priceDeltaCop: m.priceDeltaCopSnapshot,
    }));

    return {
      lineKey: claveDeLinea(
        i.productId,
        i.modifiers.map((m) => m.optionId).filter((id): id is string => id !== null),
      ),
      productId: i.productId,
      name: i.nameSnapshot,
      priceCop: i.basePriceCopSnapshot,
      recargoCop: i.unitPriceCop - i.basePriceCopSnapshot,
      quantity: i.quantity,
      notes: i.notes ?? "",
      opciones,
    };
  });
}

type VistaVentaRapidaProps = {
  usuarioNombre: string;
  carta: PosCategoria[];
  caja: { id: string; openingFloatCop: number } | null;
  pedidosAbiertos: PosPedidoAbierto[];
  pedidoInicial?: PosPedidoDetalle | null;
  settings: {
    inventoryEnabled: boolean;
    permitirVentaSinStock: boolean;
    deliveryEnabled: boolean;
    deliveryFeeCop?: number;
    requireOpenCashSession: boolean;
    cashRoundingCop: number;
    pricesIncludeTax: boolean;
    tipSuggestionEnabled: boolean;
    tipSuggestionRateBp: number;
  };
  puedeFacturar: boolean;
  usaMesas?: boolean;
};

type CartItem = {
  lineKey: string;
  productId: string;
  name: string;
  priceCop: number;
  recargoCop: number;
  quantity: number;
  notes: string;
  opciones: Array<{ id: string; groupName: string; name: string; priceDeltaCop: number }>;
};

function precioUnitario(item: CartItem): number {
  return item.priceCop + item.recargoCop;
}

export function VistaVentaRapida({
  usuarioNombre,
  carta,
  caja,
  pedidosAbiertos,
  pedidoInicial,
  settings,
  puedeFacturar,
  usaMesas = false,
}: VistaVentaRapidaProps) {
  const router = useRouter();

  // ── Estado de Apertura de Caja ─────────────────────────────────────────────
  const [estadoCaja, accionCaja, pendingCaja] = useActionState(abrirCaja, ESTADO_INICIAL);

  // ── Filtros y Búsqueda ─────────────────────────────────────────────────────
  const [busqueda, setBusqueda] = useState("");
  const [barcodeInput, setBarcodeInput] = useState("");
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState<string | null>(null);

  // ── Estado del Carrito ──────────────────────────────────────────────────────
  const [activeOrderId, setActiveOrderId] = useState<string | null>(pedidoInicial?.id ?? null);
  const [orderCode, setOrderCode] = useState<number | null>(pedidoInicial?.code ?? null);
  const [turnNumber, setTurnNumber] = useState<number | null>(pedidoInicial?.turnNumber ?? null);

  const [cart, setCart] = useState<CartItem[]>(() =>
    pedidoInicial ? cartDesdePedido(pedidoInicial) : [],
  );

  const [quienAtiende, setQuienAtiende] = useState(usuarioNombre || "Cajero");
  const [clienteNombre, setClienteNombre] = useState(pedidoInicial?.customerName ?? "Cliente General");
  const [descuentoCop, setDescuentoCop] = useState<number>(0);
  const [metodoPago, setMetodoPago] = useState<
    "EFECTIVO" | "TARJETA_DEBITO" | "TARJETA_CREDITO" | "NEQUI" | "DAVIPLATA" | "TRANSFERENCIA"
  >("EFECTIVO");

  // ── Modales ────────────────────────────────────────────────────────────────
  const [productoAElegir, setProductoAElegir] = useState<PosProducto | null>(null);
  const [modalEscanerAbierto, setModalEscanerAbierto] = useState(false);
  const [modalParqueadosAbierto, setModalParqueadosAbierto] = useState(false);

  const [procesando, setProcesando] = useState(false);
  const [errorGlobal, setErrorGlobal] = useState<string | null>(null);
  const [mensajeExito, setMensajeExito] = useState<{
    titulo: string;
    detalle: string;
    orderId?: string;
  } | null>(null);

  const barcodeRef = useRef<HTMLInputElement>(null);

  // Sincronizar estado si llega pedidoInicial
  useEffect(() => {
    if (pedidoInicial) {
      setActiveOrderId(pedidoInicial.id);
      setOrderCode(pedidoInicial.code);
      setTurnNumber(pedidoInicial.turnNumber);
      setCart(cartDesdePedido(pedidoInicial));
      setClienteNombre(pedidoInicial.customerName ?? "Cliente General");
    }
  }, [pedidoInicial]);

  // Lista plana de todos los productos para búsqueda rápida por SKU / Código
  const todosLosProductos = useMemo(() => {
    return carta.flatMap((c) =>
      c.products.map((p) => ({
        ...p,
        categoryId: c.id,
        categoryName: c.name,
      })),
    );
  }, [carta]);

  // ── Funciones de Carrito ───────────────────────────────────────────────────
  const enCarritoDelProducto = (productId: string) =>
    cart.reduce((acc, i) => (i.productId === productId ? acc + i.quantity : acc), 0);

  const agregarCombinacion = (
    producto: PosProducto,
    opciones: CartItem["opciones"],
    quantity: number,
    notes: string,
  ) => {
    const disp = calcularStockDisponibleProducto(producto, settings.inventoryEnabled);
    const cantActual = enCarritoDelProducto(producto.id);

    if (!settings.permitirVentaSinStock && disp !== null && cantActual + quantity > disp) {
      setErrorGlobal(
        disp <= 0
          ? `Stock insuficiente de insumos para "${producto.name}".`
          : `Stock máximo alcanzado para "${producto.name}" (${disp} porciones disponibles).`,
      );
      return;
    }

    const recargoCop = opciones.reduce((acc, o) => acc + o.priceDeltaCop, 0);
    const lineKey = claveDeLinea(
      producto.id,
      opciones.map((o) => o.id),
    );

    setErrorGlobal(null);
    setCart((prev) => {
      const existe = prev.find((i) => i.lineKey === lineKey);
      if (existe) {
        return prev.map((i) =>
          i.lineKey === lineKey ? { ...i, quantity: i.quantity + quantity } : i,
        );
      }
      return [
        ...prev,
        {
          lineKey,
          productId: producto.id,
          name: producto.name,
          priceCop: producto.priceCop,
          recargoCop,
          quantity,
          notes,
          opciones,
        },
      ];
    });
  };

  const tocarProducto = (producto: PosProducto) => {
    if (tieneModificadores(producto)) {
      setProductoAElegir(producto);
    } else {
      agregarCombinacion(producto, [], 1, "");
    }
  };

  // Buscar por SKU / Código de barras al presionar Enter
  const procesarCodigoDeBarras = (codigo: string) => {
    const query = codigo.trim().toLowerCase();
    if (!query) return;

    const coincidencia = todosLosProductos.find(
      (p) =>
        (p.sku && p.sku.toLowerCase() === query) ||
        p.id.toLowerCase() === query ||
        p.name.toLowerCase() === query,
    );

    if (coincidencia) {
      tocarProducto(coincidencia);
      setBarcodeInput("");
      setErrorGlobal(null);
    } else {
      // Intentar búsqueda por subcadena
      const parcial = todosLosProductos.find((p) => p.name.toLowerCase().includes(query));
      if (parcial) {
        tocarProducto(parcial);
        setBarcodeInput("");
        setErrorGlobal(null);
      } else {
        setErrorGlobal(`No se encontró ningún producto con el código o nombre "${codigo}".`);
      }
    }
  };

  const cambiarCantidad = (lineKey: string, delta: number) => {
    const item = cart.find((i) => i.lineKey === lineKey);

    if (delta > 0 && item) {
      const prodObj = todosLosProductos.find((x) => x.id === item.productId);
      if (prodObj) {
        const disp = calcularStockDisponibleProducto(prodObj, settings.inventoryEnabled);
        const cantActual = enCarritoDelProducto(item.productId);

        if (!settings.permitirVentaSinStock && disp !== null && cantActual + delta > disp) {
          setErrorGlobal(`Stock máximo alcanzado para "${prodObj.name}" (${disp} disponibles).`);
          return;
        }
      }
    }

    setErrorGlobal(null);
    setCart((prev) =>
      prev
        .map((it) => {
          if (it.lineKey === lineKey) {
            const nueva = it.quantity + delta;
            return nueva > 0 ? { ...it, quantity: nueva } : null;
          }
          return it;
        })
        .filter(Boolean) as CartItem[],
    );
  };

  const quitarDelCarrito = (lineKey: string) => {
    setCart((prev) => prev.filter((item) => item.lineKey !== lineKey));
  };

  const vaciarCarrito = () => {
    setActiveOrderId(null);
    setOrderCode(null);
    setTurnNumber(null);
    setCart([]);
    setErrorGlobal(null);
  };

  const nuevaVenta = () => {
    vaciarCarrito();
    setClienteNombre("Cliente General");
    setDescuentoCop(0);
    setMensajeExito(null);
  };

  // Totales
  const subtotalCart = cart.reduce((acc, item) => acc + precioUnitario(item) * item.quantity, 0);
  const subtotalConDescuento = Math.max(0, subtotalCart - (descuentoCop || 0));
  const totalCart = subtotalConDescuento;

  // ── Facturar Venta Directa ──────────────────────────────────────────────────
  const facturarVenta = async () => {
    if (cart.length === 0) {
      setErrorGlobal("El carrito está vacío. Agregá productos para facturar.");
      return;
    }

    if (!quienAtiende.trim()) {
      setErrorGlobal("Ingresá quién atiende la venta.");
      return;
    }

    const errorStock = auditarStockCarritoRecetas(
      cart.map((i) => ({
        productId: i.productId,
        name: i.name,
        quantity: i.quantity,
      })),
      carta,
      settings.inventoryEnabled && !settings.permitirVentaSinStock,
    );
    if (errorStock) {
      setErrorGlobal(errorStock);
      return;
    }

    setProcesando(true);
    setErrorGlobal(null);

    const payload = {
      orderId: activeOrderId || undefined,
      type: "LLEVAR" as const,
      customerName: `${clienteNombre.trim()} (${quienAtiende.trim()})`,
      notes: `Venta Rápida Barra · Atendió: ${quienAtiende.trim()}`,
      items: cart.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
        notes: i.notes.trim() || undefined,
        modifierOptionIds: i.opciones.map((o) => o.id),
      })),
      accion: "PAGAR_DIRECTO" as const,
      pago: {
        method: metodoPago,
        amountCop: totalCart,
        tipCop: 0,
      },
    };

    try {
      const res = await procesarVentaPosCompleta(undefined, payload);
      setProcesando(false);

      if (!res.ok) {
        setErrorGlobal(res.error || "Ocurrió un error al procesar la venta.");
        return;
      }

      const data = res.data;
      setMensajeExito({
        titulo: "¡Venta Facturada con Éxito!",
        detalle: `Pedido #${data.code} · Total: ${formatCop(totalCart)}`,
        orderId: data.orderId,
      });

      if (typeof window !== "undefined" && data.orderId) {
        window.open(`/imprimir/pedido/${data.orderId}?auto=1`, "_blank", "width=480,height=680");
      }

      vaciarCarrito();
      router.refresh();
    } catch (err: unknown) {
      setProcesando(false);
      setErrorGlobal(
        err instanceof Error
          ? err.message
          : "Error de comunicación con el servidor. Intentá de nuevo.",
      );
    }
  };

  // ── Filtrado de Productos para la Grilla ───────────────────────────────────
  const q = busqueda.trim().toLowerCase();

  const productosAMostrar = useMemo(() => {
    return todosLosProductos.filter((p) => {
      if (categoriaSeleccionada && p.categoryId !== categoriaSeleccionada) return false;
      if (q && !p.name.toLowerCase().includes(q) && !(p.sku && p.sku.toLowerCase().includes(q))) {
        return false;
      }
      return true;
    });
  }, [todosLosProductos, categoriaSeleccionada, q]);

  return (
    <div className="space-y-4">
      {/* ── Si la caja está cerrada ────────────────────────────────────────── */}
      {settings.requireOpenCashSession && !caja ? (
        <Card className="max-w-xl mx-auto border-warning/40 bg-warning/5 shadow-md rounded-2xl p-6 space-y-4 text-center">
          <div className="size-14 mx-auto rounded-full bg-warning/20 text-warning-soft flex items-center justify-center text-2xl font-bold">
            🔒
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-foreground">Turno de Caja Cerrado</h2>
            <p className="text-xs text-muted-foreground">
              Para registrar ventas rápidas en la barra, ingresá la base inicial de caja.
            </p>
          </div>

          <form action={accionCaja} className="space-y-4 text-left pt-2">
            {!estadoCaja.ok && estadoCaja.error && (
              <Alert variant="destructive">
                <AlertDescription>{estadoCaja.error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="openingFloatCop" className="text-xs font-semibold">
                Base Inicial de Caja ($ COP) *
              </Label>
              <Input
                id="openingFloatCop"
                name="openingFloatCop"
                type="text"
                defaultValue="100.000"
                className="h-11 text-base font-bold rounded-xl font-mono"
                required
              />
            </div>

            <Button
              type="submit"
              disabled={pendingCaja}
              className="w-full h-11 bg-brand text-brand-foreground hover:bg-brand/90 font-bold rounded-xl text-sm"
            >
              {pendingCaja ? "Abriendo turno..." : "Abrir turno de caja"}
            </Button>
          </form>
        </Card>
      ) : (
        /* ── INTERFAZ VENTA RÁPIDA (TERMINAL POS) ────────────────────────────── */
        <div className="space-y-4">
          {/* Header Superior estilo Terminal POS */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5">
              <h1 className="font-display font-black text-2xl sm:text-3xl uppercase tracking-tight text-foreground">
                Terminal POS
              </h1>
              <p className="text-muted-foreground text-xs font-medium">
                Registra ventas directas en barra de forma inmediata.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                onClick={nuevaVenta}
                className="h-9 rounded-xl bg-brand text-brand-foreground hover:bg-brand/90 font-bold text-xs px-4 shadow-xs"
              >
                <Plus className="size-3.5 mr-1" />
                Nueva Venta
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setModalParqueadosAbierto(true)}
                className="h-9 rounded-xl border-border bg-card text-foreground font-semibold text-xs px-3"
              >
                <Clock className="size-3.5 mr-1 text-muted-foreground" />
                En espera / Historial ({pedidosAbiertos.length})
              </Button>
            </div>
          </div>

          {/* Mensajes de Alerta / Éxito */}
          {errorGlobal && (
            <Alert variant="destructive" className="rounded-xl">
              <AlertDescription className="flex items-center justify-between text-xs font-medium">
                <span>{errorGlobal}</span>
                <button
                  type="button"
                  onClick={() => setErrorGlobal(null)}
                  className="text-destructive-foreground opacity-80 hover:opacity-100"
                >
                  <X className="size-4" />
                </button>
              </AlertDescription>
            </Alert>
          )}

          {mensajeExito && (
            <div className="rounded-xl border border-success/30 bg-success/10 p-3 text-success-soft flex items-center justify-between gap-2 text-xs font-medium">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 shrink-0 text-success" />
                <div>
                  <strong className="block font-bold">{mensajeExito.titulo}</strong>
                  <span>{mensajeExito.detalle}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMensajeExito(null)}
                className="hover:text-foreground p-1"
              >
                <X className="size-4" />
              </button>
            </div>
          )}

          {/* Barra de Búsqueda y Escáner de Código de Barras */}
          <div className="grid gap-2.5 sm:grid-cols-[1fr_1.5fr_auto]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre o código..."
                className="h-10 pl-9 rounded-xl bg-card border-border text-xs font-medium"
              />
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                procesarCodigoDeBarras(barcodeInput);
              }}
              className="relative flex gap-2"
            >
              <Input
                ref={barcodeRef}
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                placeholder="Lector Barras (Simula código y pulsa Enter)"
                className="h-10 rounded-xl bg-card border-border text-xs font-mono"
              />
            </form>

            <Button
              type="button"
              variant="outline"
              onClick={() => setModalEscanerAbierto(true)}
              className="h-10 rounded-xl border-border bg-card hover:bg-accent text-foreground text-xs font-bold gap-1.5 px-3.5"
            >
              <ScanLine className="size-4 text-brand" />
              <span>Escanear</span>
            </Button>
          </div>

          {/* Píldoras Horizontales de Categorías */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            <button
              type="button"
              onClick={() => setCategoriaSeleccionada(null)}
              className={cn(
                "rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap",
                categoriaSeleccionada === null
                  ? "bg-brand text-brand-foreground shadow-xs"
                  : "bg-card border border-border/80 text-muted-foreground hover:text-foreground hover:border-brand/40",
              )}
            >
              TODOS
            </button>
            {carta.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategoriaSeleccionada(cat.id)}
                className={cn(
                  "rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap",
                  categoriaSeleccionada === cat.id
                    ? "bg-brand text-brand-foreground shadow-xs"
                    : "bg-card border border-border/80 text-muted-foreground hover:text-foreground hover:border-brand/40",
                )}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Contenido Principal Dual Pane: Grilla Productos (Izquierda) vs Carrito (Derecha) */}
          <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
            {/* Grilla de Tarjetas de Producto */}
            <div className="space-y-3">
              {productosAMostrar.length === 0 ? (
                <Card className="rounded-2xl border-dashed p-8 text-center">
                  <p className="text-xs text-muted-foreground">
                    No se encontraron productos que coincidan con la búsqueda o filtro seleccionado.
                  </p>
                </Card>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-3">
                  {productosAMostrar.map((prod) => {
                    const disp = calcularStockDisponibleProducto(prod, settings.inventoryEnabled);
                    const sinStock = disp !== null && disp <= 0;
                    const pocas = disp !== null && disp > 0 && disp <= 5;
                    const conMod = tieneModificadores(prod);

                    return (
                      <div
                        key={prod.id}
                        onClick={() => tocarProducto(prod)}
                        className={cn(
                          "group relative flex flex-col justify-between rounded-2xl border border-border/80 bg-card p-3.5 cursor-pointer overflow-hidden transition-all duration-200",
                          "hover:border-brand/50 hover:shadow-lg hover:shadow-brand/5 hover:-translate-y-0.5 active:scale-[0.98]",
                          sinStock && !settings.permitirVentaSinStock && "opacity-50 pointer-events-none",
                        )}
                      >
                        {/* Fila Superior: Categoría y Stock Badge */}
                        <div className="flex items-start justify-between gap-1 mb-2">
                          <span className="text-[0.65rem] font-extrabold uppercase tracking-wider text-muted-foreground/80 truncate">
                            {prod.categoryName || "GENERAL"}
                          </span>

                          {settings.inventoryEnabled && disp !== null && (
                            <span
                              className={cn(
                                "text-[0.65rem] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md border",
                                sinStock || pocas
                                  ? "bg-destructive/15 text-destructive border-destructive/30"
                                  : "bg-accent/80 text-muted-foreground border-border/60",
                              )}
                            >
                              STOCK: {disp}
                            </span>
                          )}
                        </div>

                        {/* Nombre del Producto */}
                        <div className="space-y-1 my-1">
                          <h3 className="font-bold text-sm text-foreground leading-tight group-hover:text-brand transition-colors line-clamp-2">
                            {prod.name}
                          </h3>
                        </div>

                        {/* Fila Inferior: Precio y Botón + */}
                        <div className="flex items-center justify-between pt-2 mt-auto border-t border-border/40">
                          <span className="numeral font-display font-black text-brand text-base sm:text-lg">
                            {formatCop(prod.priceCop)}
                          </span>

                          <button
                            type="button"
                            aria-label={`Agregar ${prod.name}`}
                            className="size-7 sm:size-8 rounded-lg bg-brand/10 hover:bg-brand text-brand hover:text-brand-foreground flex items-center justify-center font-bold text-base transition-colors"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Panel Carrito de Ventas (Derecha) */}
            <aside aria-label="Carrito de ventas">
              <Card className="rounded-2xl border-border/80 bg-card p-4 space-y-4 shadow-sm sticky top-4">
                {/* Cabecera Carrito */}
                <div className="flex items-center justify-between border-b border-border/60 pb-3">
                  <div className="flex items-center gap-2">
                    <ShoppingBag className="size-4 text-brand" />
                    <h2 className="font-display font-black uppercase text-sm tracking-tight text-foreground">
                      Carrito de Ventas
                    </h2>
                  </div>

                  {cart.length > 0 && (
                    <button
                      type="button"
                      onClick={vaciarCarrito}
                      className="text-xs font-bold text-destructive hover:underline"
                    >
                      Vaciar
                    </button>
                  )}
                </div>

                {/* Renglones del Carrito */}
                {cart.length === 0 ? (
                  <div className="py-8 text-center space-y-2 text-muted-foreground">
                    <ShoppingBag className="size-8 mx-auto opacity-30" />
                    <p className="text-xs font-medium">El carrito está vacío.</p>
                    <p className="text-[0.7rem]">Tocá o escaneá un producto para agregarlo.</p>
                  </div>
                ) : (
                  <ul className="divide-y divide-border/50 max-h-60 overflow-y-auto pr-1 space-y-2">
                    {cart.map((item) => (
                      <li key={item.lineKey} className="pt-2 first:pt-0 space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="text-xs font-bold text-foreground leading-tight block">
                              {item.name}
                            </span>
                            <span className="numeral text-[0.7rem] text-muted-foreground">
                              {formatCop(precioUnitario(item))} c/u
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <div className="flex items-center rounded-lg border border-border bg-secondary/60 px-1.5 py-0.5">
                              <button
                                type="button"
                                onClick={() => cambiarCantidad(item.lineKey, -1)}
                                className="size-5 flex items-center justify-center text-muted-foreground hover:text-foreground"
                              >
                                <Minus className="size-3" />
                              </button>
                              <span className="numeral font-bold text-xs px-2">
                                {item.quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() => cambiarCantidad(item.lineKey, 1)}
                                className="size-5 flex items-center justify-center text-muted-foreground hover:text-foreground"
                              >
                                <Plus className="size-3" />
                              </button>
                            </div>

                            <button
                              type="button"
                              onClick={() => quitarDelCarrito(item.lineKey)}
                              className="text-muted-foreground hover:text-destructive p-1"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        </div>

                        {item.opciones.length > 0 && (
                          <p className="text-[0.65rem] text-muted-foreground pl-2">
                            + {item.opciones.map((o) => o.name).join(", ")}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {/* Formulario de Venta Directa */}
                <div className="space-y-3 pt-2 border-t border-border/60">
                  <div className="space-y-1">
                    <label className="text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground block">
                      ¿Quién atiende? (Requerido)
                    </label>
                    <Input
                      value={quienAtiende}
                      onChange={(e) => setQuienAtiende(e.target.value)}
                      placeholder="Nombre del cajero/mesero"
                      className="h-9 text-xs font-semibold rounded-xl bg-secondary/30"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground block">
                      Cliente (Opcional)
                    </label>
                    <Input
                      value={clienteNombre}
                      onChange={(e) => setClienteNombre(e.target.value)}
                      placeholder="Cliente General"
                      className="h-9 text-xs rounded-xl bg-secondary/30"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground block">
                        Descuento ($)
                      </label>
                      <Input
                        type="number"
                        min="0"
                        value={descuentoCop || ""}
                        onChange={(e) => setDescuentoCop(Number(e.target.value) || 0)}
                        placeholder="0"
                        className="h-9 text-xs font-mono rounded-xl bg-secondary/30"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground block">
                        Método Pago
                      </label>
                      <select
                        value={metodoPago}
                        onChange={(e) => setMetodoPago(e.target.value as typeof metodoPago)}
                        className="h-9 w-full text-xs font-bold rounded-xl border border-input bg-secondary/30 px-2 text-foreground focus:outline-none"
                      >
                        <option value="EFECTIVO">Efectivo</option>
                        <option value="NEQUI">Nequi</option>
                        <option value="TARJETA_DEBITO">Tarjeta Débito</option>
                        <option value="TARJETA_CREDITO">Tarjeta Crédito</option>
                        <option value="DAVIPLATA">Daviplata</option>
                        <option value="TRANSFERENCIA">Transferencia</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Totales */}
                <div className="space-y-1.5 pt-3 border-t border-border/60">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Subtotal Barra</span>
                    <span className="numeral font-semibold">{formatCop(subtotalCart)}</span>
                  </div>

                  <div className="flex justify-between items-baseline pt-1">
                    <span className="font-display font-black text-xs uppercase tracking-wider text-foreground">
                      TOTAL A COBRAR
                    </span>
                    <span className="numeral font-display font-black text-2xl text-brand">
                      {formatCop(totalCart)}
                    </span>
                  </div>
                </div>

                {/* Botón Principal de Cobro */}
                <Button
                  type="button"
                  onClick={facturarVenta}
                  disabled={procesando || cart.length === 0}
                  className="w-full h-11 bg-brand text-brand-foreground hover:bg-brand/90 font-bold rounded-xl text-sm shadow-md"
                >
                  {procesando ? (
                    "Procesando venta..."
                  ) : (
                    <>
                      <Check className="size-4 mr-1.5" />
                      Facturar Venta
                    </>
                  )}
                </Button>
              </Card>
            </aside>
          </div>
        </div>
      )}

      {/* Modal Selector de Modificadores */}
      {productoAElegir && (
        <SelectorModificadores
          producto={productoAElegir}
          abierto={!!productoAElegir}
          onCerrar={() => setProductoAElegir(null)}
          inventoryEnabled={settings.inventoryEnabled}
          onConfirmar={({ opcionIds, quantity, notes }) => {
            const opciones = (productoAElegir.modifierGroups ?? [])
              .flatMap((a) => a.group.options)
              .filter((o) => opcionIds.includes(o.id))
              .map((o) => ({
                id: o.id,
                groupName: "",
                name: o.name,
                priceDeltaCop: o.priceDeltaCop,
              }));

            agregarCombinacion(productoAElegir, opciones, quantity, notes);
            setProductoAElegir(null);
          }}
        />
      )}

      {/* Modal Lector de Código de Barras / Escáner */}
      {modalEscanerAbierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs p-4">
          <Card className="w-full max-w-md rounded-2xl border-border p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <QrCode className="size-5 text-brand" />
                <h3 className="font-bold text-sm">Escáner de Código de Barras</h3>
              </div>
              <button
                type="button"
                onClick={() => setModalEscanerAbierto(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-3 text-center py-4">
              <div className="size-20 mx-auto rounded-2xl bg-brand/10 text-brand flex items-center justify-center animate-pulse">
                <ScanLine className="size-10" />
              </div>
              <p className="text-xs text-muted-foreground">
                Escaneá con tu lector o ingresá el código de barras / SKU del producto a continuación.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const val = (e.currentTarget.elements.namedItem("codigoModal") as HTMLInputElement)?.value;
                  if (val) {
                    procesarCodigoDeBarras(val);
                    setModalEscanerAbierto(false);
                  }
                }}
                className="space-y-3 text-left pt-2"
              >
                <Input
                  name="codigoModal"
                  autoFocus
                  placeholder="Escaneá o escribí código + Enter"
                  className="h-11 rounded-xl text-sm font-mono"
                />
                <Button type="submit" className="w-full bg-brand text-brand-foreground font-bold rounded-xl h-10">
                  Agregar Producto Escaneado
                </Button>
              </form>
            </div>
          </Card>
        </div>
      )}

      {/* Modal Pedidos en Espera / Parqueados */}
      {modalParqueadosAbierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs p-4">
          <Card className="w-full max-w-lg rounded-2xl border-border p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Clock className="size-5 text-brand" />
                <h3 className="font-bold text-sm">Pedidos en Espera / Historial</h3>
              </div>
              <button
                type="button"
                onClick={() => setModalParqueadosAbierto(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            {pedidosAbiertos.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">
                No hay pedidos en espera en este momento.
              </p>
            ) : (
              <ul className="divide-y divide-border/60 max-h-80 overflow-y-auto space-y-2">
                {pedidosAbiertos.map((p) => (
                  <li key={p.id} className="pt-2 first:pt-0 flex items-center justify-between gap-3">
                    <div>
                      <span className="font-bold text-xs block text-foreground">
                        Pedido #{p.code} {p.customerName ? `· ${p.customerName}` : ""}
                      </span>
                      <span className="numeral text-xs text-brand font-bold">
                        {formatCop(p.totalCop)}
                      </span>
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        router.push(`/venta-rapida?pedidoId=${p.id}`);
                        setModalParqueadosAbierto(false);
                      }}
                      className="h-8 rounded-lg text-xs font-bold"
                    >
                      Cargar en Carrito
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
