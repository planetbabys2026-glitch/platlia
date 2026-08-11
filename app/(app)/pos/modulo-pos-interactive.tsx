"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Bike,
  Box,
  Boxes,
  ChefHat,
  DollarSign,
  Minus,
  PauseCircle,
  Plus,
  Printer,
  Search,
  ShoppingBag,
  ShoppingCart,
  Trash2,
  Utensils,
  X,
} from "lucide-react";
import { abrirCaja } from "@/features/caja/actions";
import { procesarVentaPosCompleta } from "@/features/pedidos/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ESTADO_INICIAL } from "@/lib/actions/estado";
import {
  auditarStockCarritoRecetas,
  calcularStockDisponibleProducto,
  type ProductoStockCalculo,
} from "@/lib/inventory/stock";
import { formatCop } from "@/lib/money";
import { cn } from "@/lib/utils";

export type PosProducto = {
  id: string;
  name: string;
  priceCop: number;
  isAvailable: boolean;
  imageUrl: string | null;
  trackStock?: boolean;
  stockQty?: number;
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
  notes: string | null;
  items: {
    id: string;
    productId: string;
    nameSnapshot: string;
    unitPriceCop: number;
    quantity: number;
    status?: string;
    notes: string | null;
  }[];
};

type ModuloPosInteractiveProps = {
  carta: PosCategoria[];
  caja: { id: string; openingFloatCop: number } | null;
  pedidosAbiertos: PosPedidoAbierto[];
  pedidoInicial?: PosPedidoDetalle | null;
  settings: {
    deliveryEnabled: boolean;
    requireOpenCashSession: boolean;
    cashRoundingCop: number;
    pricesIncludeTax: boolean;
  };
};

type CartItem = {
  productId: string;
  name: string;
  priceCop: number;
  quantity: number;
  notes: string;
};

