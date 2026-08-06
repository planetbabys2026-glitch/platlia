"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bike,
  CheckCircle2,
  Clock,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  ShoppingBag,
  Utensils,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { crearPedidoClienteQR, consultarEstadoPedidoQR } from "@/features/pedidos/qr-actions";
import { formatCop } from "@/lib/money";
import { formatTurno } from "@/lib/turns";
import { cn } from "@/lib/utils";

type Producto = {
  id: string;
  name: string;
  description: string | null;
  priceCop: number;
  imageUrl: string | null;
  isAvailable: boolean;
  categoryId: string;
};

type Categoria = {
  id: string;
  name: string;
};

type CartItem = {
  producto: Producto;
  quantity: number;
  notes: string;
};

type ClienteMenuQrProps = {
  business: {
    name: string;
    slug: string;
    logoUrl: string | null;
    address: string | null;
    phone: string | null;
  };
  settings: {
    qrMenuEnabled: boolean;
    qrMenuBgMode: string;
    qrMenuBgColor: string;
    qrMenuBgGradient: string;
    qrMenuBgImageUrl: string | null;
    qrMenuLogoUrl: string | null;
    qrMenuHeaderTitle: string | null;
    qrMenuHeaderSubtitle: string | null;
    turnNumberMax: number;
  };
  categorias: Categoria[];
  productos: Producto[];
  placeholderUrl: string | null;
  mesaParam?: string;
  tableIdParam?: string;
  tipoParam?: string;
};

type TrackedItem = {
  id: string;
  nameSnapshot: string;
  quantity: number;
  unitPriceCop: number;
  lineTotalCop: number;
  status: string;
};

type TrackedOrder = {
  id: string;
  code: number;
  type: string;
  channel: string;
  status: string;
  deliveryStatus: string;
  turnNumber: number | null;
  customerName: string | null;
  customerPhone: string | null;
  deliveryAddress: string | null;
  totalCop: number;
  openedAt: Date | string;
  items: TrackedItem[];
};

