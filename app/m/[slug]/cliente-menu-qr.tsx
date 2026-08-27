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
import {
  SelectorModificadores,
  tieneModificadores,
  type ProductoConModificadores,
} from "@/features/carta/components/selector-modificadores";
import { claveDeLinea } from "@/lib/modificadores";
import { olvidarPedido, pedidoRecordado, recordarPedido } from "./pedido-recordado";
import { SeccionPlegable } from "@/components/marca/seccion-plegable";
import { acentoSirveComoTexto, mezclarHacia, textoSobre } from "@/lib/contraste";
import { SelectorDePropina } from "@/features/pedidos/components/propina";
import { formatCop } from "@/lib/money";
import { calcularStockDisponibleProducto } from "@/lib/inventory/stock";
import { computeSuggestedTip } from "@/lib/tax";
import { formatTurno } from "@/lib/turns";
import { cn } from "@/lib/utils";

type Producto = ProductoConModificadores & {
  id: string;
  name: string;
  shortDescription: string | null;
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
  /**
   * La identidad del renglón: el mismo plato con proteínas distintas son dos
   * renglones. El carrito se indexa por esto y no por el id del producto.
   */
  lineKey: string;
  producto: Producto;
  quantity: number;
  notes: string;
  opciones: Array<{ id: string; name: string; priceDeltaCop: number }>;
};

/** Lo que cuesta una unidad del renglón, ya con sus modificadores. */
function precioUnitarioQR(item: CartItem): number {
  return item.producto.priceCop + item.opciones.reduce((acc, o) => acc + o.priceDeltaCop, 0);
}