export function ModuloPosInteractive({
  carta,
  caja,
  pedidosAbiertos,
  pedidoInicial,
  settings,
}: ModuloPosInteractiveProps) {
  const router = useRouter();

  // ── Estado de apertura de caja ─────────────────────────────────────────────
  const [estadoCaja, accionCaja, pendingCaja] = useActionState(abrirCaja, ESTADO_INICIAL);

  // ── Estado de catálogo y búsqueda ──────────────────────────────────────────
  const [busqueda, setBusqueda] = useState("");
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState<string | null>(null);

  // ── Estado del Pedido Activo / Parqueado ───────────────────────────────────
  const [activeOrderId, setActiveOrderId] = useState<string | null>(pedidoInicial?.id ?? null);
  const [orderCode, setOrderCode] = useState<number | null>(pedidoInicial?.code ?? null);
  const [turnNumber, setTurnNumber] = useState<number | null>(pedidoInicial?.turnNumber ?? null);

  // ── Estado de Carrito de Venta ─────────────────────────────────────────────
  const [cart, setCart] = useState<CartItem[]>(() => {
    if (!pedidoInicial) return [];
    return pedidoInicial.items.map((i) => ({
      productId: i.productId,
      name: i.nameSnapshot,
      priceCop: i.unitPriceCop,
      quantity: i.quantity,
      notes: i.notes ?? "",
    }));
  });
  const [tipoConsumo, setTipoConsumo] = useState<"LLEVAR" | "DOMICILIO" | "EN_SITIO">(
    pedidoInicial?.type === "DOMICILIO"
      ? "DOMICILIO"
      : pedidoInicial?.notes?.includes("[PARA COMER AQUÍ / EN SITIO]")
        ? "EN_SITIO"
        : "LLEVAR"
  );
  const [customerName, setCustomerName] = useState(pedidoInicial?.customerName ?? "");
  const [customerPhone, setCustomerPhone] = useState(pedidoInicial?.customerPhone ?? "");
  const [deliveryAddress, setDeliveryAddress] = useState(pedidoInicial?.deliveryAddress ?? "");
  const [orderNotes, setOrderNotes] = useState(
    pedidoInicial?.notes?.replace("[PARA COMER AQUÍ / EN SITIO]", "").trim() ?? ""
  );

  // Sincronizar estado cuando se carga un pedido parqueado (pedidoInicial)
  useEffect(() => {
    if (pedidoInicial) {
      setActiveOrderId(pedidoInicial.id);
      setOrderCode(pedidoInicial.code);
      setTurnNumber(pedidoInicial.turnNumber);
      setCart(
        pedidoInicial.items
          .filter((i) => i.status !== "ANULADO")
          .map((i) => ({
            productId: i.productId,
            name: i.nameSnapshot,
            priceCop: i.unitPriceCop,
            quantity: i.quantity,
            notes: i.notes ?? "",
          }))
      );
      setTipoConsumo(
        pedidoInicial.type === "DOMICILIO"
          ? "DOMICILIO"
          : pedidoInicial.notes?.includes("[PARA COMER AQUÍ / EN SITIO]")
            ? "EN_SITIO"
            : "LLEVAR"
      );
      setCustomerName(pedidoInicial.customerName ?? "");
      setCustomerPhone(pedidoInicial.customerPhone ?? "");
      setDeliveryAddress(pedidoInicial.deliveryAddress ?? "");
      setOrderNotes(
        pedidoInicial.notes?.replace("[PARA COMER AQUÍ / EN SITIO]", "").trim() ?? ""
      );
    }
  }, [pedidoInicial]);

  // ── Modales y Drawers ──────────────────────────────────────────────────────
  const [modalPagoAbierto, setModalPagoAbierto] = useState(false);
  const [modalParqueadosAbierto, setModalParqueadosAbierto] = useState(false);
  const [modalAlertasStockAbierto, setModalAlertasStockAbierto] = useState(false);
  const [metodoPago, setMetodoPago] = useState<"EFECTIVO" | "TARJETA_DEBITO" | "TARJETA_CREDITO" | "NEQUI" | "DAVIPLATA" | "TRANSFERENCIA">("EFECTIVO");

  // ── Alertas de Stock Bajo (Insumos de Receta y Productos Terminados) ───────
  const alertasStockPos = useMemo(() => {
    const lista: Array<{
      id: string;
      nombre: string;
      detalle: string;
      tipo: "INSUMO" | "PRODUCTO_TERMINADO" | "RECETA";
      nivel: "CRITICO" | "BAJO";
    }> = [];

    const insumosVistos = new Map<string, { name: string; unit: string; stockCurrent: number; stockMin: number }>();

    for (const cat of carta) {
      for (const prod of cat.products) {
        // Stock directo (Productos terminados / reventa)
        if (prod.trackStock && typeof prod.stockQty === "number" && prod.stockQty <= 5) {
          lista.push({
            id: `prod-${prod.id}`,
            nombre: prod.name,
            detalle: prod.stockQty <= 0 ? "Producto terminado AGOTADO (0 und)" : `Stock bajo: ${prod.stockQty} und`,
            tipo: "PRODUCTO_TERMINADO",
            nivel: prod.stockQty <= 0 ? "CRITICO" : "BAJO",
          });
        }

        // Stock por Receta
        if (prod.recipeItems && prod.recipeItems.length > 0) {
          const disp = calcularStockDisponibleProducto(prod);
          if (disp !== null && disp <= 5) {
            lista.push({
              id: `receta-${prod.id}`,
              nombre: prod.name,
              detalle: disp <= 0 ? "Plato sin insumos suficientes (0 disp)" : `Quedan ${disp} porciones preparables`,
              tipo: "RECETA",
              nivel: disp <= 0 ? "CRITICO" : "BAJO",
            });
          }

          // Recopilar insumos de las recetas
          for (const r of prod.recipeItems) {
            const ins = r.inventoryItem;
            if (ins && !insumosVistos.has(ins.id)) {
              insumosVistos.set(ins.id, {
                name: ins.name,
                unit: ins.unit,
                stockCurrent: ins.stockCurrent,
                stockMin: 5,
              });
            }
          }
        }
      }
    }

    // Insumos de materias primas
    for (const [id, ins] of insumosVistos) {
      if (ins.stockCurrent <= ins.stockMin) {
        lista.push({
          id: `insumo-${id}`,
          nombre: ins.name,
          detalle: ins.stockCurrent <= 0 ? `Insumo AGOTADO (0 ${ins.unit})` : `Quedan ${ins.stockCurrent} ${ins.unit}`,
          tipo: "INSUMO",
          nivel: ins.stockCurrent <= 0 ? "CRITICO" : "BAJO",
        });
      }
    }

    return lista;
  }, [carta]);
  const [montoRecibido, setMontoRecibido] = useState<string>("");
  const [numeroComprobante, setNumeroComprobante] = useState("");
  const [procesandoAccion, setProcesandoAccion] = useState(false);
  const [errorGlobal, setErrorGlobal] = useState<string | null>(null);
  const [mensajeExito, setMensajeExito] = useState<{
    titulo: string;
    detalle: string;
    orderId?: string;
  } | null>(null);

  // ── Cálculos del Carrito ───────────────────────────────────────────────────
  const subtotalCart = cart.reduce((acc, item) => acc + item.priceCop * item.quantity, 0);
  const totalCart = subtotalCart;

  // Cálculo devuelta / cambio para pago en efectivo
  const numRecibido = parseFloat(montoRecibido) || 0;
  const cambioDevuelta = Math.max(0, numRecibido - totalCart);

  // ── Manejo de Carrito ──────────────────────────────────────────────────────
  const agregarAlCarrito = (producto: PosProducto) => {
    const disp = calcularStockDisponibleProducto(producto);
    const itemEnCart = cart.find((i) => i.productId === producto.id);
    const cantActual = itemEnCart?.quantity ?? 0;

    if (disp !== null && cantActual >= disp) {
      setErrorGlobal(
        disp <= 0
          ? `Stock insuficiente de insumos para preparar "${producto.name}".`
          : `Stock máximo alcanzado para "${producto.name}" (${disp} porciones preparables con los insumos actuales en inventario).`
      );
      return;
    }

    setErrorGlobal(null);
    setCart((prev) => {
      const existe = prev.find((i) => i.productId === producto.id);
      if (existe) {
        return prev.map((i) =>
          i.productId === producto.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [
        ...prev,
        {
          productId: producto.id,
          name: producto.name,
          priceCop: producto.priceCop,
          quantity: 1,
          notes: "",
        },
      ];
    });
  };

  const cambiarCantidadCart = (productId: string, delta: number) => {
    if (delta > 0) {
      let prodObj: PosProducto | undefined;
      for (const cat of carta) {
        const p = cat.products.find((item) => item.id === productId);
        if (p) {
          prodObj = p;
          break;
        }
      }

      if (prodObj) {
        const disp = calcularStockDisponibleProducto(prodObj);
        const itemEnCart = cart.find((i) => i.productId === productId);
        const cantActual = itemEnCart?.quantity ?? 0;

        if (disp !== null && cantActual + delta > disp) {
          setErrorGlobal(
            `Stock máximo alcanzado para "${prodObj.name}" (${disp} porciones preparables con los insumos actuales).`
          );
          return;
        }
      }
    }

    setErrorGlobal(null);
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.productId === productId) {
            const nueva = item.quantity + delta;
            return nueva > 0 ? { ...item, quantity: nueva } : null;
          }
          return item;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const actualizarNotaItem = (productId: string, notes: string) => {
    setCart((prev) =>
      prev.map((item) => (item.productId === productId ? { ...item, notes } : item))
    );
  };

  const quitarDelCarrito = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.productId !== productId));
  };

  const vaciarCarrito = () => {
    setActiveOrderId(null);
    setOrderCode(null);
    setTurnNumber(null);
    setCart([]);
    setCustomerName("");
    setCustomerPhone("");
    setDeliveryAddress("");
    setOrderNotes("");
    setErrorGlobal(null);
  };

  const nuevoPedido = () => {
    vaciarCarrito();
    router.push("/pos");
  };

  // ── Procesar Acción (PAGAR_DIRECTO, ENVIAR_COCINA, PARQUEAR) ───────────────
  const ejecutarProcesarPos = async (
    accion: "PAGAR_DIRECTO" | "ENVIAR_COCINA" | "PARQUEAR"
  ) => {
    if (cart.length === 0) {
      setErrorGlobal("El carrito está vacío. Agregá productos antes de continuar.");
      return;
    }

    if (!customerName.trim()) {
      setErrorGlobal("El nombre del cliente es obligatorio para facturar e imprimir la venta.");
      document.getElementById("customerName")?.focus();
      return;
    }

    const errorStock = auditarStockCarritoRecetas(cart, carta);
    if (errorStock) {
      setErrorGlobal(errorStock);
      return;
    }

    if (tipoConsumo === "DOMICILIO") {
      if (!customerPhone.trim()) {
        setErrorGlobal("Para un pedido a domicilio, el número celular de contacto es obligatorio.");
        return;
      }
      if (!deliveryAddress.trim()) {
        setErrorGlobal("Para un pedido a domicilio, la dirección de entrega es obligatoria.");
        return;
      }
    }

    if (accion === "PAGAR_DIRECTO" && metodoPago !== "EFECTIVO" && !numeroComprobante.trim()) {
      setErrorGlobal("Para pagos electrónicos o tarjeta, ingresá el número de comprobante o referencia.");
      return;
    }

    setProcesandoAccion(true);
    setErrorGlobal(null);

    // Mapear tipo de consumo a OrderType enum de Prisma ("LLEVAR" o "DOMICILIO")
    const orderTypeEnum: "LLEVAR" | "DOMICILIO" =
      tipoConsumo === "DOMICILIO" ? "DOMICILIO" : "LLEVAR";
    const notasFormateadas =
      tipoConsumo === "EN_SITIO"
        ? `[PARA COMER AQUÍ / EN SITIO] ${orderNotes}`.trim()
        : orderNotes.trim();

    const payload = {
      orderId: activeOrderId || undefined,
      type: orderTypeEnum,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim() || undefined,
      deliveryAddress: deliveryAddress.trim() || undefined,
      notes: notasFormateadas || undefined,
      items: cart.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
        notes: i.notes.trim() || undefined,
      })),
      accion,
      ...(accion === "PAGAR_DIRECTO"
        ? {
            pago: {
              method: metodoPago,
              amountCop: totalCart,
              tenderedCop: metodoPago === "EFECTIVO" && numRecibido > 0 ? numRecibido : undefined,
              reference: numeroComprobante.trim() || undefined,
            },
          }
        : {}),
    };

    try {
      const res = await procesarVentaPosCompleta(undefined, payload);

      setProcesandoAccion(false);

      if (!res.ok) {
        setErrorGlobal(res.error || "Ocurrió un error al procesar el pedido.");
        return;
      }

      // Éxito
      setModalPagoAbierto(false);
      const data = res.data;

      if (accion === "PAGAR_DIRECTO") {
        setMensajeExito({
          titulo: "¡Venta Realizada con Éxito!",
          detalle: `Pedido #${data.code} pagado (${formatCop(totalCart)})${
            cambioDevuelta > 0 ? ` · Devuelta: ${formatCop(cambioDevuelta)}` : ""
          }`,
          orderId: data.orderId,
        });

        // Disparar impresión automática del tiquete
        if (typeof window !== "undefined" && data.orderId) {
          window.open(`/imprimir/pedido/${data.orderId}?auto=1`, "_blank", "width=480,height=680");
        }
      } else if (accion === "ENVIAR_COCINA") {
        setMensajeExito({
          titulo: "¡Comanda Enviada a Cocina!",
          detalle: `Pedido #${data.code} asignado al Turno #${data.turnNumber ?? data.code}.`,
          orderId: data.orderId,
        });
      } else {
        setMensajeExito({
          titulo: "¡Pedido Parqueado en Espera!",
          detalle: `Pedido #${data.code} guardado para cobrar luego.`,
          orderId: data.orderId,
        });
      }

      vaciarCarrito();
      setNumeroComprobante("");
      setMontoRecibido("");
      router.refresh();
    } catch (err: unknown) {
      setProcesandoAccion(false);
      const msg =
        err instanceof Error
          ? err.message
          : "Error de comunicación con el servidor. Si se reinició el servidor de desarrollo, recargá la página (F5).";
      setErrorGlobal(msg);
    }
  };

  // ── Filtrado de Productos ──────────────────────────────────────────────────
  const q = busqueda.trim().toLowerCase();

  const categoriasFiltradas = carta
    .map((cat) => {
      if (categoriaSeleccionada && cat.id !== categoriaSeleccionada) return null;

      const productosFiltrados = cat.products.filter((p) => {
        if (!q) return true;
        return p.name.toLowerCase().includes(q);
      });

      if (productosFiltrados.length === 0) return null;

      return {
        ...cat,
        products: productosFiltrados,
      };
    })
    .filter(Boolean) as PosCategoria[];

  const todosLosProductosCount = carta.reduce((acc, c) => acc + c.products.length, 0);

  return (
    <div className="space-y-4">
      {/* ── Si la caja está cerrada y se exige caja abierta ────────────────── */}
      {settings.requireOpenCashSession && !caja ? (
        <Card className="max-w-xl mx-auto border-amber-500/40 bg-amber-500/5 shadow-md rounded-2xl p-6 space-y-4 text-center">
          <div className="size-14 mx-auto rounded-full bg-amber-500/20 text-amber-500 flex items-center justify-center text-2xl font-bold">
            🔒
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-foreground">Turno de Caja Cerrado</h2>
            <p className="text-xs text-muted-foreground">
              Para ingresar y tomar ventas en el POS de mostrador, ingresá la base de dinero inicial del turno.
            </p>
          </div>

          <form action={accionCaja} className="space-y-4 text-left pt-2">
            {!estadoCaja.ok && estadoCaja.error && (
              <Alert variant="destructive" role="alert">
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
                placeholder="100.000"
                className="h-11 text-base font-bold rounded-xl font-mono"
                required
              />
            </div>

            <Button
              type="submit"
              disabled={pendingCaja}
              className="w-full h-11 bg-brand text-brand-foreground hover:bg-brand/90 font-bold rounded-xl text-sm"
            >
              {pendingCaja ? "Abriendo Turno..." : "🚀 Abrir Turno de Caja y Comenzar"}
            </Button>
          </form>
        </Card>
      ) : (
        /* ── INTERFAZ POS COMPLETA DUAL PANE ────────────────────────────────── */
        <div className="space-y-4">
          {/* Header Superior del POS */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-card p-3.5 rounded-2xl border border-border shadow-sm">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-xl bg-brand/10 text-brand flex items-center justify-center font-bold">
                <ShoppingBag className="size-5" />
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
                  POS Mostrador
                  <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                    🟢 Caja Abierta
                  </Badge>
                </h1>
                <p className="text-xs text-muted-foreground">
                  Venta rápida interactiva, comandas a cocina y parqueo de pedidos en espera.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {activeOrderId ? (
                <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 p-1.5 px-3 rounded-xl">
                  <span className="text-xs font-bold text-amber-800 dark:text-amber-300">
                    📌 Editando Pedido #{orderCode} {turnNumber !== null ? `(Turno #${turnNumber})` : ""}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={nuevoPedido}
                    className="h-7 text-xs font-bold gap-1 rounded-lg border-amber-500/40"
                  >
                    ➕ Nuevo Pedido
                  </Button>
                </div>
              ) : null}

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setModalParqueadosAbierto(true)}
                className="relative text-xs font-semibold rounded-xl h-9 gap-1.5 border-brand/30 hover:bg-brand/5 text-foreground"
              >
                <PauseCircle className="size-4 text-amber-500" />
                <span>Pedidos Parqueados</span>
                {pedidosAbiertos.length > 0 && (
                  <Badge className="bg-amber-500 text-white text-[10px] px-1.5 py-0 h-4 min-w-4 rounded-full">
                    {pedidosAbiertos.length}
                  </Badge>
                )}
              </Button>
            </div>
          </div>

          {/* Banner de Éxito Temporal */}
          {mensajeExito && (
            <Alert className="border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 flex items-center justify-between">
              <div>
                <AlertTitle className="font-bold text-sm">{mensajeExito.titulo}</AlertTitle>
                <AlertDescription className="text-xs">{mensajeExito.detalle}</AlertDescription>
              </div>
              <div className="flex items-center gap-2">
                {mensajeExito.orderId && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(`/imprimir/pedido/${mensajeExito.orderId}?auto=1`, "_blank")}
                    className="h-8 text-xs font-semibold gap-1"
                  >
                    <Printer className="size-3.5" /> Re-imprimir
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setMensajeExito(null)}
                  className="h-8 text-xs"
                >
                  <X className="size-4" />
                </Button>
              </div>
            </Alert>
          )}

          {/* Grid Principal POS (Izquierda: Catálogo 60% | Derecha: Carrito 40%) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* ── PANEL IZQUIERDO: BUSQUEDA, CATEGORIAS Y PRODUCTOS (7 COLS / 60%) ── */}
            <div className="lg:col-span-7 space-y-4">
              {/* Buscador Rápido de Productos + Botón Modesto Alertas Stock */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3.5 top-3 size-4 text-muted-foreground" />
                  <Input
                    type="text"
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    placeholder="🔍 Buscar producto por nombre o ingrediente..."
                    className="h-10 pl-10 pr-10 text-xs rounded-xl bg-card border-border"
                  />
                  {busqueda && (
                    <button
                      type="button"
                      onClick={() => setBusqueda("")}
                      className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-4" />
                    </button>
                  )}
                </div>

                {/* Pill Modesto de Alertas de Stock */}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setModalAlertasStockAbierto(true)}
                  className={cn(
                    "h-10 text-xs font-bold rounded-xl gap-1.5 shrink-0 transition-all",
                    alertasStockPos.length > 0
                      ? "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300 hover:bg-amber-500/20"
                      : "border-border text-muted-foreground hover:text-foreground"
                  )}
                >
                  <AlertTriangle className="size-4 text-amber-500" />
                  <span className="hidden sm:inline">
                    {alertasStockPos.length > 0 ? `${alertasStockPos.length} Stock Crítico` : "Stock OK"}
                  </span>
                  {alertasStockPos.length > 0 && (
                    <Badge className="bg-amber-500 text-white text-[10px] px-1.5 py-0 h-4 min-w-4 rounded-full">
                      {alertasStockPos.length}
                    </Badge>
                  )}
                </Button>
              </div>

              {/* Pills de Categorías con Scroll Horizontal */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                <button
                  type="button"
                  onClick={() => setCategoriaSeleccionada(null)}
                  className={cn(
                    "px-3.5 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all border",
                    categoriaSeleccionada === null
                      ? "bg-brand text-brand-foreground border-brand font-semibold shadow-sm"
                      : "bg-card text-muted-foreground hover:text-foreground border-border"
                  )}
                >
                  Todas ({todosLosProductosCount})
                </button>
                {carta.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() =>
                      setCategoriaSeleccionada(
                        categoriaSeleccionada === cat.id ? null : cat.id
                      )
                    }
                    className={cn(
                      "px-3.5 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all border",
                      categoriaSeleccionada === cat.id
                        ? "bg-brand text-brand-foreground border-brand font-semibold shadow-sm"
                        : "bg-card text-muted-foreground hover:text-foreground border-border"
                    )}
                  >
                    {cat.name} ({cat.products.length})
                  </button>
                ))}
              </div>

              {/* Grid de Tarjetas de Productos */}
              <div className="space-y-6">
                {categoriasFiltradas.length === 0 ? (
                  <div className="p-8 text-center bg-card rounded-2xl border border-border space-y-2">
                    <p className="text-sm font-semibold">No se encontraron productos</p>
                    <p className="text-xs text-muted-foreground">
                      Probá buscando con otro nombre o seleccioná otra categoría.
                    </p>
                  </div>
                ) : (
                  categoriasFiltradas.map((cat) => (
                    <div key={cat.id} className="space-y-3">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                        <span>{cat.name}</span>
                        <span className="h-px bg-border flex-1" />
                      </h3>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {cat.products.map((prod) => {
                          const itemEnCart = cart.find((i) => i.productId === prod.id);
                          const cant = itemEnCart?.quantity ?? 0;

                          return (
                            <div
                              key={prod.id}
                              onClick={() => prod.isAvailable && agregarAlCarrito(prod)}
                              className={cn(
                                "group relative p-3 rounded-2xl border bg-card transition-all cursor-pointer flex flex-col justify-between space-y-2 select-none",
                                prod.isAvailable
                                  ? "hover:border-brand hover:shadow-md hover:scale-[1.02] active:scale-[0.98]"
                                  : "opacity-50 cursor-not-allowed border-dashed"
                              )}
                            >
                              {/* Counter Badge */}
                              {cant > 0 && (
                                <Badge className="absolute -top-2 -right-2 bg-brand text-brand-foreground text-xs font-bold px-2 py-0.5 rounded-full shadow-md z-10">
                                  {cant}
                                </Badge>
                              )}

                              {/* Imagen o Placeholder */}
                              <div className="aspect-video w-full rounded-xl bg-slate-100 dark:bg-slate-800 overflow-hidden flex items-center justify-center relative">
                                {prod.imageUrl ? (
                                  <img
                                    src={prod.imageUrl}
                                    alt={prod.name}
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                  />
                                ) : (
                                  <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                                    {prod.name.slice(0, 2)}
                                  </div>
                                )}
                                {!prod.isAvailable && (
                                  <span className="absolute inset-0 bg-background/80 backdrop-blur-[1px] flex items-center justify-center text-[11px] font-bold text-destructive">
                                    Agotado
                                  </span>
                                )}
                              </div>

                              {/* Info del Producto */}
                              <div className="space-y-1">
                                <h4 className="font-semibold text-xs text-foreground line-clamp-2 leading-tight">
                                  {prod.name}
                                </h4>
                                <p className="numeral font-bold text-sm text-brand dark:text-[#3E9EA2]">
                                  {formatCop(prod.priceCop)}
                                </p>

                                {/* Indicador de porciones preparables con insumos de la receta */}
                                {(() => {
                                  const disp = calcularStockDisponibleProducto(prod);
                                  if (disp === null) return null;

                                  const esSinStock = disp <= 0;
                                  const esBajoStock = disp > 0 && disp <= 5;
                                  const tieneReceta = Boolean(prod.recipeItems && prod.recipeItems.length > 0);

                                  return (
                                    <div
                                      className={cn(
                                        "inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md border w-fit mt-1",
                                        esSinStock
                                          ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30"
                                          : esBajoStock
                                          ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30"
                                          : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                                      )}
                                      title={
                                        tieneReceta
                                          ? `Calculado según los insumos de la receta: ${disp} porciones preparables`
                                          : `Stock directo: ${disp} unidades disponibles`
                                      }
                                    >
                                      <Box className="size-3 shrink-0" />
                                      <span className="truncate">
                                        {esSinStock
                                          ? "Sin insumos (0 disp.)"
                                          : `${disp} porción${disp === 1 ? "" : "es"} disp.`}
                                      </span>
                                    </div>
                                  );
                                })()}
                              </div>

                              {/* Botón rápido */}
                              <div className="pt-1">
                                <Button
                                  type="button"
                                  disabled={!prod.isAvailable}
                                  size="sm"
                                  className={cn(
                                    "w-full h-8 text-[11px] font-bold rounded-xl gap-1 transition-all",
                                    cant > 0
                                      ? "bg-brand text-brand-foreground"
                                      : "bg-secondary text-secondary-foreground group-hover:bg-brand group-hover:text-brand-foreground"
                                  )}
                                >
                                  <Plus className="size-3.5" />
                                  {cant > 0 ? `Agregado (${cant})` : "Agregar"}
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* ── PANEL DERECHO: PANEL DE VENTA Y CARRITO (5 COLS / 40%) ────────── */}
            <div className="lg:col-span-5 space-y-4 sticky top-4">
              <Card className="border-border bg-card shadow-lg rounded-2xl overflow-hidden space-y-0">
                {/* Header del Carrito */}
                <div className="p-4 border-b border-border bg-muted/30 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShoppingCart className="size-4 text-brand dark:text-[#3E9EA2]" />
                    <span className="font-bold text-sm text-foreground">Detalle del Pedido</span>
                  </div>
                  {cart.length > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={vaciarCarrito}
                      className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 px-2"
                    >
                      <Trash2 className="size-3.5 mr-1" /> Vaciar
                    </Button>
                  )}
                </div>

                <div className="p-4 space-y-4">
                  {/* Selector de Tipo de Consumo */}
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block">
                      Tipo de Consumo
                    </Label>
                    <div className="grid grid-cols-3 gap-1.5 p-1 bg-muted rounded-xl">
                      <button
                        type="button"
                        onClick={() => setTipoConsumo("LLEVAR")}
                        className={cn(
                          "py-1.5 px-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1",
                          tipoConsumo === "LLEVAR"
                            ? "bg-background text-foreground shadow-sm font-bold"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <ShoppingBag className="size-3.5" /> Llevar
                      </button>
                      <button
                        type="button"
                        onClick={() => setTipoConsumo("EN_SITIO")}
                        className={cn(
                          "py-1.5 px-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1",
                          tipoConsumo === "EN_SITIO"
                            ? "bg-background text-foreground shadow-sm font-bold"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <Utensils className="size-3.5" /> En Sitio
                      </button>
                      {settings.deliveryEnabled && (
                        <button
                          type="button"
                          onClick={() => setTipoConsumo("DOMICILIO")}
                          className={cn(
                            "py-1.5 px-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1",
                            tipoConsumo === "DOMICILIO"
                              ? "bg-brand text-brand-foreground shadow-sm font-bold"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          <Bike className="size-3.5" /> Domicilio
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Datos del Cliente */}
                  <div className="space-y-2 pt-1 border-t border-border/60">
                    <div className="space-y-1">
                      <Label htmlFor="customerName" className="text-xs font-medium flex items-center justify-between">
                        <span>Nombre Cliente *</span>
                        <span className="text-[10px] font-semibold text-rose-500">(Obligatorio para facturar)</span>
                      </Label>
                      <Input
                        id="customerName"
                        value={customerName}
                        onChange={(e) => {
                          setCustomerName(e.target.value);
                          if (errorGlobal && e.target.value.trim()) setErrorGlobal(null);
                        }}
                        placeholder="Ej. Carlos / Cliente Mostrador"
                        className={cn(
                          "h-9 text-xs rounded-xl transition-all",
                          cart.length > 0 && !customerName.trim()
                            ? "border-rose-500 ring-2 ring-rose-500/20 bg-rose-500/5 placeholder:text-rose-400 font-semibold text-foreground"
                            : "bg-background border-input"
                        )}
                      />
                      {cart.length > 0 && !customerName.trim() && (
                        <p className="text-[10px] text-rose-500 font-medium pt-0.5">
                          ⚠️ Obligatorio: escribí el nombre para poder facturar e imprimir.
                        </p>
                      )}
                    </div>

                    {/* Campos obligatorios si es Domicilio */}
                    {tipoConsumo === "DOMICILIO" && (
                      <div className="space-y-2 p-3 rounded-xl bg-brand/5 border border-brand/20">
                        <span className="text-xs font-bold text-brand dark:text-[#3E9EA2] block flex items-center gap-1">
                          <Bike className="size-3.5" /> Datos Requeridos para Domicilio
                        </span>
                        <div className="space-y-1.5">
                          <Label htmlFor="customerPhone" className="text-[11px] font-semibold">
                            Celular / Teléfono *
                          </Label>
                          <Input
                            id="customerPhone"
                            value={customerPhone}
                            onChange={(e) => setCustomerPhone(e.target.value)}
                            placeholder="Ej. 3001234567"
                            className="h-9 text-xs rounded-xl bg-background"
                            required
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="deliveryAddress" className="text-[11px] font-semibold">
                            Dirección de Entrega *
                          </Label>
                          <Input
                            id="deliveryAddress"
                            value={deliveryAddress}
                            onChange={(e) => setDeliveryAddress(e.target.value)}
                            placeholder="Ej. Calle 45 # 12-34 Apto 201"
                            className="h-9 text-xs rounded-xl bg-background"
                            required
                          />
                        </div>
                      </div>
                    )}

                    {/* Notas generales del pedido */}
                    <div className="space-y-1">
                      <Label htmlFor="orderNotes" className="text-xs font-medium text-muted-foreground">
                        Notas generales del pedido
                      </Label>
                      <Input
                        id="orderNotes"
                        value={orderNotes}
                        onChange={(e) => setOrderNotes(e.target.value)}
                        placeholder="Ej. Empacar con servilletas extra, salsa picante..."
                        className="h-8 text-xs rounded-xl text-muted-foreground"
                      />
                    </div>
                  </div>

                  {/* Lista de Ítems en el Carrito */}
                  <div className="space-y-2 pt-2 border-t border-border max-h-60 overflow-y-auto pr-1">
                    {cart.length === 0 ? (
                      <div className="p-6 text-center text-muted-foreground space-y-1">
                        <ShoppingBag className="size-8 mx-auto opacity-30" />
                        <p className="text-xs font-medium">El carrito está vacío</p>
                        <p className="text-[11px] opacity-75">
                          Tocá un producto del catálogo para agregarlo.
                        </p>
                      </div>
                    ) : (
                      cart.map((item) => (
                        <div
                          key={item.productId}
                          className="p-2.5 rounded-xl bg-muted/40 border border-border space-y-1.5"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="space-y-0.5 flex-1 min-w-0">
                              <span className="font-bold text-xs text-foreground block truncate">
                                {item.name}
                              </span>
                              <span className="numeral text-[11px] font-semibold text-muted-foreground block">
                                {formatCop(item.priceCop)} c/u
                              </span>
                            </div>
                            <span className="numeral font-bold text-xs text-brand dark:text-[#3E9EA2] shrink-0">
                              {formatCop(item.priceCop * item.quantity)}
                            </span>
                          </div>

                          {/* Controles de cantidad e inline note */}
                          <div className="flex items-center justify-between gap-2 pt-1">
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => cambiarCantidadCart(item.productId, -1)}
                                className="size-6 rounded-lg bg-background border border-border flex items-center justify-center hover:bg-muted text-foreground"
                              >
                                <Minus className="size-3" />
                              </button>
                              <span className="numeral font-bold text-xs w-6 text-center">
                                {item.quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() => cambiarCantidadCart(item.productId, 1)}
                                className="size-6 rounded-lg bg-background border border-border flex items-center justify-center hover:bg-muted text-foreground"
                              >
                                <Plus className="size-3" />
                              </button>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <Input
                                value={item.notes}
                                onChange={(e) => actualizarNotaItem(item.productId, e.target.value)}
                                placeholder="Nota ítem..."
                                className="h-6 text-[10px] w-28 rounded-lg px-1.5"
                              />
                              <button
                                type="button"
                                onClick={() => quitarDelCarrito(item.productId)}
                                className="text-muted-foreground hover:text-destructive p-1"
                              >
                                <X className="size-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Resumen Total y Errores */}
                  <div className="space-y-3 pt-3 border-t border-border">
                    {errorGlobal && (
                      <Alert variant="destructive" role="alert" className="py-2 text-xs">
                        <AlertDescription>{errorGlobal}</AlertDescription>
                      </Alert>
                    )}

                    <div className="flex items-center justify-between p-3 rounded-xl bg-brand/5 border border-brand/20">
                      <span className="font-bold text-xs uppercase tracking-wider text-muted-foreground">
                        Total Pagar
                      </span>
                      <span className="numeral text-2xl font-extrabold text-brand dark:text-[#3E9EA2]">
                        {formatCop(totalCart)}
                      </span>
                    </div>

                    {/* Acciones de Venta (4 Botones) */}
                    <div className="grid grid-cols-1 gap-2 pt-1">
                      <Button
                        type="button"
                        disabled={cart.length === 0 || procesandoAccion}
                        onClick={() => {
                          if (!customerName.trim()) {
                            setErrorGlobal("Ingresá el nombre del cliente antes de pasar a la pantalla de cobro o facturar.");
                            document.getElementById("customerName")?.focus();
                            return;
                          }
                          const errorStock = auditarStockCarritoRecetas(cart, carta);
                          if (errorStock) {
                            setErrorGlobal(errorStock);
                            return;
                          }
                          setModalPagoAbierto(true);
                        }}
                        className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl shadow-md gap-2"
                      >
                        <DollarSign className="size-4" />
                        <span>Venta Rápida / Cobrar Ahora</span>
                      </Button>

                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          disabled={cart.length === 0 || procesandoAccion}
                          onClick={() => ejecutarProcesarPos("ENVIAR_COCINA")}
                          className="h-10 text-xs font-bold rounded-xl gap-1.5 border-amber-500/40 text-amber-900 dark:text-amber-300 hover:bg-amber-500/10"
                        >
                          <ChefHat className="size-4" /> Cocina + Turno
                        </Button>

                        <Button
                          type="button"
                          variant="outline"
                          disabled={cart.length === 0 || procesandoAccion}
                          onClick={() => ejecutarProcesarPos("PARQUEAR")}
                          className="h-10 text-xs font-bold rounded-xl gap-1.5 border-brand/40 text-brand dark:text-[#3E9EA2] hover:bg-brand/10"
                        >
                          <PauseCircle className="size-4" /> Parquear Pedido
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          </div>

          {/* ── MODAL COBRO EXPRESS CON VERIFICACION DE CAMBIO / COMPROBANTE ──── */}
          {modalPagoAbierto && (
            <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <Card className="w-full max-w-md bg-card border-border shadow-2xl rounded-2xl overflow-hidden space-y-0 animate-in fade-in zoom-in-95 duration-200">
                <div className="p-4 border-b border-border bg-muted/30 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <DollarSign className="size-5 text-emerald-600 dark:text-emerald-400" />
                    <h3 className="font-bold text-base text-foreground">Cobro Directo en Caja</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setModalPagoAbierto(false)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-5" />
                  </button>
                </div>

                <div className="p-5 space-y-4">
                  {/* Total a pagar */}
                  <div className="text-center p-3 rounded-2xl bg-brand/5 border border-brand/20 space-y-0.5">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase">Total del Pedido</span>
                    <p className="numeral text-3xl font-extrabold text-brand dark:text-[#3E9EA2]">
                      {formatCop(totalCart)}
                    </p>
                  </div>

                  {/* Nombre Cliente en Modal */}
                  <div className="space-y-1 bg-muted/30 p-2.5 rounded-xl border border-border">
                    <Label htmlFor="modalCustomerName" className="text-xs font-semibold flex items-center justify-between">
                      <span>Cliente Factura / Ticket *</span>
                      <span className="text-[10px] font-bold text-rose-500">(Obligatorio)</span>
                    </Label>
                    <Input
                      id="modalCustomerName"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Ej. Carlos / Cliente Mostrador"
                      className="h-8 text-xs rounded-lg bg-background"
                      required
                    />
                  </div>

                  {/* Selector Método de Pago */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Método de Pago *</Label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { id: "EFECTIVO", label: "💵 Efectivo" },
                        { id: "NEQUI", label: "📱 Nequi" },
                        { id: "DAVIPLATA", label: "📱 Daviplata" },
                        { id: "TARJETA_DEBITO", label: "💳 T. Débito" },
                        { id: "TARJETA_CREDITO", label: "💳 T. Crédito" },
                        { id: "TRANSFERENCIA", label: "🏦 Transf." },
                      ].map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setMetodoPago(m.id as typeof metodoPago)}
                          className={cn(
                            "py-2 px-1.5 rounded-xl text-xs font-semibold transition-all border text-center",
                            metodoPago === m.id
                              ? "bg-brand text-brand-foreground border-brand font-bold shadow-sm"
                              : "bg-background text-foreground hover:bg-muted border-border"
                          )}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Si es EFECTIVO: Verificación de Pago y Devuelta */}
                  {metodoPago === "EFECTIVO" ? (
                    <div className="space-y-3 p-3.5 rounded-2xl bg-muted/40 border border-border">
                      <div className="space-y-1">
                        <Label htmlFor="montoRecibido" className="text-xs font-semibold">
                          Efectivo Recibido ($ COP)
                        </Label>
                        <Input
                          id="montoRecibido"
                          type="number"
                          value={montoRecibido}
                          onChange={(e) => setMontoRecibido(e.target.value)}
                          placeholder={totalCart.toString()}
                          className="h-10 text-base font-bold rounded-xl font-mono bg-background"
                        />
                      </div>

                      {/* Presets de billetes */}
                      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                        {[
                          { label: "Exacto", val: totalCart },
                          { label: "$20k", val: 20000 },
                          { label: "$50k", val: 50000 },
                          { label: "$100k", val: 100000 },
                        ].map((b) => (
                          <button
                            key={b.label}
                            type="button"
                            onClick={() => setMontoRecibido(b.val.toString())}
                            className="px-2.5 py-1 rounded-lg bg-background border border-border text-[11px] font-bold hover:bg-brand hover:text-brand-foreground transition-colors"
                          >
                            {b.label}
                          </button>
                        ))}
                      </div>

                      {/* Devuelta calculada */}
                      <div className="flex items-center justify-between pt-2 border-t border-border/60">
                        <span className="text-xs font-semibold text-muted-foreground">Cambio / Devuelta:</span>
                        <span className="numeral text-lg font-bold text-emerald-600 dark:text-emerald-400">
                          {formatCop(cambioDevuelta)}
                        </span>
                      </div>
                    </div>
                  ) : (
                    /* Si es Tarjeta / Electrónico: Número de comprobante obligatorio */
                    <div className="space-y-1.5 p-3.5 rounded-2xl bg-muted/40 border border-border">
                      <Label htmlFor="numeroComprobante" className="text-xs font-semibold">
                        Número de Comprobante / Referencias de Pago *
                      </Label>
                      <Input
                        id="numeroComprobante"
                        value={numeroComprobante}
                        onChange={(e) => setNumeroComprobante(e.target.value)}
                        placeholder="Ej. # 482910 / Aprobación datafono"
                        className="h-10 text-xs rounded-xl bg-background font-mono"
                        required
                      />
                      <span className="text-[11px] text-muted-foreground block">
                        Requerido para conciliación de pagos electrónicos y tarjetas.
                      </span>
                    </div>
                  )}

                  <div className="pt-2">
                    <Button
                      type="button"
                      disabled={procesandoAccion}
                      onClick={() => ejecutarProcesarPos("PAGAR_DIRECTO")}
                      className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl shadow-md gap-2"
                    >
                      {procesandoAccion ? "Procesando Cobro..." : "🚀 Confirmar Pago y Cerrar Pedido"}
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* ── MODAL DRAWER DE PEDIDOS PARQUEADOS / EN ESPERA ──────────────── */}
          {modalParqueadosAbierto && (
            <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <Card className="w-full max-w-lg bg-card border-border shadow-2xl rounded-2xl overflow-hidden space-y-0 animate-in fade-in zoom-in-95 duration-200">
                <div className="p-4 border-b border-border bg-muted/30 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <PauseCircle className="size-5 text-amber-500" />
                    <h3 className="font-bold text-base text-foreground">
                      Pedidos Parqueados / En Espera ({pedidosAbiertos.length})
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setModalParqueadosAbierto(false)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-5" />
                  </button>
                </div>

                <div className="p-4 max-h-[70vh] overflow-y-auto space-y-3">
                  {pedidosAbiertos.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground space-y-1">
                      <PauseCircle className="size-10 mx-auto opacity-30" />
                      <p className="text-sm font-semibold">No hay pedidos parqueados</p>
                      <p className="text-xs opacity-75">
                        Los pedidos que guardes con la opción &quot;Parquear Pedido&quot; aparecerán acá.
                      </p>
                    </div>
                  ) : (
                    pedidosAbiertos.map((p) => (
                      <div
                        key={p.id}
                        className="p-3.5 rounded-2xl border border-border bg-muted/30 hover:border-brand transition-all flex items-center justify-between gap-3"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-foreground">
                              Pedido #{p.code}
                            </span>
                            {p.turnNumber && (
                              <Badge variant="outline" className="text-[10px] bg-brand/10 text-brand">
                                Turno #{p.turnNumber}
                              </Badge>
                            )}
                            <Badge variant="secondary" className="text-[10px]">
                              {p.type === "DOMICILIO" ? "🛵 Domicilio" : "🛍️ Llevar"}
                            </Badge>
                          </div>
                          {p.customerName && (
                            <p className="text-xs font-medium text-muted-foreground truncate">
                              Cliente: {p.customerName}
                            </p>
                          )}
                          <p className="numeral text-xs font-bold text-brand dark:text-[#3E9EA2]">
                            Total: {formatCop(p.totalCop)}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setModalParqueadosAbierto(false);
                              router.push(`/pos?pedidoId=${p.id}`);
                            }}
                            className="h-8 text-xs font-bold rounded-xl"
                          >
                            Abrir / Cobrar →
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </Card>
            </div>
          )}

          {/* ── MODAL COMPACTO DE ALERTAS RAPIDAS DE STOCK ──── */}
          {modalAlertasStockAbierto && (
            <div className="fixed inset-0 bg-background/80 backdrop-blur-xs z-50 flex items-center justify-center p-4">
              <Card className="w-full max-w-lg bg-card border-border shadow-2xl rounded-2xl overflow-hidden space-y-0 animate-in fade-in zoom-in-95 duration-200">
                <div className="p-4 border-b border-border bg-muted/30 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="size-5 text-amber-500" />
                    <h3 className="font-bold text-base text-foreground">
                      Alertas Rápidas de Inventario
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setModalAlertasStockAbierto(false)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-5" />
                  </button>
                </div>

                <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
                  {alertasStockPos.length === 0 ? (
                    <div className="p-6 text-center text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 rounded-xl border border-emerald-500/20 font-medium">
                      🟢 Excelente: Todos los insumos y productos terminados cuentan con suficiente stock disponible.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground font-medium">
                        Resumen de insumos y productos con inventario crítico o por agotarse:
                      </p>
                      <div className="space-y-1.5">
                        {alertasStockPos.map((a) => (
                          <div
                            key={a.id}
                            className="p-3 rounded-xl bg-muted/40 border border-border flex items-center justify-between gap-3 text-xs"
                          >
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-foreground">{a.nombre}</span>
                                <Badge
                                  variant="outline"
                                  className="text-[9px] px-1.5 py-0 uppercase font-mono"
                                >
                                  {a.tipo === "INSUMO"
                                    ? "Insumo Receta"
                                    : a.tipo === "PRODUCTO_TERMINADO"
                                    ? "Producto Reventa"
                                    : "Plato Receta"}
                                </Badge>
                              </div>
                              <p className="text-[11px] text-muted-foreground">{a.detalle}</p>
                            </div>

                            <Badge
                              className={cn(
                                "text-[10px] font-bold shrink-0",
                                a.nivel === "CRITICO"
                                  ? "bg-rose-500 text-white"
                                  : "bg-amber-500 text-white"
                              )}
                            >
                              {a.nivel}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="pt-2 border-t border-border flex justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setModalAlertasStockAbierto(false);
                        router.push("/inventario");
                      }}
                      className="text-xs font-bold rounded-xl gap-1.5"
                    >
                      <Boxes className="size-3.5 text-brand" />
                      <span>Ir al Módulo de Inventario</span>
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