export function ClienteMenuQr({
  business,
  settings,
  categorias,
  productos,
  placeholderUrl,
  mesaParam,
  tableIdParam,
}: ClienteMenuQrProps) {
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState<string>("todas");
  const [busqueda, setBusqueda] = useState("");
  const [carrito, setCarrito] = useState<Record<string, CartItem>>({});
  const [carritoAbierto, setCarritoAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [pedidoConfirmado, setPedidoConfirmado] = useState<{
    orderId: string;
    code: number;
    turnNumber: number;
    type: string;
    totalCop: number;
  } | null>(null);

  // Formulario cliente (para domicilios / sin mesa)
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [docType, setDocType] = useState("CC");
  const [docNumber, setDocNumber] = useState("");

  // Trazabilidad y Consulta por Celular / N° Pedido vía Redis SSE
  const [queryConsulta, setQueryConsulta] = useState("");
  const [cargandoConsulta, setCargandoConsulta] = useState(false);
  const [errorConsulta, setErrorConsulta] = useState<string | null>(null);
  const [modalConsultaAbierto, setModalConsultaAbierto] = useState(false);
  const [pedidoActivoTrack, setPedidoActivoTrack] = useState<TrackedOrder | null>(null);

  // Conectar a Redis SSE stream cuando hay un pedido siendo rastreado
  useEffect(() => {
    if (!pedidoActivoTrack?.id) return;

    const eventSource = new EventSource("/api/domicilios/stream");
    eventSource.onmessage = async () => {
      const qTarget = pedidoActivoTrack.customerPhone || pedidoActivoTrack.code.toString();
      if (qTarget) {
        const res = await consultarEstadoPedidoQR(business.slug, qTarget);
        if (res.ok && res.order) {
          setPedidoActivoTrack(res.order as TrackedOrder);
        }
      }
    };

    return () => {
      eventSource.close();
    };
  }, [pedidoActivoTrack?.id, pedidoActivoTrack?.customerPhone, pedidoActivoTrack?.code, business.slug]);

  const consultarPedido = async (busquedaDirecta?: string) => {
    const target = (busquedaDirecta || queryConsulta).trim();
    if (!target) {
      setErrorConsulta("Ingresá un celular o número de pedido.");
      return;
    }

    setCargandoConsulta(true);
    setErrorConsulta(null);

    try {
      const res = await consultarEstadoPedidoQR(business.slug, target);
      if (res.ok && res.order) {
        setPedidoActivoTrack(res.order as TrackedOrder);
        setModalConsultaAbierto(false);
      } else {
        setErrorConsulta(res.error || "No encontramos pedidos recientes con ese número.");
      }
    } catch {
      setErrorConsulta("No se pudo realizar la consulta en este momento.");
    } finally {
      setCargandoConsulta(false);
    }
  };

  const esMesa = Boolean(mesaParam);
  const logo = settings.qrMenuLogoUrl || business.logoUrl;
  const titulo = settings.qrMenuHeaderTitle || business.name;
  const subtitulo = settings.qrMenuHeaderSubtitle || (esMesa ? `Atención en Mesa ${mesaParam}` : "Menú Digital");

  // Estilos de Fondo según configuración del Propietario
  const backgroundStyle = useMemo(() => {
    if (settings.qrMenuBgMode === "PATTERN_IMAGE" && settings.qrMenuBgImageUrl) {
      return {
        backgroundImage: `url(${settings.qrMenuBgImageUrl})`,
        backgroundRepeat: "repeat",
        backgroundPosition: "top left",
      };
    }
    if (settings.qrMenuBgMode === "GRADIENT") {
      return {
        background: settings.qrMenuBgGradient || "linear-gradient(135deg, #101416 0%, #1D4E51 100%)",
      };
    }
    return {
      backgroundColor: settings.qrMenuBgColor || "#101416",
    };
  }, [settings]);

  // Productos filtrados
  const productosFiltrados = useMemo(() => {
    return productos.filter((p) => {
      const coincideCat = categoriaSeleccionada === "todas" || p.categoryId === categoriaSeleccionada;
      const coincideBusqueda =
        !busqueda ||
        p.name.toLowerCase().includes(busqueda.toLowerCase()) ||
        (p.description && p.description.toLowerCase().includes(busqueda.toLowerCase()));
      return coincideCat && coincideBusqueda;
    });
  }, [productos, categoriaSeleccionada, busqueda]);

  // Manejo de Carrito
  const agregarItem = (producto: Producto) => {
    setCarrito((prev) => {
      const actual = prev[producto.id];
      const nuevaCantidad = (actual?.quantity ?? 0) + 1;
      return {
        ...prev,
        [producto.id]: {
          producto,
          quantity: nuevaCantidad,
          notes: actual?.notes ?? "",
        },
      };
    });
  };

  const quitarItem = (productoId: string) => {
    setCarrito((prev) => {
      const actual = prev[productoId];
      if (!actual) return prev;
      if (actual.quantity <= 1) {
        const copia = { ...prev };
        delete copia[productoId];
        return copia;
      }
      return {
        ...prev,
        [productoId]: {
          ...actual,
          quantity: actual.quantity - 1,
        },
      };
    });
  };

  const cambiarNota = (productoId: string, notes: string) => {
    setCarrito((prev) => {
      const actual = prev[productoId];
      if (!actual) return prev;
      return {
        ...prev,
        [productoId]: { ...actual, notes },
      };
    });
  };

  const cartList = useMemo(() => Object.values(carrito), [carrito]);

  const totalItems = useMemo(
    () => cartList.reduce((acc, i) => acc + i.quantity, 0),
    [cartList],
  );

  const totalCop = useMemo(
    () => cartList.reduce((acc, i) => acc + i.producto.priceCop * i.quantity, 0),
    [cartList],
  );

  // Enviar pedido al backend
  const enviarPedido = async () => {
    if (cartList.length === 0) return;
    setErrorEnvio(null);

    if (!esMesa) {
      if (!customerPhone.trim()) {
        setErrorEnvio("Ingresá tu número de celular para despachar tu pedido.");
        return;
      }
      if (!customerAddress.trim()) {
        setErrorEnvio("Ingresá la dirección exacta de entrega para tu pedido.");
        return;
      }
    }

    setCargando(true);

    try {
      const res = await crearPedidoClienteQR({
        businessSlug: business.slug,
        type: esMesa ? "MESA" : "DOMICILIO",
        tableId: tableIdParam,
        tableName: mesaParam,
        customerName: customerName.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        customerAddress: customerAddress.trim() || undefined,
        docType: docType || undefined,
        docNumber: docNumber.trim() || undefined,
        items: cartList.map((i) => ({
          productId: i.producto.id,
          quantity: i.quantity,
          notes: i.notes.trim() || undefined,
        })),
      });

      if (!res.ok || !res.data) {
        setErrorEnvio(res.error || "No se pudo procesar tu pedido.");
        setCargando(false);
        return;
      }

      setPedidoConfirmado(res.data);
      setCarrito({});
      setCarritoAbierto(false);

      // Iniciar trazabilidad en vivo
      const queryTarget = customerPhone.trim() || res.data.code.toString();
      void consultarPedido(queryTarget);
    } catch {
      setErrorEnvio("Ocurrió un error inesperado al enviar tu pedido.");
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="min-h-screen text-slate-100 selection:bg-brand selection:text-white" style={backgroundStyle}>
      <div className="mx-auto max-w-md min-h-screen flex flex-col relative pb-24 shadow-2xl bg-black/30 backdrop-blur-sm border-x border-white/10">
        
        {/* ─────────────────────────────────────────────────────────────
            HEADER / BRANDING DEL RESTAURANTE
            ───────────────────────────────────────────────────────────── */}
        <header className="p-6 text-center space-y-3 relative border-b border-white/10 bg-gradient-to-b from-black/50 to-transparent">
          {logo ? (
            <img
              src={logo}
              alt={titulo}
              className="size-20 mx-auto rounded-full object-cover border-2 border-brand/60 shadow-xl"
            />
          ) : (
            <div className="size-16 mx-auto rounded-full bg-brand/20 border border-brand/40 flex items-center justify-center text-brand dark:text-brand-accent text-2xl font-black">
              {business.name.slice(0, 2).toUpperCase()}
            </div>
          )}

          <div>
            <h1 className="text-2xl font-black tracking-tight text-white">{titulo}</h1>
            <p className="text-xs font-medium text-slate-300/90 mt-0.5">{subtitulo}</p>
          </div>

          <div className="flex items-center justify-center gap-2 pt-1 flex-wrap">
            {esMesa ? (
              <Badge variant="default" className="bg-emerald-500 text-slate-950 font-extrabold px-3 py-1 text-xs shadow-md">
                🪑 Mesa {mesaParam}
              </Badge>
            ) : (
              <Badge variant="outline" className="border-brand/40 text-brand-accent font-bold px-3 py-1 text-xs">
                🛵 Domicilio / Para Llevar
              </Badge>
            )}

            <button
              type="button"
              onClick={() => setModalConsultaAbierto(true)}
              className="bg-white/10 hover:bg-white/20 text-white font-bold text-xs px-3 py-1 rounded-full border border-white/20 flex items-center gap-1 transition-all"
            >
              <Search className="size-3 text-brand-accent" /> Rastrear Pedido
            </button>
          </div>
        </header>

        {/* ─────────────────────────────────────────────────────────────
            RASTREADOR DE PEDIDO EN TIEMPO REAL (REDIS SSE STREAM)
            ───────────────────────────────────────────────────────────── */}
        {pedidoActivoTrack && (
          <div className="mx-4 my-3 p-4 rounded-2xl bg-slate-900/95 border-2 border-brand/50 shadow-2xl text-slate-100 space-y-4 animate-in fade-in duration-300">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <div className="flex items-center gap-2">
                <span className="font-black text-lg text-white">Pedido #{pedidoActivoTrack.code}</span>
                <Badge variant="outline" className="text-[10px] border-emerald-500/50 text-emerald-400 font-extrabold gap-1">
                  <span className="size-2 rounded-full bg-emerald-400 animate-ping inline-block" /> En vivo (Redis)
                </Badge>
              </div>
              <button
                type="button"
                onClick={() => setPedidoActivoTrack(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Progreso de Pasos (Trazabilidad en tiempo real) */}
            <div className="space-y-2 py-1">
              <div className="grid grid-cols-4 gap-1.5 text-center text-[10px] font-bold">
                {/* Paso 1: Recibido */}
                <div className={cn("p-2 rounded-xl border flex flex-col items-center gap-1", "bg-amber-500/20 text-amber-300 border-amber-500/40")}>
                  <Clock className="size-4" />
                  <span>1. Recibido</span>
                </div>

                {/* Paso 2: Cocina */}
                <div
                  className={cn(
                    "p-2 rounded-xl border flex flex-col items-center gap-1 transition-all",
                    ["EN_PREPARACION", "EN_CAMINO", "ENTREGADO"].includes(pedidoActivoTrack.deliveryStatus)
                      ? "bg-orange-500/20 text-orange-300 border-orange-500/50 shadow-sm"
                      : "bg-white/5 text-slate-500 border-white/10 opacity-50",
                  )}
                >
                  <Utensils className="size-4" />
                  <span>2. Cocina</span>
                </div>

                {/* Paso 3: En Reparto */}
                <div
                  className={cn(
                    "p-2 rounded-xl border flex flex-col items-center gap-1 transition-all",
                    ["EN_CAMINO", "ENTREGADO"].includes(pedidoActivoTrack.deliveryStatus)
                      ? "bg-blue-500/20 text-blue-300 border-blue-500/50 shadow-sm"
                      : "bg-white/5 text-slate-500 border-white/10 opacity-50",
                  )}
                >
                  <Bike className="size-4" />
                  <span>3. En Reparto</span>
                </div>

                {/* Paso 4: Entregado */}
                <div
                  className={cn(
                    "p-2 rounded-xl border flex flex-col items-center gap-1 transition-all",
                    pedidoActivoTrack.deliveryStatus === "ENTREGADO"
                      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm"
                      : "bg-white/5 text-slate-500 border-white/10 opacity-50",
                  )}
                >
                  <CheckCircle2 className="size-4" />
                  <span>4. Entregado</span>
                </div>
              </div>
            </div>

            {/* Detalles del Estado */}
            <div className="rounded-xl bg-white/5 p-3 space-y-1.5 text-xs border border-white/10">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Estado de Entrega:</span>
                <span className="font-extrabold text-brand-accent">
                  {pedidoActivoTrack.deliveryStatus === "PENDIENTE" && "🟡 Recibido por el restaurante"}
                  {pedidoActivoTrack.deliveryStatus === "EN_PREPARACION" && "🟠 En preparación por la cocina"}
                  {pedidoActivoTrack.deliveryStatus === "EN_CAMINO" && "🔵 ¡En camino a tu ubicación!"}
                  {pedidoActivoTrack.deliveryStatus === "ENTREGADO" && "🟢 ¡Entregado! Que lo disfrutes."}
                  {pedidoActivoTrack.deliveryStatus === "CANCELADO" && "🔴 Anulado por el restaurante"}
                </span>
              </div>

              {pedidoActivoTrack.deliveryAddress && (
                <div className="flex items-center gap-1 text-[11px] text-slate-300 pt-1 border-t border-white/10">
                  <MapPin className="size-3 text-brand-accent shrink-0" />
                  <span className="truncate">{pedidoActivoTrack.deliveryAddress}</span>
                </div>
              )}
            </div>

            <div className="flex justify-between items-center pt-1 text-xs">
              <span className="text-slate-400">Total: <strong className="text-white numeral font-bold">{formatCop(pedidoActivoTrack.totalCop)}</strong></span>
              <button
                type="button"
                onClick={() => consultarPedido(pedidoActivoTrack.customerPhone || pedidoActivoTrack.code.toString())}
                className="text-brand-accent hover:underline font-bold text-[11px] flex items-center gap-1"
              >
                <RefreshCw className="size-3" /> Refrescar estado
              </button>
            </div>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────────
            MODAL DE CONSULTA DE PEDIDO POR CELULAR / N° PEDIDO
            ───────────────────────────────────────────────────────────── */}
        {modalConsultaAbierto && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-sm bg-slate-900 border border-white/15 rounded-2xl p-5 space-y-4 text-slate-100 shadow-2xl animate-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <h3 className="font-extrabold text-base text-white flex items-center gap-2">
                  🔍 Rastrear Pedido
                </h3>
                <button type="button" onClick={() => setModalConsultaAbierto(false)} className="text-slate-400 hover:text-white">
                  <X className="size-5" />
                </button>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                Ingresá tu número de <strong>celular / WhatsApp</strong> o el <strong>número de pedido (#)</strong> para ver el estado en tiempo real.
              </p>

              <div className="space-y-3">
                <Input
                  value={queryConsulta}
                  onChange={(e) => setQueryConsulta(e.target.value)}
                  placeholder="Ej: 3001234567 o #12"
                  className="bg-white/10 border-white/20 text-white text-sm h-11 rounded-xl placeholder:text-slate-500"
                />

                {errorConsulta && (
                  <p className="text-xs text-red-400 font-semibold">{errorConsulta}</p>
                )}

                <Button
                  type="button"
                  disabled={cargandoConsulta}
                  onClick={() => consultarPedido()}
                  className="w-full bg-brand hover:bg-brand/90 text-white font-bold h-11 rounded-xl text-xs gap-2"
                >
                  {cargandoConsulta ? "Buscando pedido..." : "🔍 Consultar Estado"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────────
            PANTALLA DE PEDIDO CONFIRMADO EN TIEMPO REAL
            ───────────────────────────────────────────────────────────── */}
        {pedidoConfirmado ? (
          <div className="p-6 space-y-6 text-center animate-in fade-in zoom-in duration-300 my-auto">
            <div className="size-20 mx-auto rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center text-4xl shadow-xl animate-pulse">
              👨‍🍳
            </div>

            <div className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-widest text-emerald-400">
                ¡Pedido Enviado a la Cocina!
              </span>
              <h2 className="text-3xl font-black text-white">Pedido #{pedidoConfirmado.code}</h2>
              <div className="inline-block rounded-2xl bg-brand/30 border border-brand/50 px-5 py-3 text-center my-2 shadow-inner">
                <span className="text-xs font-bold text-slate-300 block uppercase tracking-wider">Tu Turno de Entrega</span>
                <span className="text-4xl font-black text-emerald-400 block mt-0.5 numeral">
                  {formatTurno(pedidoConfirmado.turnNumber, settings.turnNumberMax, pedidoConfirmado.type === "MESA")}
                </span>
              </div>
              <p className="text-xs text-slate-300 max-w-xs mx-auto leading-relaxed">
                {esMesa
                  ? `Tu pedido para la Mesa ${mesaParam} ya fue recibido por nuestro equipo de cocina.`
                  : "Tu pedido ya está en preparación. ¡Te avisaremos cuando esté listo!"}
              </p>
            </div>

            <Card className="bg-white/5 border-white/10 text-slate-200 text-left">
              <CardContent className="p-4 space-y-2 text-xs">
                <div className="flex justify-between font-bold text-sm text-white border-b border-white/10 pb-2">
                  <span>Total del Pedido</span>
                  <span className="numeral">{formatCop(pedidoConfirmado.totalCop)}</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Estado: <strong className="text-emerald-400">En Preparación 👨‍🍳</strong>
                </p>
              </CardContent>
            </Card>

            <Button
              type="button"
              onClick={() => setPedidoConfirmado(null)}
              className="w-full bg-brand hover:bg-brand/90 text-white font-bold h-12 rounded-xl text-sm shadow-lg"
            >
              Hacer otro pedido
            </Button>
          </div>
        ) : (
          <>
            {/* ─────────────────────────────────────────────────────────────
                BARRA DE BÚSQUEDA Y CATEGORÍAS
                ───────────────────────────────────────────────────────────── */}
            <div className="p-4 space-y-3 sticky top-0 bg-black/70 backdrop-blur-md z-20 border-b border-white/10">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 size-4 text-slate-400" />
                <Input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar plato, bebida, postre..."
                  className="pl-9 h-10 bg-white/10 border-white/15 text-white placeholder:text-slate-400 text-xs rounded-xl focus-visible:ring-brand"
                />
                {busqueda && (
                  <button
                    type="button"
                    onClick={() => setBusqueda("")}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-white"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>

              {/* Píldoras de Categorías */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                <button
                  type="button"
                  onClick={() => setCategoriaSeleccionada("todas")}
                  className={cn(
                    "rounded-full px-3.5 py-1.5 text-xs font-bold transition-all shrink-0 border",
                    categoriaSeleccionada === "todas"
                      ? "bg-brand text-white border-brand shadow-md scale-[1.02]"
                      : "bg-white/5 text-slate-300 border-white/10 hover:bg-white/10",
                  )}
                >
                  Todas ({productos.length})
                </button>
                {categorias.map((cat) => {
                  const count = productos.filter((p) => p.categoryId === cat.id).length;
                  if (count === 0) return null;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setCategoriaSeleccionada(cat.id)}
                      className={cn(
                        "rounded-full px-3.5 py-1.5 text-xs font-bold transition-all shrink-0 border",
                        categoriaSeleccionada === cat.id
                          ? "bg-brand text-white border-brand shadow-md scale-[1.02]"
                          : "bg-white/5 text-slate-300 border-white/10 hover:bg-white/10",
                      )}
                    >
                      {cat.name} ({count})
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ─────────────────────────────────────────────────────────────
                LISTA DE PRODUCTOS Y TARJETAS ULTRAPREMIUM
                ───────────────────────────────────────────────────────────── */}
            <main className="p-4 flex-1 space-y-3.5">
              {productosFiltrados.length === 0 ? (
                <div className="p-8 text-center space-y-3 my-12 bg-white/5 rounded-3xl border border-white/10">
                  <Utensils className="size-10 mx-auto text-slate-500 animate-pulse" />
                  <p className="text-sm font-semibold text-slate-300">No se encontraron productos</p>
                  <p className="text-xs text-slate-500">Prueba con otra palabra de búsqueda o categoría.</p>
                </div>
              ) : (
                productosFiltrados.map((producto) => {
                  const itemEnCarrito = carrito[producto.id];
                  const cantidad = itemEnCarrito?.quantity ?? 0;
                  const foto = producto.imageUrl || placeholderUrl;

                  return (
                    <Card
                      key={producto.id}
                      className={cn(
                        "bg-white/5 backdrop-blur-md border-white/10 text-slate-100 overflow-hidden transition-all duration-300 hover:border-brand/60 hover:bg-white/[0.08] shadow-md hover:shadow-xl hover:scale-[1.01] rounded-2xl group",
                        !producto.isAvailable && "opacity-50 grayscale",
                      )}
                    >
                      <CardContent className="p-3.5 flex gap-3.5 items-center">
                        {foto ? (
                          <div className="relative overflow-hidden rounded-2xl size-24 shrink-0 bg-slate-900 border border-white/10 shadow-inner">
                            <img
                              src={foto}
                              alt={producto.name}
                              className="size-full object-cover group-hover:scale-105 transition-transform duration-500"
                            />
                            {cantidad > 0 && (
                              <div className="absolute top-1 right-1 bg-emerald-500 text-slate-950 font-black text-[10px] size-5 rounded-full flex items-center justify-center shadow-lg animate-in zoom-in">
                                {cantidad}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="size-24 rounded-2xl bg-brand/20 border border-brand/40 shrink-0 flex items-center justify-center text-brand dark:text-brand-accent font-black text-2xl shadow-inner relative">
                            {producto.name.slice(0, 2).toUpperCase()}
                            {cantidad > 0 && (
                              <div className="absolute top-1 right-1 bg-emerald-500 text-slate-950 font-black text-[10px] size-5 rounded-full flex items-center justify-center shadow-lg animate-in zoom-in">
                                {cantidad}
                              </div>
                            )}
                          </div>
                        )}

                        <div className="flex-1 space-y-1 min-w-0">
                          <div className="flex items-start justify-between gap-1">
                            <h3 className="font-extrabold text-sm text-white leading-snug truncate group-hover:text-brand-accent transition-colors">
                              {producto.name}
                            </h3>
                          </div>

                          {producto.description && (
                            <p className="text-[11px] text-slate-300/80 line-clamp-2 leading-relaxed">
                              {producto.description}
                            </p>
                          )}

                          <div className="flex items-center justify-between gap-2 pt-1.5">
                            <span className="numeral text-base font-black text-brand-accent">
                              {formatCop(producto.priceCop)}
                            </span>

                            {!producto.isAvailable ? (
                              <Badge variant="outline" className="border-red-500/40 text-red-400 text-[10px] font-bold">
                                Agotado
                              </Badge>
                            ) : cantidad > 0 ? (
                              <div className="flex items-center gap-1.5 bg-brand/30 border border-brand/50 rounded-xl p-1 shadow-sm">
                                <button
                                  type="button"
                                  onClick={() => quitarItem(producto.id)}
                                  className="size-7 rounded-lg bg-black/50 hover:bg-black/80 flex items-center justify-center font-black text-white text-sm transition-all active:scale-90"
                                >
                                  −
                                </button>
                                <span className="numeral font-black text-xs w-5 text-center text-white">{cantidad}</span>
                                <button
                                  type="button"
                                  onClick={() => agregarItem(producto)}
                                  className="size-7 rounded-lg bg-brand hover:bg-brand/90 flex items-center justify-center font-black text-white text-sm transition-all active:scale-90 shadow-md"
                                >
                                  +
                                </button>
                              </div>
                            ) : (
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => agregarItem(producto)}
                                className="bg-brand hover:bg-brand/90 text-white font-extrabold h-8.5 px-3.5 text-xs rounded-xl shadow-md gap-1 transition-all active:scale-95"
                              >
                                <Plus className="size-3.5" /> Agregar
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </main>

            {/* ─────────────────────────────────────────────────────────────
                BARRA FLOTANTE INFERIOR DE VER PEDIDO
                ───────────────────────────────────────────────────────────── */}
            {totalItems > 0 && (
              <div className="fixed bottom-0 inset-x-0 p-4 z-30 max-w-md mx-auto">
                <Button
                  type="button"
                  onClick={() => setCarritoAbierto(true)}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold h-14 rounded-2xl shadow-2xl flex items-center justify-between px-5 text-sm transition-all hover:scale-[1.02]"
                >
                  <div className="flex items-center gap-2">
                    <ShoppingBag className="size-5" />
                    <span>Ver mi pedido ({totalItems})</span>
                  </div>
                  <span className="numeral text-base font-black">{formatCop(totalCop)}</span>
                </Button>
              </div>
            )}

            {/* ─────────────────────────────────────────────────────────────
                DRAWER / MODAL DEL CARRITO DE COMPRAS
                ───────────────────────────────────────────────────────────── */}
            {carritoAbierto && (
              <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
                <div className="bg-slate-900 border-t border-white/10 rounded-t-3xl p-6 space-y-5 max-w-md mx-auto w-full max-h-[85vh] flex flex-col shadow-2xl">
                  
                  {/* Header Drawer */}
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <div className="flex items-center gap-2">
                      <ShoppingBag className="size-5 text-emerald-400" />
                      <h2 className="text-lg font-bold text-white">Resumen de tu Pedido</h2>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setCarritoAbierto(false)}
                      className="text-slate-400 hover:text-white"
                    >
                      <X className="size-5" />
                    </Button>
                  </div>

                  {/* Advertencia de Error */}
                  {errorEnvio && (
                    <div className="p-3 rounded-xl bg-red-500/20 border border-red-500/40 text-red-300 text-xs font-semibold">
                      {errorEnvio}
                    </div>
                  )}

                  {/* Formulario Domicilio si no es Mesa */}
                  {!esMesa && (
                    <div className="space-y-3 p-3 rounded-xl bg-white/5 border border-white/10 text-xs">
                      <h3 className="font-bold text-slate-200 text-xs uppercase tracking-wider">
                        Datos de Entrega (Domicilio)
                      </h3>
                      <div className="space-y-2">
                        <Input
                          value={customerName}
                          onChange={(e) => setCustomerName(e.target.value)}
                          placeholder="Tu Nombre completo *"
                          required
                          className="h-9 bg-white/10 border-white/15 text-white text-xs"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <Input
                            value={customerPhone}
                            onChange={(e) => setCustomerPhone(e.target.value)}
                            placeholder="Celular / WhatsApp *"
                            required
                            className="h-9 bg-white/10 border-white/15 text-white text-xs"
                          />
                          <Input
                            value={customerAddress}
                            onChange={(e) => setCustomerAddress(e.target.value)}
                            placeholder="Dirección exacta *"
                            required
                            className="h-9 bg-white/10 border-white/15 text-white text-xs"
                          />
                        </div>
                        <div className="grid grid-cols-3 gap-2 pt-1 border-t border-white/10">
                          <select
                            value={docType}
                            onChange={(e) => setDocType(e.target.value)}
                            className="h-9 bg-slate-800 border border-white/15 text-white text-xs rounded-md px-2"
                          >
                            <option value="CC">CC</option>
                            <option value="NIT">NIT</option>
                            <option value="CE">CE</option>
                            <option value="PASAPORTE">Pasaporte</option>
                          </select>
                          <Input
                            value={docNumber}
                            onChange={(e) => setDocNumber(e.target.value)}
                            placeholder="Nº Documento (opcional)"
                            className="col-span-2 h-9 bg-white/10 border-white/15 text-white text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Renglones de productos agregados */}
                  <div className="flex-1 overflow-y-auto space-y-3 pr-1 scrollbar-thin">
                    {cartList.map((item) => (
                      <div
                        key={item.producto.id}
                        className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-2 text-xs"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-0.5">
                            <span className="font-bold text-white text-sm block">{item.producto.name}</span>
                            <span className="numeral text-brand-accent font-semibold">
                              {formatCop(item.producto.priceCop * item.quantity)}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 bg-black/40 border border-white/10 rounded-lg p-1">
                            <button
                              type="button"
                              onClick={() => quitarItem(item.producto.id)}
                              className="size-6 rounded bg-white/10 text-white font-bold text-xs"
                            >
                              −
                            </button>
                            <span className="numeral font-bold text-xs w-4 text-center text-white">{item.quantity}</span>
                            <button
                              type="button"
                              onClick={() => agregarItem(item.producto)}
                              className="size-6 rounded bg-brand text-white font-bold text-xs"
                            >
                              +
                            </button>
                          </div>
                        </div>

                        <Input
                          value={item.notes}
                          onChange={(e) => cambiarNota(item.producto.id, e.target.value)}
                          placeholder="Notas (sin salsa, bien cocido...)"
                          className="h-7 bg-white/5 border-white/10 text-[11px] text-white placeholder:text-slate-500"
                        />
                      </div>
                    ))}
                  </div>

                  {/* Total y Confirmación */}
                  <div className="border-t border-white/10 pt-3 space-y-3">
                    <div className="flex justify-between items-center text-base font-extrabold text-white">
                      <span>Total a Pagar</span>
                      <span className="numeral text-xl text-emerald-400">{formatCop(totalCop)}</span>
                    </div>

                    <Button
                      type="button"
                      onClick={enviarPedido}
                      disabled={cargando}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold h-13 rounded-xl text-sm shadow-xl gap-2"
                    >
                      {cargando ? "Enviando a la cocina…" : "🚀 Confirmar y Enviar Pedido"}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