type ClienteMenuQrProps = {
  business: {
    name: string;
    slug: string;
    logoUrl: string | null;
    address: string | null;
    phone: string | null;
  };
  settings: {
    inventoryEnabled: boolean;
    permitirVentaSinStock: boolean;
    qrMenuEnabled: boolean;
    qrMenuBgMode: string;
    qrMenuBgColor: string;
    qrMenuBgGradient: string;
    qrMenuBgImageUrl: string | null;
    qrMenuLogoUrl: string | null;
    qrMenuHeaderTitle: string | null;
    qrMenuHeaderSubtitle: string | null;
    qrMenuAccent: string;
    turnNumberMax: number;
    deliveryEnabled?: boolean;
    deliveryPaused?: boolean;
    /** Si el local está recibiendo domicilios AHORA. Lo mueve el cajero. */
    qrDeliveryEnabled?: boolean;
    deliveryFeeCop?: number;
    /** Si el negocio sugiere propina, y con qué tarifa. */
    tipSuggestionEnabled: boolean;
    tipSuggestionRateBp: number;
    estimatedPrepTimeText?: string | null;
  };
  estadoNegocio?: {
    abierto: boolean;
    razon?: string;
    scheduleStatus: string;
    horaApertura: string;
    horaCierre: string;
  };
  categorias: Categoria[];
  productos: Producto[];
  placeholderUrl: string | null;
  mesaParam?: string;
  tableIdParam?: string;
  /** El QR apunta a una mesa que ya no existe o no es de este negocio. */
  mesaInvalida?: boolean;
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
  estadoNegocio,
  categorias,
  productos,
  placeholderUrl,
  mesaParam,
  tableIdParam,
  mesaInvalida,
}: ClienteMenuQrProps) {
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState<string>("todas");
  const [busqueda, setBusqueda] = useState("");
  const [carrito, setCarrito] = useState<Record<string, CartItem>>({});
  /** El producto cuyo modal de opciones está abierto. */
  const [productoAElegir, setProductoAElegir] = useState<Producto | null>(null);
  const [carritoAbierto, setCarritoAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  /**
   * "Se acabó la cerveza", dicho arriba de la barra del pedido.
   *
   * Las tarjetas ya se pintan agotadas, así que esto es el respaldo para el caso
   * en que se acabe entre que cargó la carta y el comensal tocó: sin un lugar
   * donde decirlo, el toque simplemente no hacía nada.
   */
  const [avisoStock, setAvisoStock] = useState<string | null>(null);
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

  /**
   * Al abrir la pantalla, recuperar el pedido de este teléfono.
   *
   * Solo se guarda el id, y solo por unas horas: ver `pedido-recordado.ts`. Si el
   * servidor no lo encuentra —venció el día de negocio, o el pedido se anuló— se
   * olvida en vez de dejar el recuerdo colgado para siempre.
   */
  useEffect(() => {
    const id = pedidoRecordado(business.slug);
    if (!id) return;

    let vigente = true;
    void (async () => {
      const res = await consultarEstadoPedidoQR(business.slug, id);
      if (!vigente) return;
      if (res.ok && res.order) setPedidoActivoTrack(res.order as TrackedOrder);
      else olvidarPedido(business.slug);
    })();

    return () => {
      vigente = false;
    };
    // Solo al montar: es la recuperación de la sesión anterior.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Conectar a Redis SSE stream cuando hay un pedido siendo rastreado
  useEffect(() => {
    if (!pedidoActivoTrack?.id) return;

    // Contra la ruta pública del pedido: `/api/domicilios/stream` exige sesión y
    // licencia, así que a un comensal le contestaba 401 y el rastreo solo avanzaba
    // con el botón de refrescar.
    const eventSource = new EventSource(
      `/api/qr/pedido/${encodeURIComponent(pedidoActivoTrack.id)}/stream`,
    );
    eventSource.onmessage = async () => {
      // Por id: el pedido de mesa no tiene teléfono, y el número de pedido dejó
      // de servir para consultar porque se adivinaba probando 1, 2, 3…
      const res = await consultarEstadoPedidoQR(business.slug, pedidoActivoTrack.id);
      if (res.ok && res.order) {
        setPedidoActivoTrack(res.order as TrackedOrder);
      }
    };

    return () => {
      eventSource.close();
    };
  }, [pedidoActivoTrack?.id, business.slug]);

  const consultarPedido = async (busquedaDirecta?: string) => {
    const target = (busquedaDirecta || queryConsulta).trim();
    if (!target) {
      setErrorConsulta("Ingresá tu número de celular.");
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

  // La mesa la resolvió el servidor contra la base: si hay id, hay mesa de verdad.
  // Antes esto miraba la etiqueta de la URL, así que `?mesa=lo+que+sea` abría el
  // flujo de mesa sin ninguna mesa detrás.
  const esMesa = Boolean(tableIdParam);

  /**
   * El local no está recibiendo domicilios en este momento.
   *
   * Solo afecta a quien NO está sentado en una mesa: alguien adentro puede pedir
   * igual, porque para estar ahí el local tuvo que abrir.
   */
  const domiciliosCerrados = !esMesa && settings.qrDeliveryEnabled === false;

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
      backgroundColor: settings.qrMenuBgColor || "#171512",
    };
  }, [settings]);

  /**
   * La escala del menú, derivada del acento que eligió el negocio.
   *
   * Va como variables CSS en el `style` del contenedor en vez de clases fijas
   * porque el color no se conoce hasta que se lee la base: son seis temas —y un
   * color libre— y hasta ahora todos terminaban con el naranja de Platlia encima.
   *
   * Los textos son papel con transparencia y no `slate-400/500`: sobre un fondo
   * que el dueño elige, un gris fijo puede quedar en cualquier contraste, y esto
   * se lee en la calle, con sol y con el brillo del celular al mínimo.
   */
  const tema = useMemo(() => {
    const acento = settings.qrMenuAccent || "#FF4E1F";
    const fondo =
      settings.qrMenuBgMode === "SOLID" ? settings.qrMenuBgColor || "#171512" : "#171512";
    // Un acento oscuro sirve para rellenar un botón pero desaparece escrito
    // sobre un fondo oscuro: ahí se aclara antes de usarlo como texto.
    const acentoTexto = acentoSirveComoTexto(acento, fondo)
      ? acento
      : mezclarHacia(acento, "papel", 0.55);
    return {
      "--qr-acento": acento,
      "--qr-acento-texto": acentoTexto,
      "--qr-sobre-acento": textoSobre(acento),
    } as React.CSSProperties;
  }, [settings]);

  // Productos filtrados
  const productosFiltrados = useMemo(() => {
    return productos.filter((p) => {
      const coincideCat = categoriaSeleccionada === "todas" || p.categoryId === categoriaSeleccionada;
      const coincideBusqueda =
        !busqueda ||
        p.name.toLowerCase().includes(busqueda.toLowerCase()) ||
        (p.shortDescription && p.shortDescription.toLowerCase().includes(busqueda.toLowerCase())) ||
        (p.description && p.description.toLowerCase().includes(busqueda.toLowerCase()));
      return coincideCat && coincideBusqueda;
    });
  }, [productos, categoriaSeleccionada, busqueda]);

  /**
   * Los productos ya filtrados, agrupados por categoría.
   *
   * La carta se dibujaba como una lista corrida: en un teléfono entraban tres
   * platos por pantalla y para saber si había postres había que deslizar hasta
   * el final. Agrupada y plegable, el encabezado de cada categoría hace de
   * índice y la carta entera se ve de una.
   */
  const grupos = useMemo(() => {
    return categorias
      .map((cat) => ({
        id: cat.id,
        name: cat.name,
        productos: productosFiltrados.filter((p) => p.categoryId === cat.id),
      }))
      .filter((g) => g.productos.length > 0);
  }, [categorias, productosFiltrados]);

  /**
   * Cuántas unidades de un producto ya hay en el carrito, sumando todas sus
   * combinaciones: dos menús del día con proteínas distintas son dos renglones
   * pero descuentan del mismo stock.
   */
  const enCarritoDelProducto = (productId: string) =>
    Object.values(carrito).reduce(
      (acc, i) => (i.producto.id === productId ? acc + i.quantity : acc),
      0,
    );

  // Manejo de Carrito
  const agregarCombinacion = (
    producto: Producto,
    opciones: CartItem["opciones"],
    quantity: number,
    notes: string,
  ) => {
    // El menú QR no tenía ninguna guarda de stock: el comensal armaba el pedido
    // entero y la negativa llegaba recién al confirmar, cuando ya había escrito
    // su nombre, su teléfono y su dirección.
    if (settings.inventoryEnabled && !settings.permitirVentaSinStock) {
      const disp = calcularStockDisponibleProducto(producto, true);
      if (disp !== null && enCarritoDelProducto(producto.id) + quantity > disp) {
        setAvisoStock(
          disp <= 0
            ? `Se acabó ${producto.name}.`
            : `Solo quedan ${disp} de ${producto.name} y ya los tenés en el pedido.`,
        );
        return;
      }
    }

    setAvisoStock(null);

    const lineKey = claveDeLinea(
      producto.id,
      opciones.map((o) => o.id),
    );

    setCarrito((prev) => {
      const actual = prev[lineKey];
      return {
        ...prev,
        [lineKey]: {
          lineKey,
          producto,
          quantity: (actual?.quantity ?? 0) + quantity,
          notes: notes || actual?.notes || "",
          opciones,
        },
      };
    });
  };

  /** Un toque: para los productos que no tienen nada que elegir. */
  const agregarItem = (producto: Producto) => {
    agregarCombinacion(producto, [], 1, "");
  };

  const quitarItem = (lineKey: string) => {
    setCarrito((prev) => {
      const actual = prev[lineKey];
      if (!actual) return prev;
      if (actual.quantity <= 1) {
        const copia = { ...prev };
        delete copia[lineKey];
        return copia;
      }
      return {
        ...prev,
        [lineKey]: {
          ...actual,
          quantity: actual.quantity - 1,
        },
      };
    });
  };

  const cambiarNota = (lineKey: string, notes: string) => {
    setCarrito((prev) => {
      const actual = prev[lineKey];
      if (!actual) return prev;
      return {
        ...prev,
        [lineKey]: { ...actual, notes },
      };
    });
  };

  const cartList = useMemo(() => Object.values(carrito), [carrito]);

  const totalItems = useMemo(
    () => cartList.reduce((acc, i) => acc + i.quantity, 0),
    [cartList],
  );

  const [propinaCop, setPropinaCop] = useState(0);

  const totalConsumoCop = useMemo(
    () => cartList.reduce((acc, i) => acc + precioUnitarioQR(i) * i.quantity, 0),
    [cartList],
  );

  const costoDomicilioCop = !esMesa ? (settings.deliveryFeeCop ?? 0) : 0;
  const totalConDomicilioCop = totalConsumoCop + costoDomicilioCop;

  /**
   * La propina que elige el propio comensal.
   *
   * Por QR no hay mesero a quién decirle que sí o que no, así que la decisión
   * tiene que estar acá: si quedara para la caja, el pedido llegaría sin ella y
   * alguien tendría que ir a preguntar a la mesa.
   *
   * Va sobre el consumo completo y no lleva impuesto.
   */
  const propinaSugeridaCop = computeSuggestedTip(totalConsumoCop, settings.tipSuggestionRateBp);
  const totalFinalCop = totalConDomicilioCop + propinaCop;

  // Enviar pedido al backend
  const enviarPedido = async () => {
    if (cartList.length === 0) return;
    setErrorEnvio(null);

    if (estadoNegocio && !estadoNegocio.abierto) {
      setErrorEnvio(
        estadoNegocio.razon ||
          `El restaurante está cerrado en este momento (${estadoNegocio.horaApertura} - ${estadoNegocio.horaCierre}).`,
      );
      return;
    }

    if (!esMesa) {
      if (settings.deliveryPaused || settings.deliveryEnabled === false) {
        setErrorEnvio(
          "Los pedidos a domicilio se encuentran pausados temporalmente por alta demanda en el restaurante.",
        );
        return;
      }
      // La puerta de verdad está en la Server Action; esto evita el viaje y el
      // mensaje genérico. Puede pasar sin recargar: el cajero cierra los domicilios
      // mientras alguien tiene la carta abierta.
      if (domiciliosCerrados) {
        setErrorEnvio("Por ahora no estamos recibiendo domicilios. Volvé cuando abramos.");
        return;
      }
    }

    if (esMesa) {
      // Cada envío desde la mesa abre su propia cuenta, así que en una mesa de
      // seis pueden convivir seis pedidos. Sin el nombre, a la cocina le llegan
      // seis comandas que dicen lo mismo y nadie sabe qué plato es de quién.
      if (!customerName.trim()) {
        setErrorEnvio("Escribí tu nombre para que sepamos de quién es el pedido.");
        return;
      }
    } else {
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
        tipCop: propinaCop,
        items: cartList.map((i) => ({
          productId: i.producto.id,
          modifierOptionIds: i.opciones.map((o) => o.id),
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

      // Queda recordado en este teléfono: si la pantalla se recarga, el rastreo
      // vuelve solo en vez de obligarlo a acordarse de su número.
      recordarPedido(business.slug, res.data.orderId);

      // Por id y no por teléfono: el pedido de mesa no tiene teléfono.
      void consultarPedido(res.data.orderId);
    } catch {
      setErrorEnvio("Ocurrió un error inesperado al enviar tu pedido.");
    } finally {
      setCargando(false);
    }
  };


  // La tarjeta de un producto. Se sacó del `.map()` para poder dibujarla
  // dentro de cada categoría plegable sin duplicar una línea de su contenido.
  const renderProducto = (producto: (typeof productos)[number]) => {
                  // Sumado sobre todas las combinaciones: la insignia dice
                  // cuántos de ese plato hay pedidos, no de una variante.
                  const cantidad = cartList.reduce(
                    (acc, i) => (i.producto.id === producto.id ? acc + i.quantity : acc),
                    0,
                  );
                  const conModificadores = tieneModificadores(producto);
                  const foto = producto.imageUrl || placeholderUrl;

                  // Lo que faltaba en esta pantalla: la carta traía el stock desde
                  // el servidor y nadie lo miraba. `null` = el producto no se mide.
                  const disponibles = calcularStockDisponibleProducto(
                    producto,
                    settings.inventoryEnabled,
                  );
                  const sinStock =
                    disponibles !== null && disponibles <= 0 && !settings.permitirVentaSinStock;
                  const quedanPocas =
                    disponibles !== null && disponibles > 0 && disponibles <= 5;
                  const sePuedePedir = producto.isAvailable && !sinStock;

                  return (
                    <Card
                      key={producto.id}
                      className={cn(
                        "bg-white/5 backdrop-blur-md border-white/10 text-[color:var(--qr-texto)] overflow-hidden transition-all duration-300 hover:border-[var(--qr-acento)]/60 hover:bg-white/[0.08] shadow-md hover:shadow-xl hover:scale-[1.01] rounded-2xl group",
                        !sePuedePedir && "opacity-50 grayscale",
                      )}
                    >
                      <CardContent className="p-3.5 flex gap-3.5 items-center">
                        {foto ? (
                          <div className="relative overflow-hidden rounded-2xl size-24 shrink-0 bg-[color:var(--qr-superficie-2)] border border-white/10 shadow-inner">
                            <img
                              src={foto}
                              alt={producto.name}
                              className="size-full object-cover group-hover:scale-105 transition-transform duration-500"
                            />
                            {cantidad > 0 && (
                              <div className="absolute top-1 right-1 bg-[var(--qr-acento)] text-[color:var(--qr-sobre-acento)] font-black text-xs size-5 rounded-full flex items-center justify-center shadow-lg animate-in zoom-in">
                                {cantidad}
                              </div>
                            )}
                          </div>
                        ) : null}
                        {/* Sin foto no se dibuja nada: el recuadro con las dos
                            primeras letras daba cinco cuadrados que decían "CE" y
                            se comía 96px de ancho por renglón sin aportar una sola
                            cosa que el nombre no dijera ya. Sin él entran casi el
                            doble de platos por pantalla. */}

                        <div className="flex-1 space-y-1 min-w-0">
                          <div className="flex items-start justify-between gap-1">
                            <h3 className="font-extrabold text-sm text-[color:var(--qr-texto)] leading-snug truncate group-hover:text-[color:var(--qr-texto)] transition-colors">
                              {producto.name}
                            </h3>
                          </div>

                          {(producto.shortDescription || producto.description) && (
                            <p className="text-sm text-[color:var(--qr-texto-2)] line-clamp-2 leading-relaxed">
                              {producto.shortDescription ?? producto.description}
                            </p>
                          )}

                          <div className="flex items-center justify-between gap-2 pt-1.5">
                            <span className="numeral text-base font-black text-[color:var(--qr-texto)]">
                              {formatCop(producto.priceCop)}
                              {quedanPocas && sePuedePedir && (
                                <span className="text-rotulo ml-2 rounded-md border border-white/20 bg-white/10 px-1.5 py-0.5 font-bold text-[color:var(--qr-texto-2)]">
                                  quedan {disponibles}
                                </span>
                              )}
                            </span>

                            {!sePuedePedir ? (
                              <Badge variant="outline" className="border-destructive/50 text-destructive-soft text-xs font-bold">
                                Agotado
                              </Badge>
                            ) : conModificadores ? (
                              // Con opciones a elegir no sirven los +/-: cada
                              // unidad puede llevar una proteína distinta, así
                              // que cada una pasa por el modal.
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => setProductoAElegir(producto)}
                                className="bg-[var(--qr-acento)] hover:bg-[var(--qr-acento)]/90 text-[color:var(--qr-sobre-acento)] font-extrabold h-11.5 px-3.5 text-xs rounded-xl shadow-md gap-1 transition-all active:scale-95"
                              >
                                <Plus className="size-3.5" /> Elegir
                              </Button>
                            ) : cantidad > 0 ? (
                              <div className="flex items-center gap-1.5 bg-[var(--qr-acento)]/30 border border-[var(--qr-acento)]/50 rounded-xl p-1 shadow-sm">
                                <button
                                  type="button"
                                  onClick={() => quitarItem(claveDeLinea(producto.id, []))}
                                  className="size-11 rounded-lg bg-black/50 hover:bg-black/80 flex items-center justify-center font-black text-[color:var(--qr-sobre-acento)] text-sm transition-all active:scale-90"
                                >
                                  −
                                </button>
                                <span className="numeral font-black text-xs w-5 text-center text-[color:var(--qr-texto)]">{cantidad}</span>
                                <button
                                  type="button"
                                  onClick={() => agregarItem(producto)}
                                  className="size-11 rounded-lg bg-[var(--qr-acento)] hover:bg-[var(--qr-acento)]/90 flex items-center justify-center font-black text-[color:var(--qr-sobre-acento)] text-sm transition-all active:scale-90 shadow-md"
                                >
                                  +
                                </button>
                              </div>
                            ) : (
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => agregarItem(producto)}
                                className="bg-[var(--qr-acento)] hover:bg-[var(--qr-acento)]/90 text-[color:var(--qr-sobre-acento)] font-extrabold h-11.5 px-3.5 text-xs rounded-xl shadow-md gap-1 transition-all active:scale-95"
                              >
                                <Plus className="size-3.5" /> Agregar
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
  };

  return (
    <div
      className="min-h-screen text-[color:var(--qr-texto)] selection:bg-[var(--qr-acento)] selection:text-[color:var(--qr-sobre-acento)]"
      style={{ ...backgroundStyle, ...tema }}
    >
      {/* El desenfoque va en una capa aparte, NO en este contenedor.
          `backdrop-filter` crea un bloque contenedor para los descendientes
          `position: fixed`, así que con el blur acá la barra del pedido se
          anclaba al fondo de este div —1451px de menú— en vez de a la pantalla:
          para verla había que deslizar hasta el final, que es justo lo que no
          tiene que pasar. Lo mismo le ocurría al carrito y al rastreo. */}
      <div className="mx-auto max-w-md min-h-screen flex flex-col relative pb-40 shadow-2xl border-x border-white/10">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-black/30 backdrop-blur-sm"
        />
        
        {/* ─────────────────────────────────────────────────────────────
            HEADER / BRANDING DEL RESTAURANTE
            ───────────────────────────────────────────────────────────── */}
        <header className="p-6 text-center space-y-3 relative border-b border-white/10 bg-gradient-to-b from-black/50 to-transparent">
          {logo ? (
            <img
              src={logo}
              alt={titulo}
              className="size-20 mx-auto rounded-full object-cover border-2 border-[var(--qr-acento)]/60 shadow-xl"
            />
          ) : (
            <div className="size-16 mx-auto rounded-full bg-[var(--qr-acento)]/20 border border-[var(--qr-acento)]/40 flex items-center justify-center text-[color:var(--qr-acento-texto)] dark:text-[color:var(--qr-texto)] text-2xl font-black">
              {business.name.slice(0, 2).toUpperCase()}
            </div>
          )}

          <div>
            <h1 className="text-2xl font-black tracking-tight text-[color:var(--qr-texto)]">{titulo}</h1>
            <p className="text-xs font-medium text-[color:var(--qr-texto-2)] mt-0.5">{subtitulo}</p>
          </div>

          {/* Avisos profesionales de Restaurante Cerrado o Domicilios Pausados */}
          {estadoNegocio && !estadoNegocio.abierto && (
            <div
              role="alert"
              className="mx-auto max-w-sm rounded-xl border border-destructive/50 bg-destructive/20 p-3.5 text-center space-y-1 text-white shadow-lg animate-in fade-in"
            >
              <div className="flex items-center justify-center gap-1.5 font-bold text-xs uppercase tracking-wider text-rose-300">
                <span>🛑</span>
                <span>Establecimiento Cerrado</span>
              </div>
              <p className="text-xs text-white/90 font-semibold leading-snug">
                {estadoNegocio.razon || "En este momento no estamos recibiendo pedidos."}
              </p>
              <p className="text-[11px] text-white/70 font-mono">
                Horario de atención: {estadoNegocio.horaApertura} - {estadoNegocio.horaCierre}
              </p>
            </div>
          )}

          {!esMesa && (settings.deliveryPaused || settings.deliveryEnabled === false) && (
            <div
              role="alert"
              className="mx-auto max-w-sm rounded-xl border border-amber-500/50 bg-amber-500/15 p-3.5 text-center space-y-1 text-amber-100 shadow-lg animate-in fade-in"
            >
              <div className="flex items-center justify-center gap-1.5 font-bold text-xs uppercase tracking-wider text-amber-400">
                <Bike className="size-4" />
                <span>Domicilios Pausados</span>
              </div>
              <p className="text-xs text-amber-200/90 font-medium leading-snug">
                Los pedidos a domicilio se encuentran pausados temporalmente por alta demanda en el establecimiento.
              </p>
            </div>
          )}

          {/* El QR trae una mesa que ya no existe. Se dice acá y no al confirmar:
              armar un pedido entero para que falle al final es la peor forma de
              enterarse, y el comensal ya no tiene a quién reclamarle. */}
          {mesaInvalida && (
            <p
              role="alert"
              className="mx-auto max-w-xs rounded-lg border border-warning/50 bg-warning/15 px-3 py-2 text-xs font-semibold text-warning-soft"
            >
              Este código QR ya no corresponde a una mesa. Podés pedir para llevar o a
              domicilio, o pedirle al mesero que te atienda.
            </p>
          )}

          {/* Los domicilios están cerrados en este momento. Se dice al abrir, por
              lo mismo que la mesa inválida: dejarlo armar el pedido y rechazárselo
              al confirmar es enterarlo en el peor momento, ya con la dirección
              escrita. La carta sigue a la vista: mirar el menú de un local cerrado
              es exactamente lo que hace alguien que va a pedir mañana. */}
          {domiciliosCerrados && (
            <p
              role="alert"
              className="mx-auto max-w-xs rounded-lg border border-warning/50 bg-warning/15 px-3 py-2 text-xs font-semibold text-warning-soft"
            >
              Por ahora no estamos recibiendo domicilios. Podés ver la carta y volver
              cuando abramos.
            </p>
          )}

          <div className="flex items-center justify-center gap-2 pt-1.5 flex-wrap">
            {/* Estado del Establecimiento */}
            <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-300 font-extrabold px-3 py-1 text-xs gap-1.5 shadow-sm">
              <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Abierto</span>
            </Badge>

            {esMesa ? (
              <Badge variant="default" className="bg-[var(--qr-acento)] text-[color:var(--qr-sobre-acento)] font-extrabold px-3.5 py-1 text-xs shadow-md gap-1">
                <span>🪑</span>
                <span>Mesa {mesaParam}</span>
              </Badge>
            ) : (
              <Badge variant="outline" className="border-[var(--qr-acento)]/50 bg-black/40 text-[color:var(--qr-texto)] font-bold px-3 py-1 text-xs gap-1">
                <span>🛵</span>
                <span>Domicilio</span>
              </Badge>
            )}

            {/* Chip de Tiempo Estimado de Entrega */}
            <Badge variant="outline" className="border-white/20 bg-black/50 text-[color:var(--qr-texto)] font-bold px-3 py-1 text-xs gap-1.5 shadow-sm backdrop-blur-md">
              <Clock className="size-3 text-[color:var(--qr-acento-texto)]" />
              <span>{settings.estimatedPrepTimeText || "20-30 min"}</span>
            </Badge>

            <button
              type="button"
              onClick={() => setModalConsultaAbierto(true)}
              className="bg-white/10 hover:bg-white/20 text-[color:var(--qr-texto)] font-bold text-xs px-3 py-1 rounded-full border border-white/20 flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-xs"
            >
              <Search className="size-3.5 text-[color:var(--qr-acento-texto)]" />
              <span>Rastrear Pedido</span>
            </button>
          </div>
        </header>

        {/* ─────────────────────────────────────────────────────────────
            RASTREADOR DE PEDIDO EN TIEMPO REAL (REDIS SSE STREAM)
            ───────────────────────────────────────────────────────────── */}
        {pedidoActivoTrack && (
          <div className="mx-4 my-3 p-4 rounded-2xl bg-[color:var(--qr-superficie-2)]/95 border-2 border-[var(--qr-acento)]/50 shadow-2xl text-[color:var(--qr-texto)] space-y-4 animate-in fade-in duration-300">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <div className="flex items-center gap-2">
                <span className="font-black text-lg text-[color:var(--qr-texto)]">Pedido #{pedidoActivoTrack.code}</span>
                <Badge variant="outline" className="text-xs border-[var(--qr-acento)]/50 text-[color:var(--qr-acento-texto)] font-extrabold gap-1">
                  <span className="size-2 rounded-full bg-success animate-ping inline-block" /> En vivo (Redis)
                </Badge>
              </div>
              <button
                type="button"
                onClick={() => {
                  // Cerrarlo a mano es decir "ya está": no tiene que volver
                  // solo en la próxima recarga.
                  setPedidoActivoTrack(null);
                  olvidarPedido(business.slug);
                }}
                className="text-[color:var(--qr-texto-2)] hover:text-[color:var(--qr-texto)]"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Progreso de Pasos (Trazabilidad en tiempo real) */}
            <div className="space-y-2 py-1">
              <div className="grid grid-cols-4 gap-1.5 text-center text-xs font-bold">
                {/* Paso 1: Recibido */}
                <div className={cn("p-2 rounded-xl border flex flex-col items-center gap-1", "bg-warning/25 text-warning-soft border-warning/50")}>
                  <Clock className="size-4" />
                  <span>1. Recibido</span>
                </div>

                {/* Paso 2: Cocina */}
                <div
                  className={cn(
                    "p-2 rounded-xl border flex flex-col items-center gap-1 transition-all",
                    ["EN_PREPARACION", "LISTO", "EN_CAMINO", "ENTREGADO"].includes(
                      pedidoActivoTrack.deliveryStatus,
                    )
                      ? "bg-orange-500/20 text-orange-300 border-orange-500/50 shadow-sm"
                      : "bg-white/5 text-[color:var(--qr-texto-3)] border-white/10 opacity-50",
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
                      ? "bg-info/25 text-info-soft border-info/60 shadow-sm"
                      : "bg-white/5 text-[color:var(--qr-texto-3)] border-white/10 opacity-50",
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
                      ? "bg-[var(--qr-acento)]/20 text-success-soft border-[var(--qr-acento)]/50 shadow-sm"
                      : "bg-white/5 text-[color:var(--qr-texto-3)] border-white/10 opacity-50",
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
                <span className="text-[color:var(--qr-texto-2)]">Estado de Entrega:</span>
                <span className="font-extrabold text-[color:var(--qr-texto)]">
                  {pedidoActivoTrack.deliveryStatus === "POR_CONFIRMAR" &&
                    "🟡 Recibido. El restaurante lo está confirmando."}
                  {pedidoActivoTrack.deliveryStatus === "EN_PREPARACION" && "🟠 En preparación por la cocina"}
                  {pedidoActivoTrack.deliveryStatus === "LISTO" && "🟠 Listo, saliendo para tu dirección"}
                  {pedidoActivoTrack.deliveryStatus === "EN_CAMINO" && "🔵 ¡En camino a tu ubicación!"}
                  {pedidoActivoTrack.deliveryStatus === "ENTREGADO" && "🟢 ¡Entregado! Que lo disfrutes."}
                  {pedidoActivoTrack.deliveryStatus === "CANCELADO" && "🔴 Anulado por el restaurante"}
                </span>
              </div>

              {pedidoActivoTrack.deliveryAddress && (
                <div className="flex items-center gap-1 text-sm text-[color:var(--qr-texto-2)] pt-1 border-t border-white/10">
                  <MapPin className="size-3 text-[color:var(--qr-texto)] shrink-0" />
                  <span className="truncate">{pedidoActivoTrack.deliveryAddress}</span>
                </div>
              )}
            </div>

            <div className="flex justify-between items-center pt-1 text-xs">
              <span className="text-[color:var(--qr-texto-2)]">Total: <strong className="text-[color:var(--qr-texto)] numeral font-bold">{formatCop(pedidoActivoTrack.totalCop)}</strong></span>
              <button
                type="button"
                onClick={() => consultarPedido(pedidoActivoTrack.customerPhone || pedidoActivoTrack.code.toString())}
                className="text-[color:var(--qr-texto)] hover:underline font-bold text-sm flex items-center gap-1"
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
            <div className="w-full max-w-sm bg-[color:var(--qr-superficie-2)] border border-white/15 rounded-2xl p-5 space-y-4 text-[color:var(--qr-texto)] shadow-2xl animate-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <h3 className="font-extrabold text-base text-[color:var(--qr-texto)] flex items-center gap-2">
                  🔍 Rastrear Pedido
                </h3>
                <button type="button" onClick={() => setModalConsultaAbierto(false)} className="text-[color:var(--qr-texto-2)] hover:text-[color:var(--qr-texto)]">
                  <X className="size-5" />
                </button>
              </div>

              <p className="text-xs text-[color:var(--qr-texto-2)] leading-relaxed">
                Ingresá el <strong>celular completo</strong> con el que hiciste el pedido y vas a
                ver su estado en tiempo real. Pedimos el número entero para que nadie más
                pueda ver tu pedido.
              </p>

              <div className="space-y-3">
                <Input
                  value={queryConsulta}
                  onChange={(e) => setQueryConsulta(e.target.value)}
                  placeholder="Ej: 3001234567"
                  className="bg-white/10 border-white/20 text-[color:var(--qr-texto)] text-sm h-11 rounded-xl placeholder:text-[color:var(--qr-texto-3)]"
                />

                {errorConsulta && (
                  <p className="text-xs text-destructive-soft font-semibold">{errorConsulta}</p>
                )}

                <Button
                  type="button"
                  disabled={cargandoConsulta}
                  onClick={() => consultarPedido()}
                  className="w-full bg-[var(--qr-acento)] hover:bg-[var(--qr-acento)]/90 text-[color:var(--qr-sobre-acento)] font-bold h-11 rounded-xl text-xs gap-2"
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
            <div className="size-20 mx-auto rounded-full bg-[var(--qr-acento)]/20 text-[color:var(--qr-acento-texto)] border border-success/50 flex items-center justify-center text-4xl shadow-xl animate-pulse">
              👨‍🍳
            </div>

            <div className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-widest text-[color:var(--qr-acento-texto)]">
                ¡Pedido Enviado a la Cocina!
              </span>
              <h2 className="text-3xl font-black text-[color:var(--qr-texto)]">Pedido #{pedidoConfirmado.code}</h2>
              <div className="inline-block rounded-2xl bg-[var(--qr-acento)]/30 border border-[var(--qr-acento)]/50 px-5 py-3 text-center my-2 shadow-inner">
                <span className="text-xs font-bold text-[color:var(--qr-texto-2)] block uppercase tracking-wider">Tu Turno de Entrega</span>
                <span className="text-4xl font-black text-[color:var(--qr-acento-texto)] block mt-0.5 numeral">
                  {formatTurno(pedidoConfirmado.turnNumber, settings.turnNumberMax, pedidoConfirmado.type === "MESA")}
                </span>
              </div>
              <p className="text-xs text-[color:var(--qr-texto-2)] max-w-xs mx-auto leading-relaxed">
                {esMesa
                  ? `Tu pedido para la Mesa ${mesaParam} ya fue recibido por nuestro equipo de cocina.`
                  : "Tu pedido ya está en preparación. ¡Te avisaremos cuando esté listo!"}
              </p>
            </div>

            <Card className="bg-white/5 border-white/10 text-[color:var(--qr-texto)] text-left">
              <CardContent className="p-4 space-y-2 text-xs">
                <div className="flex justify-between font-bold text-sm text-[color:var(--qr-texto)] border-b border-white/10 pb-2">
                  <span>Total del Pedido</span>
                  <span className="numeral">{formatCop(pedidoConfirmado.totalCop)}</span>
                </div>
                <p className="text-sm text-[color:var(--qr-texto-2)]">
                  Estado: <strong className="text-[color:var(--qr-acento-texto)]">En Preparación 👨‍🍳</strong>
                </p>
              </CardContent>
            </Card>

            <Button
              type="button"
              onClick={() => setPedidoConfirmado(null)}
              className="w-full bg-[var(--qr-acento)] hover:bg-[var(--qr-acento)]/90 text-[color:var(--qr-sobre-acento)] font-bold h-12 rounded-xl text-sm shadow-lg"
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
                <Search className="absolute left-3 top-2.5 size-4 text-[color:var(--qr-texto-2)]" />
                <Input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar plato, bebida, postre..."
                  className="pl-9 h-11 bg-white/10 border-white/15 text-[color:var(--qr-texto)] placeholder:text-[color:var(--qr-texto-2)] text-xs rounded-xl focus-visible:ring-[var(--qr-acento)]"
                />
                {busqueda && (
                  <button
                    type="button"
                    onClick={() => setBusqueda("")}
                    className="absolute right-3 top-2.5 text-[color:var(--qr-texto-2)] hover:text-[color:var(--qr-texto)]"
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
                      ? "bg-[var(--qr-acento)] text-[color:var(--qr-sobre-acento)] border-[var(--qr-acento)] shadow-md scale-[1.02]"
                      : "bg-white/5 text-[color:var(--qr-texto-2)] border-white/10 hover:bg-white/10",
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
                          ? "bg-[var(--qr-acento)] text-[color:var(--qr-sobre-acento)] border-[var(--qr-acento)] shadow-md scale-[1.02]"
                          : "bg-white/5 text-[color:var(--qr-texto-2)] border-white/10 hover:bg-white/10",
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
                  <Utensils className="size-10 mx-auto text-[color:var(--qr-texto-3)] animate-pulse" />
                  <p className="text-sm font-semibold text-[color:var(--qr-texto-2)]">No se encontraron productos</p>
                  <p className="text-xs text-[color:var(--qr-texto-3)]">Prueba con otra palabra de búsqueda o categoría.</p>
                </div>
              ) : (
                grupos.map((grupo, indice) => (
                  <SeccionPlegable
                    key={grupo.id}
                    titulo={grupo.name}
                    cuenta={grupo.productos.length}
                    // La primera abierta: al abrir la carta se ve comida, no una
                    // lista de títulos cerrados que no dice a qué sabe nada.
                    abiertaPorDefecto={indice === 0}
                  >
                    <div className="space-y-3.5">{grupo.productos.map(renderProducto)}</div>
                  </SeccionPlegable>
                ))
              )}
            </main>

            {/* ─────────────────────────────────────────────────────────────
                BARRA FLOTANTE INFERIOR DE VER PEDIDO
                ───────────────────────────────────────────────────────────── */}
            {totalItems > 0 && (
              <div className="fixed bottom-0 inset-x-0 z-30 mx-auto max-w-md p-3">
                {avisoStock && (
                  <button
                    type="button"
                    onClick={() => setAvisoStock(null)}
                    className="mb-2 w-full rounded-xl border border-white/20 bg-black/70 px-3 py-2 text-left text-sm font-semibold text-[color:var(--qr-texto)] backdrop-blur-md"
                  >
                    {avisoStock}
                  </button>
                )}
                {/* Lo que lleva pedido, a la vista.
                    Antes esta barra decía cuántos y cuánto, pero no QUÉ: para
                    saber si ya había pedido la cerveza había que abrir el
                    carrito, mirar y cerrarlo. Ahora los renglones se leen sin
                    tocar nada, y el carrito queda para editar y confirmar. */}
                <div className="rounded-2xl border border-[var(--qr-acento)]/40 bg-[color:var(--qr-superficie-2)] shadow-2xl backdrop-blur-md">
                  <ul className="max-h-28 space-y-1 overflow-y-auto px-4 pt-3 text-xs">
                    {cartList.map((item) => (
                      <li key={item.lineKey} className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 truncate text-[color:var(--qr-texto-2)]">
                          <span className="numeral font-bold text-[color:var(--qr-texto)]">
                            {item.quantity}×
                          </span>{" "}
                          {item.producto.name}
                        </span>
                        <span className="numeral shrink-0 text-[color:var(--qr-texto)]">
                          {formatCop(precioUnitarioQR(item) * item.quantity)}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <div className="p-3">
                    <Button
                      type="button"
                      onClick={() => setCarritoAbierto(true)}
                      className="w-full bg-[var(--qr-acento)] hover:bg-[var(--qr-acento)]/90 text-[color:var(--qr-sobre-acento)] font-extrabold h-14 rounded-xl flex items-center justify-between px-5 text-sm transition-all"
                    >
                      <span className="flex items-center gap-2">
                        <ShoppingBag className="size-5" />
                        <span>Ver mi pedido ({totalItems})</span>
                      </span>
                      <span className="numeral text-base font-black">{formatCop(totalFinalCop)}</span>
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* ─────────────────────────────────────────────────────────────
                DRAWER / MODAL DEL CARRITO DE COMPRAS
                ───────────────────────────────────────────────────────────── */}
            {carritoAbierto && (
              <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
                <div className="bg-[color:var(--qr-superficie-2)] border-t border-white/10 rounded-t-3xl p-6 space-y-5 max-w-md mx-auto w-full max-h-[85vh] flex flex-col shadow-2xl">
                  
                  {/* Header Drawer */}
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <div className="flex items-center gap-2">
                      <ShoppingBag className="size-5 text-[color:var(--qr-acento-texto)]" />
                      <h2 className="text-lg font-bold text-[color:var(--qr-texto)]">Resumen de tu Pedido</h2>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setCarritoAbierto(false)}
                      className="text-[color:var(--qr-texto-2)] hover:text-[color:var(--qr-texto)]"
                    >
                      <X className="size-5" />
                    </Button>
                  </div>

                  {/* Advertencia de Error */}
                  {errorEnvio && (
                    <div className="p-3 rounded-xl bg-destructive/25 border border-destructive/50 text-destructive-soft text-xs font-semibold">
                      {errorEnvio}
                    </div>
                  )}

                  {/* Datos del Cliente */}
                  {esMesa ? (
                    <div className="space-y-2 p-3 rounded-xl bg-white/5 border border-white/10">
                      <label
                        htmlFor="nombre-cuenta-qr"
                        className="block font-bold text-[color:var(--qr-texto)] text-xs uppercase tracking-wider"
                      >
                        ¿A nombre de quién? *
                      </label>
                      <Input
                        id="nombre-cuenta-qr"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="Tu nombre *"
                        required
                        maxLength={120}
                        className="h-11 bg-white/10 border-white/15 text-[color:var(--qr-texto)] text-sm"
                      />
                      <p className="text-xs text-[color:var(--qr-texto-2)] leading-snug">
                        Tu pedido va a la cocina a tu nombre y se cobra aparte.
                        Cada quien en la mesa puede pedir lo suyo desde su celular.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3 p-3 rounded-xl bg-white/5 border border-white/10 text-xs">
                      <h3 className="font-bold text-[color:var(--qr-texto)] text-xs uppercase tracking-wider">
                        Datos de Entrega (Domicilio)
                      </h3>
                      <div className="space-y-2">
                        <Input
                          value={customerName}
                          onChange={(e) => setCustomerName(e.target.value)}
                          placeholder="Tu Nombre completo *"
                          required
                          className="h-11 bg-white/10 border-white/15 text-[color:var(--qr-texto)] text-xs"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <Input
                            value={customerPhone}
                            onChange={(e) => setCustomerPhone(e.target.value)}
                            placeholder="Celular / WhatsApp *"
                            required
                            className="h-11 bg-white/10 border-white/15 text-[color:var(--qr-texto)] text-xs"
                          />
                          <Input
                            value={customerAddress}
                            onChange={(e) => setCustomerAddress(e.target.value)}
                            placeholder="Dirección exacta *"
                            required
                            className="h-11 bg-white/10 border-white/15 text-[color:var(--qr-texto)] text-xs"
                          />
                        </div>
                        <div className="grid grid-cols-3 gap-2 pt-1 border-t border-white/10">
                          <select
                            value={docType}
                            onChange={(e) => setDocType(e.target.value)}
                            className="h-11 bg-[color:var(--qr-superficie)] border border-white/15 text-[color:var(--qr-texto)] text-xs rounded-md px-2"
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
                            className="col-span-2 h-11 bg-white/10 border-white/15 text-[color:var(--qr-texto)] text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Lista de Productos del Carrito */}
                  <div className="flex-1 overflow-y-auto space-y-3 pr-1 scrollbar-thin">
                    {cartList.map((item) => (
                      <div
                        key={item.lineKey}
                        className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-2 text-xs"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-0.5">
                            <span className="font-bold text-[color:var(--qr-texto)] text-sm block">{item.producto.name}</span>
                            {item.opciones.length > 0 && (
                              <span className="block text-sm text-[color:var(--qr-texto-2)] leading-tight">
                                {item.opciones
                                  .map((o) =>
                                    o.priceDeltaCop > 0
                                      ? `${o.name} (+${formatCop(o.priceDeltaCop)})`
                                      : o.name,
                                  )
                                  .join(" · ")}
                              </span>
                            )}
                            <span className="numeral text-[color:var(--qr-texto)] font-semibold">
                              {formatCop(precioUnitarioQR(item) * item.quantity)}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 bg-black/40 border border-white/10 rounded-lg p-1">
                            <button
                              type="button"
                              onClick={() => quitarItem(item.lineKey)}
                              className="size-11 rounded bg-white/10 text-[color:var(--qr-texto)] font-bold text-xs"
                            >
                              −
                            </button>
                            <span className="numeral font-bold text-xs w-4 text-center text-[color:var(--qr-texto)]">{item.quantity}</span>
                            <button
                              type="button"
                              onClick={() =>
                                agregarCombinacion(item.producto, item.opciones, 1, item.notes)
                              }
                              className="size-11 rounded bg-[var(--qr-acento)] text-[color:var(--qr-sobre-acento)] font-bold text-xs"
                            >
                              +
                            </button>
                          </div>
                        </div>

                        <Input
                          value={item.notes}
                          onChange={(e) => cambiarNota(item.lineKey, e.target.value)}
                          placeholder="Notas (sin salsa, bien cocido...)"
                          className="h-11 bg-white/5 border-white/10 text-sm text-[color:var(--qr-texto)] placeholder:text-[color:var(--qr-texto-3)]"
                        />
                      </div>
                    ))}
                  </div>

                  {/* Propina, Total y Confirmación */}
                  <div className="border-t border-white/10 pt-3 space-y-3">
                    <SelectorDePropina
                      tema="qr"
                      habilitado={settings.tipSuggestionEnabled}
                      sugeridaCop={propinaSugeridaCop}
                      rateBp={settings.tipSuggestionRateBp}
                      valorCop={propinaCop}
                      onCambiar={setPropinaCop}
                      id="qr"
                    />

                    {(costoDomicilioCop > 0 || propinaCop > 0) && (
                      <div className="space-y-1.5 border-b border-white/10 pb-2 text-xs text-[color:var(--qr-texto-2)]">
                        <div className="flex justify-between items-center">
                          <span>Productos</span>
                          <span className="numeral font-medium text-[color:var(--qr-texto)]">{formatCop(totalConsumoCop)}</span>
                        </div>
                        {costoDomicilioCop > 0 && (
                          <div className="flex justify-between items-center">
                            <span>Servicio a domicilio</span>
                            <span className="numeral font-bold text-[color:var(--qr-texto)]">+{formatCop(costoDomicilioCop)}</span>
                          </div>
                        )}
                        {propinaCop > 0 && (
                          <div className="flex justify-between items-center">
                            <span>Propina voluntaria</span>
                            <span className="numeral font-bold text-[color:var(--qr-texto)]">+{formatCop(propinaCop)}</span>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex justify-between items-center text-base font-extrabold text-[color:var(--qr-texto)]">
                      <span>Total a Pagar</span>
                      <span className="numeral text-xl text-[color:var(--qr-acento-texto)]">{formatCop(totalFinalCop)}</span>
                    </div>

                    <Button
                      type="button"
                      onClick={enviarPedido}
                      disabled={cargando || domiciliosCerrados}
                      className="w-full bg-[var(--qr-acento)] hover:bg-[var(--qr-acento)]/90 text-[color:var(--qr-sobre-acento)] font-extrabold h-13 rounded-xl text-sm shadow-xl gap-2"
                    >
                      {domiciliosCerrados
                        ? "Domicilios cerrados por ahora"
                        : cargando
                          ? "Enviando a la cocina…"
                          : "🚀 Confirmar y Enviar Pedido"}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <SelectorModificadores
        producto={productoAElegir}
        abierto={productoAElegir !== null}
        onCerrar={() => setProductoAElegir(null)}
        inventoryEnabled={settings.inventoryEnabled}
        permitirVentaSinStock={settings.permitirVentaSinStock}
        onConfirmar={({ opcionIds, quantity, notes }) => {
          if (!productoAElegir) return;

          const todas = (productoAElegir.modifierGroups ?? []).flatMap((a) => a.group.options);
          const opciones = opcionIds
            .map((id) => todas.find((o) => o.id === id))
            .filter((o) => o !== undefined)
            .map((o) => ({ id: o.id, name: o.name, priceDeltaCop: o.priceDeltaCop }));

          agregarCombinacion(productoAElegir, opciones, quantity, notes);
          setProductoAElegir(null);
        }}
      />
    </div>
  );
}
