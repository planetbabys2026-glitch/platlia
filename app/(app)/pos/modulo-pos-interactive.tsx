"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Bike,
  Box,
  Boxes,
  CreditCard,
  DollarSign,
  Minus,
  PauseCircle,
  Plus,
  Printer,
  ReceiptText,
  ScanLine,
  Search,
  ShoppingBag,
  ShoppingCart,
  Trash2,
  Utensils,
  UtensilsCrossed,
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
import { CerrarSinConsumo } from "@/features/pedidos/components/cerrar-sin-consumo";
import { claveDeLinea } from "@/lib/modificadores";
import { SelectorDePropina } from "@/features/pedidos/components/propina";
import { formatCop } from "@/lib/money";
import { computeSuggestedTip } from "@/lib/tax";
import { SeccionPlegable } from "@/components/marca/seccion-plegable";
import { cn } from "@/lib/utils";

export type PosProducto = ProductoConModificadores & {
  id: string;
  name: string;
  priceCop: number;
  isAvailable: boolean;
  imageUrl: string | null;
  /** El código de barras del producto, para el lector del mostrador. */
  sku?: string | null;
  trackStock?: boolean;
  stockQty?: number;
  /**
   * La tarifa de impuesto del producto. Ya viajaba en la carta —para que el
   * renglón optimista calcule su impuesto con la misma tarifa que va a quedar
   * congelada— pero el tipo no la declaraba.
   */
  taxRate?: { rateBp: number };
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
  /** Con mesa la cuenta es del salón, no de esta pantalla. */
  tableId: string | null;
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
  /** Renglones no anulados: en cero, el pedido se puede cerrar sin cobrar. */
  renglones?: number;
  items: {
    id: string;
    productId: string;
    nameSnapshot: string;
    unitPriceCop: number;
    basePriceCopSnapshot: number;
    quantity: number;
    status?: string;
    /** Puesto = la cocina ya lo tiene. Deja de ser del carrito. */
    sentToKitchenAt?: Date | string | null;
    lineTotalCop?: number;
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

/** Las cuatro cosas que se pueden hacer con lo que hay en pantalla. */
type AccionPos = "PAGAR_DIRECTO" | "ENVIAR_COCINA" | "ENVIAR_CAJA" | "PARQUEAR";

type RenglonDePedido = PosPedidoDetalle["items"][number];

/**
 * Un renglón vuelve al carrito solo si la cocina todavía no lo tiene.
 *
 * Es el mismo corte que usa `confirmarPedido` para decidir qué mandar a la
 * plancha, y el que usa la acción del servidor para decidir qué borrar. Tienen
 * que coincidir: si la pantalla mete al carrito algo que el servidor ya no borra,
 * el renglón se duplica; al revés, se pierde.
 */
export function esDelCarrito(item: RenglonDePedido): boolean {
  return (
    item.status !== "ANULADO" &&
    (item.status ?? "PENDIENTE") === "PENDIENTE" &&
    !item.sentToKitchenAt
  );
}

/** Lo que ya tomó la cocina: se muestra, no se edita. */
export function yaEstaEnCocina(item: RenglonDePedido): boolean {
  return item.status !== "ANULADO" && !esDelCarrito(item);
}

/**
 * Rearma el carrito de un pedido parqueado que se vuelve a abrir.
 *
 * Solo los renglones que siguen siendo del carrito. Antes entraban todos —los
 * anulados incluidos, que así resucitaban y se volvían a cobrar—, y al guardar,
 * el servidor borraba y recreaba también lo que la cocina ya estaba preparando:
 * se le borraba el estado y el cronómetro, media pantalla del KDS desaparecía de
 * golpe y la comanda se volvía a imprimir entera.
 *
 * Los modificadores se reconstruyen de las instantáneas del renglón, no del
 * catálogo actual: si mientras el pedido estaba parqueado alguien le cambió el
 * precio a "Carne", el pedido reabierto tiene que seguir mostrando lo que se le
 * dijo al cliente. Sin esto, reabrir un pedido perdía la proteína en silencio y
 * lo volvía a guardar mal.
 */
function cartDesdePedido(pedido: PosPedidoDetalle): CartItem[] {
  return pedido.items.filter(esDelCarrito).map((i) => {
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

type ModuloPosInteractiveProps = {
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
    /** Si el negocio sugiere propina al cobrar, y con qué tarifa. */
    tipSuggestionEnabled: boolean;
    tipSuggestionRateBp: number;
  };
  /**
   * Si el negocio está en condiciones de emitir factura electrónica. Llega
   * calculado del servidor: las credenciales de Factus no bajan al navegador.
   */
  puedeFacturar: boolean;
  /** Si el negocio opera con salón y mesas. */
  usaMesas?: boolean;
};

type CartItem = {
  /**
   * La identidad del renglón. Dos "Menú del día" con proteína distinta son dos
   * renglones, así que el carrito NO se puede indexar por `productId` como
   * antes: tocar carne y después pollo tiene que dar dos líneas, no una de a dos.
   */
  lineKey: string;
  productId: string;
  name: string;
  /** Precio de lista, sin recargos. */
  priceCop: number;
  /** Lo que suman los modificadores elegidos, por unidad. */
  recargoCop: number;
  quantity: number;
  notes: string;
  opciones: Array<{ id: string; groupName: string; name: string; priceDeltaCop: number }>;
};

/** Lo que cuesta una unidad de este renglón, ya con sus modificadores. */
/**
 * El rótulo de cada paso del panel.
 *
 * La pantalla tenía todo suelto y a la misma jerarquía —tipo de consumo, nombre,
 * carrito, tres botones— sin decir en qué orden se hace ni por qué. Numerar los
 * tres momentos es lo más barato que convierte una lista de campos en algo que
 * se puede seguir sin que nadie te lo explique.
 */
function precioUnitario(item: CartItem): number {
  return item.priceCop + item.recargoCop;
}

export function ModuloPosInteractive({
  carta,
  caja,
  pedidosAbiertos,
  pedidoInicial,
  settings,
  puedeFacturar,
  usaMesas = false,
}: ModuloPosInteractiveProps) {
  const router = useRouter();

  // ── Estado de apertura de caja ─────────────────────────────────────────────
  const [estadoCaja, accionCaja, pendingCaja] = useActionState(abrirCaja, ESTADO_INICIAL);

  // ── Estado de catálogo y búsqueda ──────────────────────────────────────────
  const [busqueda, setBusqueda] = useState("");
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState<string | null>(null);
  /**
   * El lector de código de barras.
   *
   * Un lector de mostrador se comporta como un teclado que escribe rápido y
   * termina con Enter, así que no hace falta ninguna API de cámara: alcanza con un
   * campo enfocado y un `submit`. Venía del módulo de Venta Rápida, que era lo
   * único que esa pantalla tenía y esta no.
   */
  const [codigoLeido, setCodigoLeido] = useState("");
  const [modalEscanerAbierto, setModalEscanerAbierto] = useState(false);

  // ── Estado del Pedido Activo / Parqueado ───────────────────────────────────
  const [activeOrderId, setActiveOrderId] = useState<string | null>(pedidoInicial?.id ?? null);
  const [orderCode, setOrderCode] = useState<number | null>(pedidoInicial?.code ?? null);
  const [turnNumber, setTurnNumber] = useState<number | null>(pedidoInicial?.turnNumber ?? null);

  // ── Estado de Carrito de Venta ─────────────────────────────────────────────
  const [cart, setCart] = useState<CartItem[]>(() =>
    pedidoInicial ? cartDesdePedido(pedidoInicial) : [],
  );
  const [tipoConsumo, setTipoConsumo] = useState<"LLEVAR" | "DOMICILIO" | "EN_SITIO">(
    pedidoInicial?.type === "DOMICILIO"
      ? "DOMICILIO"
      : pedidoInicial?.notes?.includes("[PARA COMER AQUÍ / EN SITIO]")
        ? "EN_SITIO"
        : "LLEVAR"
  );
  const [fiscal, setFiscal] = useState<DatosFiscalesValor>(() =>
    valorFiscalInicial(pedidoInicial ?? {}),
  );
  /**
   * El pedido cargado no tiene nada, ni en la base ni en el carrito.
   *
   * Se miran los dos: el pedido guardado está vacío desde que se abrió, pero si
   * la persona ya empezó a cantar productos, ofrecerle "cerrar sin consumo" al
   * lado sería una forma cómoda de perder el carrito de un clic.
   */
  const pedidoGuardadoVacio =
    !!pedidoInicial && pedidoInicial.items.every((i) => i.status === "ANULADO");
  const [customerName, setCustomerName] = useState(pedidoInicial?.customerName ?? "");
  const [customerPhone, setCustomerPhone] = useState(pedidoInicial?.customerPhone ?? "");
  const [deliveryAddress, setDeliveryAddress] = useState(pedidoInicial?.deliveryAddress ?? "");
  const [orderNotes, setOrderNotes] = useState(
    pedidoInicial?.notes?.replace("[PARA COMER AQUÍ / EN SITIO]", "").trim() ?? ""
  );

  /**
   * Los renglones que ya tomó la cocina. Se muestran y no se editan.
   *
   * Sin esto, reabrir un pedido que está en la plancha mostraba un carrito vacío
   * y un total en cero: parecía que el pedido se había perdido, y guardarlo así
   * habría sido cobrarle al cliente solo lo que se agregara después.
   */
  /**
   * La lista "En espera" solo muestra pedidos sin mesa.
   *
   * `getPedidosAbiertos` trae todo lo vivo, cuentas de mesa incluidas, y esta
   * pantalla las cargaba en el carrito como si fueran suyas: al guardar quedaban
   * convertidas en pedido para llevar, con la mesa perdida y el nombre de la
   * cuenta pisado. Una cuenta de mesa se atiende desde el salón.
   */
  const enEspera = useMemo(
    () => pedidosAbiertos.filter((p) => p.tableId === null),
    [pedidosAbiertos],
  );

  const enCocina = useMemo(
    () => (pedidoInicial?.items ?? []).filter(yaEstaEnCocina),
    [pedidoInicial],
  );
  const totalEnCocinaCop = useMemo(
    () =>
      enCocina.reduce((suma, i) => suma + (i.lineTotalCop ?? i.unitPriceCop * i.quantity), 0),
    [enCocina],
  );

  // Sincronizar estado cuando se carga un pedido parqueado (pedidoInicial)
  useEffect(() => {
    if (pedidoInicial) {
      setActiveOrderId(pedidoInicial.id);
      setOrderCode(pedidoInicial.code);
      setTurnNumber(pedidoInicial.turnNumber);
      setCart(cartDesdePedido(pedidoInicial));
      setTipoConsumo(
        pedidoInicial.type === "DOMICILIO"
          ? "DOMICILIO"
          : pedidoInicial.notes?.includes("[PARA COMER AQUÍ / EN SITIO]")
            ? "EN_SITIO"
            : "LLEVAR"
      );
      setFiscal(valorFiscalInicial(pedidoInicial));
      setCustomerName(pedidoInicial.customerName ?? "");
      setCustomerPhone(pedidoInicial.customerPhone ?? "");
      setDeliveryAddress(pedidoInicial.deliveryAddress ?? "");
      setOrderNotes(
        pedidoInicial.notes?.replace("[PARA COMER AQUÍ / EN SITIO]", "").trim() ?? ""
      );
    }
  }, [pedidoInicial]);

  // ── Modales y Drawers ──────────────────────────────────────────────────────
  /** El producto cuyo modal de opciones está abierto, o null si no hay ninguno. */
  const [productoAElegir, setProductoAElegir] = useState<PosProducto | null>(null);
  const [modalPagoAbierto, setModalPagoAbierto] = useState(false);
  /** El panel donde se elige la propina antes de mandar la cuenta a la caja. */
  const [modalCajaAbierto, setModalCajaAbierto] = useState(false);
  const [modalParqueadosAbierto, setModalParqueadosAbierto] = useState(false);
  const [modalAlertasStockAbierto, setModalAlertasStockAbierto] = useState(false);
  const [metodoPago, setMetodoPago] = useState<"EFECTIVO" | "TARJETA_DEBITO" | "TARJETA_CREDITO" | "NEQUI" | "DAVIPLATA" | "TRANSFERENCIA">("EFECTIVO");

  // ── Alertas de Stock Bajo (Insumos de Receta y Productos Terminados) ───────
  const alertasStockPos = useMemo(() => {
    if (!settings.inventoryEnabled) return [];

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
  }, [carta, settings.inventoryEnabled]);
  const [montoRecibido, setMontoRecibido] = useState<string>("");
  const [numeroComprobante, setNumeroComprobante] = useState("");
  /** La propina aceptada en este cobro. Arranca en 0: es voluntaria. */
  const [propinaCop, setPropinaCop] = useState(0);
  const [procesandoAccion, setProcesandoAccion] = useState(false);
  const [errorGlobal, setErrorGlobal] = useState<string | null>(null);
  const [mensajeExito, setMensajeExito] = useState<{
    titulo: string;
    detalle: string;
    orderId?: string;
  } | null>(null);

  // ── Cálculos del Carrito ───────────────────────────────────────────────────
  /**
   * El subtotal es el del PEDIDO, no el del carrito.
   *
   * Lo que ya está en la plancha sigue siendo parte de la cuenta aunque no se
   * pueda editar; sumarlo acá es lo que hace que el total en pantalla coincida
   * con el que el servidor recalcula al guardar. Con el total del carrito solo,
   * reabrir un pedido a medio preparar mostraba una cifra más chica que la que se
   * iba a cobrar.
   */
  const subtotalCarrito = cart.reduce(
    (acc, item) => acc + precioUnitario(item) * item.quantity,
    0,
  );
  const subtotalCart = subtotalCarrito + totalEnCocinaCop;
  /** Hay algo que mandar o que cobrar: en el carrito o ya en la plancha. */
  const hayPedido = cart.length > 0 || enCocina.length > 0;
  const costoDomicilio = tipoConsumo === "DOMICILIO" ? (settings.deliveryFeeCop ?? 0) : 0;
  const totalCart = subtotalCart + costoDomicilio;

  // La propina se sugiere sobre el consumo completo —lo que el cliente ve— y no
  // lleva impuesto: entra al pedido aparte de los renglones.
  const propinaSugeridaCop = computeSuggestedTip(subtotalCart, settings.tipSuggestionRateBp);
  const totalConPropina = totalCart + propinaCop;

  // Cálculo devuelta / cambio para pago en efectivo
  const numRecibido = parseFloat(montoRecibido) || 0;
  const cambioDevuelta = Math.max(0, numRecibido - totalConPropina);

  // ── Manejo de Carrito ──────────────────────────────────────────────────────

  /** Cuántas unidades de este producto ya hay en el carrito, sumando combinaciones. */
  const enCarritoDelProducto = (productId: string) =>
    cart.reduce((acc, i) => (i.productId === productId ? acc + i.quantity : acc), 0);

  /**
   * El carrito en la forma que audita el stock.
   *
   * El carrito guarda de cada opción lo que necesita para cobrar (nombre y
   * recargo); los insumos que consume están en la carta. Acá se vuelven a juntar
   * para poder sumar la demanda de todo el pedido antes de mandarlo.
   */
  const carritoParaAuditar = () => {
    const opcionesPorId = new Map(
      carta.flatMap((c) =>
        c.products.flatMap((p) =>
          (p.modifierGroups ?? []).flatMap((a) => a.group.options.map((o) => [o.id, o] as const)),
        ),
      ),
    );

    return cart.map((i) => ({
      productId: i.productId,
      name: i.name,
      quantity: i.quantity,
      opciones: i.opciones.map((o) => opcionesPorId.get(o.id)).filter((o) => o !== undefined),
    }));
  };

  /**
   * Mete una combinación concreta al carrito.
   *
   * Se agrupa por `lineKey`, no por producto: el mismo plato con proteínas
   * distintas son renglones separados porque cocina los prepara distinto y el
   * cliente los pidió distinto.
   */
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
          ? `Stock insuficiente de insumos para preparar "${producto.name}".`
          : `Stock máximo alcanzado para "${producto.name}" (${disp} porciones preparables con los insumos actuales en inventario).`
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
          i.lineKey === lineKey
            ? { ...i, quantity: i.quantity + quantity, notes: notes || i.notes }
            : i
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

  /** Un toque en la tarjeta: para los productos sin nada que elegir. */
  const agregarAlCarrito = (producto: PosProducto) => {
    agregarCombinacion(producto, [], 1, "");
  };

  /** Lo mismo que un toque, pero pasando por el modal si hay algo que elegir. */
  const tocarProducto = (producto: PosProducto) => {
    if (tieneModificadores(producto)) setProductoAElegir(producto);
    else agregarAlCarrito(producto);
  };

  /**
   * Un código leído (o tecleado) se resuelve contra SKU, id o nombre exacto.
   *
   * Exacto primero y por subcadena después: un SKU es único, un nombre no, y
   * agregar "Cerveza" cuando hay cuatro sería agregar la que salga. La subcadena
   * queda como última chance para quien escribe a mano.
   */
  const procesarCodigoDeBarras = (codigo: string) => {
    const query = codigo.trim().toLowerCase();
    if (!query) return;

    const todos = carta.flatMap((c) => c.products);
    const exacto = todos.find(
      (prod) =>
        (prod.sku && prod.sku.toLowerCase() === query) ||
        prod.id.toLowerCase() === query ||
        prod.name.toLowerCase() === query,
    );
    const encontrado = exacto ?? todos.find((prod) => prod.name.toLowerCase().includes(query));

    if (!encontrado) {
      setErrorGlobal(`No se encontró ningún producto con el código o nombre "${codigo}".`);
      return;
    }
    if (!encontrado.isAvailable) {
      setErrorGlobal(`${encontrado.name} está marcado como no disponible en la carta.`);
      return;
    }

    tocarProducto(encontrado);
    setCodigoLeido("");
    setErrorGlobal(null);
  };

  const cambiarCantidadCart = (lineKey: string, delta: number) => {
    const item = cart.find((i) => i.lineKey === lineKey);

    if (delta > 0 && item) {
      let prodObj: PosProducto | undefined;
      for (const cat of carta) {
        const p = cat.products.find((x) => x.id === item.productId);
        if (p) {
          prodObj = p;
          break;
        }
      }

      if (prodObj) {
        const disp = calcularStockDisponibleProducto(prodObj, settings.inventoryEnabled);
        const cantActual = enCarritoDelProducto(item.productId);

        if (!settings.permitirVentaSinStock && disp !== null && cantActual + delta > disp) {
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
        .map((it) => {
          if (it.lineKey === lineKey) {
            const nueva = it.quantity + delta;
            return nueva > 0 ? { ...it, quantity: nueva } : null;
          }
          return it;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const actualizarNotaItem = (lineKey: string, notes: string) => {
    setCart((prev) => prev.map((item) => (item.lineKey === lineKey ? { ...item, notes } : item)));
  };

  const quitarDelCarrito = (lineKey: string) => {
    setCart((prev) => prev.filter((item) => item.lineKey !== lineKey));
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
    router.push(usaMesas ? "/salon" : "/pos");
  };

  // ── Procesar Acción (PAGAR_DIRECTO, ENVIAR_COCINA, ENVIAR_CAJA, PARQUEAR) ──
  const ejecutarProcesarPos = async (accion: AccionPos) => {
    // Un pedido retomado puede tener el carrito vacío y todo en la plancha: eso
    // no es un pedido vacío, y mandarlo a caja o cobrarlo es exactamente lo que
    // se está haciendo.
    if (!hayPedido) {
      setErrorGlobal("El pedido está vacío. Tocá un producto para agregarlo.");
      return;
    }

    if (!customerName.trim()) {
      setErrorGlobal("Falta el nombre: es lo que se canta al entregar y lo que sale en el tiquete.");
      document.getElementById("customerName")?.focus();
      return;
    }

    const errorStock = auditarStockCarritoRecetas(
      carritoParaAuditar(),
      carta,
      settings.inventoryEnabled && !settings.permitirVentaSinStock,
    );
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
      facturaElectronica: fiscal.facturaElectronica,
      docType: fiscal.facturaElectronica ? fiscal.docType : undefined,
      docNumber: fiscal.facturaElectronica ? fiscal.docNumber.trim() || undefined : undefined,
      customerEmail: fiscal.facturaElectronica
        ? fiscal.customerEmail.trim() || undefined
        : undefined,
      items: cart.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
        notes: i.notes.trim() || undefined,
        modifierOptionIds: i.opciones.map((o) => o.id),
      })),
      accion,
      // La propina de "Enviar a caja" viaja suelta: ahí no hay pago todavía, y es
      // el mismo momento en que `pedirCuenta` la pregunta en la mesa.
      ...(accion === "ENVIAR_CAJA" ? { tipCop: propinaCop } : {}),
      ...(accion === "PAGAR_DIRECTO"
        ? {
            pago: {
              method: metodoPago,
              amountCop: totalConPropina,
              tipCop: propinaCop,
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
          titulo: "Venta cobrada",
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
          titulo: "Comanda enviada a cocina",
          detalle: `Pedido ${data.code} · Turno ${data.turnNumber ?? data.code}. Queda en espera: mandalo a caja cuando el cliente pida la cuenta.`,
          orderId: data.orderId,
        });
      } else if (accion === "ENVIAR_CAJA") {
        setMensajeExito({
          titulo: "Cuenta enviada a caja",
          detalle: `Pedido ${data.code} · Turno ${data.turnNumber ?? data.code}. Ya aparece en Caja para cobrar.`,
          orderId: data.orderId,
        });
      } else {
        setMensajeExito({
          titulo: "Pedido guardado en espera",
          detalle: `Pedido ${data.code} guardado. Se retoma desde "En espera".`,
          orderId: data.orderId,
        });
      }

      vaciarCarrito();
      setNumeroComprobante("");
      setMontoRecibido("");
      if (usaMesas) {
        router.push("/salon");
      } else {
        router.refresh();
      }
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
        // También por SKU: quien tiene el producto en la mano lee el código, no
        // el nombre.
        return p.name.toLowerCase().includes(q) || Boolean(p.sku?.toLowerCase().includes(q));
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
        <Card className="max-w-xl mx-auto border-warning/40 bg-warning/5 shadow-md rounded-2xl p-6 space-y-4 text-center">
          <div className="size-14 mx-auto rounded-full bg-warning/20 text-warning-soft flex items-center justify-center text-2xl font-bold">
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
              {pendingCaja ? "Abriendo turno..." : "Abrir turno de caja"}
            </Button>
          </form>
        </Card>
      ) : (
        /* ── INTERFAZ POS COMPLETA DUAL PANE ────────────────────────────────── */
        <div className="space-y-4">
          {/* Header Superior del POS */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-card p-3.5 rounded-2xl border border-border shadow-xs">
            <div className="flex items-center gap-3">
              <div className="size-9 rounded-xl bg-brand/10 text-brand flex items-center justify-center font-bold">
                <ShoppingBag className="size-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-base font-bold tracking-tight text-foreground">
                    {usaMesas ? "Pedido sin mesa" : "Punto de Venta Mostrador"}
                  </h1>
                  {activeOrderId && (
                    <Badge variant="outline" className="font-mono text-rotulo font-bold">
                      Pedido #{orderCode}{turnNumber !== null ? ` · Turno 0${turnNumber}` : ""}
                    </Badge>
                  )}
                </div>
                <p className="text-rotulo text-muted-foreground">
                  Venta rápida para llevar, en sitio o a domicilio.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {activeOrderId ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={nuevoPedido}
                  className="h-8 text-xs font-semibold gap-1 rounded-xl"
                >
                  <Plus className="size-3.5" /> Nuevo pedido
                </Button>
              ) : null}

              {pedidoGuardadoVacio && cart.length === 0 && activeOrderId && (
                <CerrarSinConsumo
                  orderId={activeOrderId}
                  texto="Cerrar pedido vacío"
                  redirigirA={usaMesas ? "/salon" : "/pos"}
                />
              )}

              {usaMesas && (
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="text-xs font-semibold rounded-xl h-8 gap-1.5 border-border hover:bg-muted text-foreground"
                >
                  <Link href="/salon" className="inline-flex items-center gap-1.5">
                    <ArrowLeft className="size-3.5" />
                    <span>Ir al salón</span>
                  </Link>
                </Button>
              )}

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setModalParqueadosAbierto(true)}
                className="relative text-xs font-semibold rounded-xl h-8 gap-1.5 border-border hover:bg-muted text-foreground"
              >
                <PauseCircle className="size-3.5 text-muted-foreground" />
                <span>En espera</span>
                {enEspera.length > 0 && (
                  <Badge className="bg-warning text-white text-rotulo px-1.5 py-0 h-4 min-w-4 rounded-full">
                    {enEspera.length}
                  </Badge>
                )}
              </Button>
            </div>
          </div>

          {/* Banner de Éxito Temporal */}
          {mensajeExito && (
            <Alert className="border-success/40 bg-success/10 text-success-soft flex flex-wrap items-center justify-between gap-3 rounded-2xl">
              <div>
                <AlertTitle className="font-bold text-sm">{mensajeExito.titulo}</AlertTitle>
                <AlertDescription className="text-xs">{mensajeExito.detalle}</AlertDescription>
              </div>
              <div className="flex items-center gap-2">
                {usaMesas && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => router.push("/salon")}
                    className="h-8 text-xs font-bold gap-1 border-success/40 text-success-soft rounded-xl"
                  >
                    ← Ir al salón
                  </Button>
                )}
                {mensajeExito.orderId && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(`/imprimir/pedido/${mensajeExito.orderId}?auto=1`, "_blank")}
                    className="h-8 text-xs font-semibold gap-1 rounded-xl"
                  >
                    <Printer className="size-3.5" /> Imprimir recibo
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
                    placeholder="Buscar producto por nombre o ingrediente..."
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

                {/* El lector de barras es su propio formulario: termina en Enter y
                    no puede arrastrar al resto de la pantalla al enviarse. */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    procesarCodigoDeBarras(codigoLeido);
                  }}
                  className="hidden sm:block w-44"
                >
                  <label htmlFor="codigoBarras" className="sr-only">
                    Código de barras
                  </label>
                  <Input
                    id="codigoBarras"
                    value={codigoLeido}
                    onChange={(e) => setCodigoLeido(e.target.value)}
                    placeholder="Código + Enter"
                    className="h-10 text-xs rounded-xl bg-card border-border font-mono"
                  />
                </form>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setModalEscanerAbierto(true)}
                  className="h-10 rounded-xl border-border bg-card text-xs font-bold gap-1.5 px-3"
                >
                  <ScanLine className="size-4 text-brand" />
                  <span className="hidden sm:inline">Escanear</span>
                </Button>

                {/* Pill Modesto de Alertas de Stock (solo visible si el inventario está activado) */}
                {settings.inventoryEnabled && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setModalAlertasStockAbierto(true)}
                    className={cn(
                      "h-10 text-xs font-bold rounded-xl gap-1.5 shrink-0 transition-all",
                      alertasStockPos.length > 0
                        ? "border-warning/40 bg-warning/10 text-warning-soft hover:bg-warning/20"
                        : "border-border text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <AlertTriangle className="size-4 text-warning-soft" />
                    <span className="hidden sm:inline">
                      {alertasStockPos.length > 0 ? `${alertasStockPos.length} Stock Crítico` : "Stock OK"}
                    </span>
                    {alertasStockPos.length > 0 && (
                      <Badge className="bg-warning text-white text-rotulo px-1.5 py-0 h-4 min-w-4 rounded-full">
                        {alertasStockPos.length}
                      </Badge>
                    )}
                  </Button>
                )}
              </div>

              {/* Pills de Categorías con Scroll Horizontal */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                <button
                  type="button"
                  onClick={() => setCategoriaSeleccionada(null)}
                  className={cn(
                    "inline-flex min-h-11 tableta:min-h-9 items-center px-3.5 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all border",
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
                      "inline-flex min-h-11 tableta:min-h-9 items-center px-3.5 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all border",
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
                {/* Un negocio recién creado llega acá con la carta vacía y veía
                    "no se encontraron productos: probá con otro nombre", que lo
                    manda a buscar algo que no existe. No es lo mismo no encontrar
                    que no haber cargado nada todavía. */}
                {todosLosProductosCount === 0 ? (
                  <div className="p-8 text-center bg-card rounded-2xl border border-dashed border-border space-y-3">
                    <p className="text-sm font-semibold">Todavía no hay carta</p>
                    <p className="text-xs text-muted-foreground">
                      Para tomar pedidos hay que cargar los productos con su precio.
                    </p>
                    <Button asChild size="sm" className="rounded-xl">
                      <Link href="/administracion/carta">Cargar la carta</Link>
                    </Button>
                  </div>
                ) : categoriasFiltradas.length === 0 ? (
                  <div className="p-8 text-center bg-card rounded-2xl border border-border space-y-2">
                    <p className="text-sm font-semibold">No se encontraron productos</p>
                    <p className="text-xs text-muted-foreground">
                      Probá buscando con otro nombre o seleccioná otra categoría.
                    </p>
                  </div>
                ) : (
                  categoriasFiltradas.map((cat) => (
                    <SeccionPlegable
                      key={cat.id}
                      titulo={cat.name}
                      cuenta={cat.products.length}
                    >
                      <div className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3">
                        {cat.products.map((prod) => {
                          const cant = enCarritoDelProducto(prod.id);
                          const conModificadores = tieneModificadores(prod);

                          return (
                            <div
                              key={prod.id}
                              onClick={() => {
                                if (!prod.isAvailable) return;
                                // Con modificadores hay algo que decidir: se abre
                                // el modal. Sin ellos entra de un toque, que es
                                // como se vende la mayoría de la carta.
                                if (conModificadores) setProductoAElegir(prod);
                                else agregarAlCarrito(prod);
                              }}
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

                              {/* Solo hay recuadro si hay foto. Sin ella se pintaba
                                  un bloque gris azulado con las dos primeras
                                  letras del nombre —"CE", "CE", "CE" para las tres
                                  cervezas—: no distinguía nada, se comía la mitad
                                  de la tarjeta y le quitaba peso justo a lo que se
                                  lee para elegir rápido, que es el nombre y el
                                  precio. */}
                              {prod.imageUrl && (
                                <div className="aspect-video w-full rounded-xl bg-[var(--panel-2)] overflow-hidden flex items-center justify-center relative">
                                  <img
                                    src={prod.imageUrl}
                                    alt={prod.name}
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                  />
                                  {!prod.isAvailable && (
                                    <span className="absolute inset-0 bg-background/80 backdrop-blur-[1px] flex items-center justify-center text-rotulo font-bold text-destructive">
                                      Agotado
                                    </span>
                                  )}
                                </div>
                              )}
                              {!prod.imageUrl && !prod.isAvailable && (
                                <span className="text-destructive text-rotulo font-bold">Agotado</span>
                              )}

                              {/* Info del Producto */}
                              <div className="space-y-1">
                                <h4 className="font-semibold text-xs text-foreground line-clamp-2 leading-tight">
                                  {prod.name}
                                </h4>
                                <p className="numeral font-bold text-sm text-brand">
                                  {formatCop(prod.priceCop)}
                                </p>

                                {/* Indicador de porciones preparables con insumos de la receta */}
                                {(() => {
                                  const disp = calcularStockDisponibleProducto(prod, settings.inventoryEnabled);
                                  if (disp === null) return null;

                                  const esSinStock = disp <= 0;
                                  const esBajoStock = disp > 0 && disp <= 5;
                                  const tieneReceta = Boolean(prod.recipeItems && prod.recipeItems.length > 0);

                                  return (
                                    <div
                                      className={cn(
                                        "inline-flex items-center gap-1 text-rotulo font-bold px-1.5 py-0.5 rounded-md border w-fit mt-1",
                                        esSinStock
                                          ? "bg-destructive/10 text-destructive-soft border-destructive/30"
                                          : esBajoStock
                                          ? "bg-warning/10 text-warning-soft border-warning/30"
                                          : "bg-success/10 text-success-soft border-success/30"
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
                                    "w-full h-8 text-rotulo font-bold rounded-xl gap-1 transition-all",
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
                    </SeccionPlegable>
                  ))
                )}
              </div>
            </div>

            {/* ── PANEL DERECHO: PANEL DE VENTA Y CARRITO (5 COLS / 40%) ────────── */}
            <div className="lg:col-span-5 space-y-4 sticky top-4">
              <Card className="border-border bg-card shadow-sm rounded-2xl overflow-hidden space-y-0">
                {/* Header del Carrito */}
                <div className="p-3.5 border-b border-border bg-[var(--panel-2)] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShoppingCart className="size-4 text-brand" />
                    <span className="font-bold text-sm text-foreground">Detalle del pedido</span>
                    {cart.length > 0 && (
                      <Badge variant="outline" className="font-mono text-rotulo font-bold">
                        {cart.reduce((sum, item) => sum + item.quantity, 0)} ítems
                      </Badge>
                    )}
                  </div>
                  {cart.length > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={vaciarCarrito}
                      className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 px-2 rounded-lg"
                    >
                      <Trash2 className="size-3.5 mr-1" /> Vaciar
                    </Button>
                  )}
                </div>

                <div className="p-4 space-y-4">
                  {/* Selector de Tipo de Consumo */}
                  <div className="space-y-1.5">
                    <Label className="text-rotulo font-semibold uppercase tracking-wider text-muted-foreground block">
                      Tipo de consumo
                    </Label>
                    <div className="grid grid-cols-3 gap-1.5 p-1 bg-[var(--panel-2)] rounded-xl border border-border/60">
                      <button
                        type="button"
                        onClick={() => setTipoConsumo("LLEVAR")}
                        className={cn(
                          "min-h-9 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5",
                          tipoConsumo === "LLEVAR"
                            ? "bg-[var(--brasa)] text-[var(--tinta)] shadow-xs font-bold"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <ShoppingBag className="size-3.5" /> Llevar
                      </button>
                      <button
                        type="button"
                        onClick={() => setTipoConsumo("EN_SITIO")}
                        className={cn(
                          "min-h-9 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5",
                          tipoConsumo === "EN_SITIO"
                            ? "bg-[var(--brasa)] text-[var(--tinta)] shadow-xs font-bold"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <Utensils className="size-3.5" /> En sitio
                      </button>
                      {settings.deliveryEnabled && (
                        <button
                          type="button"
                          onClick={() => setTipoConsumo("DOMICILIO")}
                          className={cn(
                            "min-h-9 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5",
                            tipoConsumo === "DOMICILIO"
                              ? "bg-[var(--brasa)] text-[var(--tinta)] shadow-xs font-bold"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          <Bike className="size-3.5" /> Domicilio
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Datos del Cliente */}
                  <div className="space-y-2.5 pt-1">
                    <div className="space-y-1">
                      <Label htmlFor="customerName" className="text-xs font-medium flex items-center justify-between">
                        <span>Nombre del cliente</span>
                        <span className="text-rotulo font-semibold text-muted-foreground">Obligatorio</span>
                      </Label>
                      <Input
                        id="customerName"
                        value={customerName}
                        onChange={(e) => {
                          setCustomerName(e.target.value);
                          if (errorGlobal && e.target.value.trim()) setErrorGlobal(null);
                        }}
                        placeholder="Ej. Carlos o Mostrador"
                        className={cn(
                          "h-9 text-xs rounded-xl transition-all",
                          cart.length > 0 && !customerName.trim() && errorGlobal
                            ? "border-destructive ring-1 ring-destructive/30 bg-destructive/5 font-semibold text-foreground"
                            : "bg-background border-input"
                        )}
                      />
                    </div>

                    {/* Campos obligatorios si es Domicilio */}
                    {tipoConsumo === "DOMICILIO" && (
                      <div className="space-y-2 p-3 rounded-xl bg-brand/5 border border-brand/20">
                        <span className="text-xs font-bold text-brand flex items-center gap-1.5">
                          <Bike className="size-3.5" /> Datos de entrega
                        </span>
                        <div className="space-y-1.5">
                          <Label htmlFor="customerPhone" className="text-rotulo font-semibold">
                            Celular / Teléfono *
                          </Label>
                          <Input
                            id="customerPhone"
                            value={customerPhone}
                            onChange={(e) => setCustomerPhone(e.target.value)}
                            placeholder="Ej. 3001234567"
                            className="h-8 text-xs rounded-xl bg-background"
                            required
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="deliveryAddress" className="text-rotulo font-semibold">
                            Dirección de Entrega *
                          </Label>
                          <Input
                            id="deliveryAddress"
                            value={deliveryAddress}
                            onChange={(e) => setDeliveryAddress(e.target.value)}
                            placeholder="Ej. Calle 45 # 12-34 Apto 201"
                            className="h-8 text-xs rounded-xl bg-background"
                            required
                          />
                        </div>
                      </div>
                    )}

                    {/* Notas generales del pedido */}
                    <div className="space-y-1">
                      <Label htmlFor="orderNotes" className="text-xs font-medium text-muted-foreground">
                        Notas generales (opcional)
                      </Label>
                      <Input
                        id="orderNotes"
                        value={orderNotes}
                        onChange={(e) => setOrderNotes(e.target.value)}
                        placeholder="Ej. Sin picante, empacar para viaje..."
                        className="h-8 text-xs rounded-xl text-muted-foreground"
                      />
                    </div>
                  </div>

                  {/* Lista de Ítems en el Carrito */}
                  {/* Lo que la cocina ya tomó: se muestra y no se edita. Cambiar
                      un renglón que está en la plancha no es cambiar un renglón,
                      es cambiarle el plato a alguien que ya lo está haciendo; para
                      eso está anular desde la cuenta, con motivo y bitácora. */}
                  {enCocina.length > 0 && (
                    <div className="space-y-1.5 pt-2 border-t border-border/80">
                      <div className="flex items-baseline justify-between gap-2">
                        <Label className="text-rotulo font-semibold uppercase tracking-wider text-muted-foreground block">
                          Ya en cocina
                        </Label>
                        <span className="numeral text-rotulo font-bold text-foreground">
                          {formatCop(totalEnCocinaCop)}
                        </span>
                      </div>
                      <ul className="space-y-1 rounded-xl border border-dashed border-border/80 bg-[var(--panel-2)] p-2.5">
                        {enCocina.map((item) => (
                          <li
                            key={item.id}
                            className="flex items-baseline justify-between gap-2 text-xs"
                          >
                            <span className="min-w-0 flex-1 truncate text-muted-foreground">
                              <span className="numeral font-bold text-foreground">
                                {item.quantity}
                              </span>
                              {" · "}
                              {item.nameSnapshot}
                            </span>
                            <span className="numeral shrink-0 text-muted-foreground">
                              {formatCop(item.lineTotalCop ?? item.unitPriceCop * item.quantity)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="space-y-1.5 pt-2 border-t border-border/80">
                    <Label className="text-rotulo font-semibold uppercase tracking-wider text-muted-foreground block">
                      {enCocina.length > 0 ? "Agregar al pedido" : "Productos seleccionados"}
                    </Label>
                    <div className="space-y-2 max-h-[20rem] overflow-y-auto pr-1">
                      {cart.length === 0 ? (
                        <div className="p-6 text-center text-muted-foreground space-y-1 bg-[var(--panel-2)] rounded-xl border border-dashed border-border/80">
                          <ShoppingBag className="size-6 mx-auto opacity-30" />
                          <p className="text-xs font-medium">
                            {enCocina.length > 0 ? "Sin adiciones" : "El pedido está vacío"}
                          </p>
                          <p className="text-rotulo opacity-75">
                            Tocá productos del catálogo a la izquierda para agregarlos.
                          </p>
                        </div>
                      ) : (
                        cart.map((item) => (
                          <div
                            key={item.lineKey}
                            className="p-2.5 rounded-xl bg-[var(--panel-2)] border border-border/80 space-y-1.5"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="space-y-0.5 flex-1 min-w-0">
                                <span className="font-bold text-xs text-foreground block truncate">
                                  {item.name}
                                </span>
                                {item.opciones.length > 0 && (
                                  <span className="text-rotulo font-medium text-muted-foreground block leading-tight">
                                    {item.opciones
                                      .map((o) =>
                                        o.priceDeltaCop > 0
                                          ? `${o.name} (+${formatCop(o.priceDeltaCop)})`
                                          : o.name
                                      )
                                      .join(" · ")}
                                  </span>
                                )}
                                <span className="numeral text-rotulo font-semibold text-muted-foreground block">
                                  {formatCop(precioUnitario(item))} c/u
                                </span>
                              </div>
                              <span className="numeral font-bold text-xs text-brand shrink-0">
                                {formatCop(precioUnitario(item) * item.quantity)}
                              </span>
                            </div>

                            {/* Controles de cantidad e inline note */}
                            <div className="flex items-center justify-between gap-2 pt-1">
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => cambiarCantidadCart(item.lineKey, -1)}
                                  className="size-6 rounded-lg bg-background border border-border flex items-center justify-center hover:bg-muted text-foreground transition-colors"
                                >
                                  <Minus className="size-3" />
                                </button>
                                <span className="numeral font-bold text-xs w-6 text-center">
                                  {item.quantity}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => cambiarCantidadCart(item.lineKey, 1)}
                                  className="size-6 rounded-lg bg-background border border-border flex items-center justify-center hover:bg-muted text-foreground transition-colors"
                                >
                                  <Plus className="size-3" />
                                </button>
                              </div>

                              <div className="flex items-center gap-1.5">
                                <Input
                                  value={item.notes}
                                  onChange={(e) => actualizarNotaItem(item.lineKey, e.target.value)}
                                  placeholder="Nota..."
                                  className="h-6 text-rotulo w-28 rounded-lg px-1.5"
                                />
                                <button
                                  type="button"
                                  onClick={() => quitarDelCarrito(item.lineKey)}
                                  className="text-muted-foreground hover:text-destructive p-1 transition-colors"
                                >
                                  <X className="size-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Total y qué hacer con el pedido */}
                  <div className="space-y-3 pt-3 border-t border-border">
                    {errorGlobal && (
                      <Alert variant="destructive" role="alert" className="py-2 text-xs rounded-xl">
                        <AlertDescription>{errorGlobal}</AlertDescription>
                      </Alert>
                    )}

                    {tipoConsumo === "DOMICILIO" && (
                      <div className="flex items-center justify-between text-xs px-3 py-2 rounded-xl bg-brand/10 border border-brand/20 text-brand">
                        <span className="flex items-center gap-1.5 font-bold">
                          <Bike className="size-4 shrink-0" /> Servicio de domicilio
                        </span>
                        <span className="numeral font-bold text-foreground">
                          {costoDomicilio > 0 ? `+${formatCop(costoDomicilio)}` : "Gratis ($0)"}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center justify-between p-3.5 rounded-xl bg-[var(--panel-2)] border border-border">
                      <div className="space-y-0.5">
                        <span className="font-bold text-xs uppercase tracking-wider text-muted-foreground block">
                          Total a pagar
                        </span>
                        {tipoConsumo === "DOMICILIO" && (
                          <span className="text-rotulo text-muted-foreground block">
                            Productos {formatCop(subtotalCart)} + Domicilio {formatCop(costoDomicilio)}
                          </span>
                        )}
                      </div>
                      <span className="numeral text-2xl font-extrabold text-brand">
                        {formatCop(totalCart)}
                      </span>
                    </div>

                    {/* Acciones principales del pedido */}
                    <div className="space-y-2 pt-1">
                      {usaMesas ? (
                        <>
                          <Button
                            type="button"
                            onClick={() => ejecutarProcesarPos("ENVIAR_COCINA")}
                            disabled={!hayPedido || procesandoAccion}
                            className="w-full bg-brand hover:bg-brand/90 text-brand-foreground font-bold h-11 text-xs rounded-xl shadow-xs gap-2"
                          >
                            <UtensilsCrossed className="size-4" />
                            <span>Mandar comanda a cocina</span>
                          </Button>

                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              if (!customerName.trim()) {
                                setErrorGlobal(
                                  "Falta el nombre: es lo que el cajero busca en la lista.",
                                );
                                document.getElementById("customerName")?.focus();
                                return;
                              }
                              setErrorGlobal(null);
                              setModalCajaAbierto(true);
                            }}
                            disabled={!hayPedido || procesandoAccion}
                            className="w-full font-bold h-10 text-xs rounded-xl gap-2 border-border hover:bg-muted text-foreground"
                          >
                            <ReceiptText className="size-3.5 text-brand" />
                            <span>Enviar a caja</span>
                          </Button>

                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => ejecutarProcesarPos("PARQUEAR")}
                            disabled={!hayPedido || procesandoAccion}
                            className="w-full text-muted-foreground hover:text-foreground h-8 text-xs gap-1.5"
                          >
                            <PauseCircle className="size-3.5" />
                            <span>Guardar en espera</span>
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            type="button"
                            onClick={() => {
                              if (!customerName.trim()) {
                                setErrorGlobal("Escribí el nombre del cliente antes de cobrar.");
                                document.getElementById("customerName")?.focus();
                                return;
                              }
                              const errorStock = auditarStockCarritoRecetas(
                                carritoParaAuditar(),
                                carta,
                                settings.inventoryEnabled && !settings.permitirVentaSinStock,
                              );
                              if (errorStock) {
                                setErrorGlobal(errorStock);
                                return;
                              }
                              setModalPagoAbierto(true);
                            }}
                            disabled={!hayPedido || procesandoAccion}
                            className="w-full bg-brand hover:bg-brand/90 text-brand-foreground font-bold h-11 text-xs rounded-xl shadow-xs gap-2"
                          >
                            <CreditCard className="size-4" />
                            <span>Cobrar y facturar</span>
                          </Button>

                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => ejecutarProcesarPos("ENVIAR_COCINA")}
                            disabled={!hayPedido || procesandoAccion}
                            className="w-full font-bold h-10 text-xs rounded-xl gap-2 border-border hover:bg-muted text-foreground"
                          >
                            <UtensilsCrossed className="size-3.5 text-brand" />
                            <span>Mandar a cocina</span>
                          </Button>

                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              if (!customerName.trim()) {
                                setErrorGlobal(
                                  "Falta el nombre: es lo que el cajero busca en la lista.",
                                );
                                document.getElementById("customerName")?.focus();
                                return;
                              }
                              setErrorGlobal(null);
                              setModalCajaAbierto(true);
                            }}
                            disabled={!hayPedido || procesandoAccion}
                            className="w-full font-bold h-10 text-xs rounded-xl gap-2 border-border hover:bg-muted text-foreground"
                          >
                            <ReceiptText className="size-3.5 text-brand" />
                            <span>Enviar a caja</span>
                          </Button>

                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => ejecutarProcesarPos("PARQUEAR")}
                            disabled={!hayPedido || procesandoAccion}
                            className="w-full text-muted-foreground hover:text-foreground h-8 text-xs gap-1.5"
                          >
                            <PauseCircle className="size-3.5" />
                            <span>Guardar en espera</span>
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          </div>

          {/* ── LECTOR DE CÓDIGO DE BARRAS ───────────────────────────────────── */}
          {modalEscanerAbierto && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
              <Card className="w-full max-w-md rounded-2xl border-border p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <div className="flex items-center gap-2">
                    <ScanLine className="size-5 text-brand" />
                    <h3 className="font-bold text-base text-foreground">Código de barras</h3>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="tap-libre size-8 p-0"
                    aria-label="Cerrar"
                    onClick={() => setModalEscanerAbierto(false)}
                  >
                    <X className="size-4" />
                  </Button>
                </div>

                <div className="space-y-3 py-2 text-center">
                  <div className="size-20 mx-auto rounded-2xl bg-brand/10 text-brand flex items-center justify-center">
                    <ScanLine className="size-10" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Pasá el producto por el lector, o escribí su código o SKU.
                  </p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const campo = e.currentTarget.elements.namedItem(
                        "codigoModal",
                      ) as HTMLInputElement | null;
                      if (campo?.value) {
                        procesarCodigoDeBarras(campo.value);
                        setModalEscanerAbierto(false);
                      }
                    }}
                    className="space-y-3 pt-1 text-left"
                  >
                    <label htmlFor="codigoModal" className="sr-only">
                      Código o SKU del producto
                    </label>
                    <Input
                      id="codigoModal"
                      name="codigoModal"
                      autoFocus
                      placeholder="Escaneá o escribí el código + Enter"
                      className="h-11 rounded-xl text-sm font-mono"
                    />
                    <Button
                      type="submit"
                      className="w-full bg-brand hover:bg-brand/90 text-brand-foreground font-bold rounded-xl h-11 text-xs"
                    >
                      Agregar al pedido
                    </Button>
                  </form>
                </div>
              </Card>
            </div>
          )}

          {/* ── ENVIAR A CAJA: la propina se elige acá, no en la caja ─────────── */}
          {modalCajaAbierto && (
            <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <Card className="w-full max-w-sm bg-card border-border shadow-2xl rounded-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="p-4 border-b border-border bg-[var(--panel-2)] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ReceiptText className="size-5 text-brand" />
                    <h3 className="font-bold text-base text-foreground">Enviar a caja</h3>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="tap-libre size-8 p-0"
                    aria-label="Cerrar"
                    onClick={() => setModalCajaAbierto(false)}
                  >
                    <X className="size-4" />
                  </Button>
                </div>

                <div className="p-4 space-y-4">
                  <p className="text-xs text-muted-foreground">
                    La cuenta queda esperando en Caja. Si el cliente pide algo más, se
                    agrega desde acá y vuelve a estar en curso.
                  </p>

                  {/* La propina se pregunta ANTES de que la cuenta llegue a la caja:
                      si se eligiera allá, el papel que se le mostró al cliente diría
                      un total y la caja cobraría otro. */}
                  <SelectorDePropina
                    habilitado={settings.tipSuggestionEnabled}
                    sugeridaCop={propinaSugeridaCop}
                    rateBp={settings.tipSuggestionRateBp}
                    valorCop={propinaCop}
                    onCambiar={setPropinaCop}
                    id="pos-caja"
                  />

                  <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--panel-2)] border border-border">
                    <span className="text-rotulo font-bold uppercase tracking-wider text-muted-foreground">
                      Total a cobrar
                    </span>
                    <span className="numeral text-xl font-extrabold text-brand">
                      {formatCop(totalConPropina)}
                    </span>
                  </div>

                  <Button
                    type="button"
                    onClick={() => {
                      setModalCajaAbierto(false);
                      void ejecutarProcesarPos("ENVIAR_CAJA");
                    }}
                    disabled={procesandoAccion}
                    className="w-full bg-brand hover:bg-brand/90 text-brand-foreground font-bold h-11 text-xs rounded-xl gap-2"
                  >
                    <ReceiptText className="size-4" />
                    <span>Mandar la cuenta a caja</span>
                  </Button>
                </div>
              </Card>
            </div>
          )}

          {/* ── MODAL COBRO EXPRESS CON VERIFICACION DE CAMBIO / COMPROBANTE ──── */}
          {modalPagoAbierto && (
            <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <Card className="w-full max-w-md bg-card border-border shadow-2xl rounded-2xl overflow-hidden space-y-0 animate-in fade-in zoom-in-95 duration-200">
                <div className="p-4 border-b border-border bg-[var(--panel-2)] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <DollarSign className="size-5 text-success-soft" />
                    <h3 className="font-bold text-base text-foreground">Cobrar el pedido</h3>
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
                  <div className="text-center p-3 rounded-2xl bg-brand/5 border border-brand/20 space-y-1">
                    <span className="text-rotulo font-semibold text-muted-foreground uppercase">Total del Pedido</span>
                    <p className="numeral text-3xl font-extrabold text-brand">
                      {formatCop(totalConPropina)}
                    </p>
                    <div className="text-rotulo text-muted-foreground flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5">
                      <span>Productos: {formatCop(subtotalCart)}</span>
                      {tipoConsumo === "DOMICILIO" && (
                        <span className="font-semibold text-foreground">· Domicilio: {formatCop(costoDomicilio)}</span>
                      )}
                      {propinaCop > 0 && (
                        <span className="font-semibold text-foreground">· Propina: {formatCop(propinaCop)}</span>
                      )}
                    </div>
                  </div>

                  <SelectorDePropina
                    habilitado={settings.tipSuggestionEnabled}
                    sugeridaCop={propinaSugeridaCop}
                    rateBp={settings.tipSuggestionRateBp}
                    valorCop={propinaCop}
                    onCambiar={setPropinaCop}
                    id="pos"
                  />

                  {/* Nombre Cliente en Modal */}
                  <div className="space-y-1 bg-muted/30 p-2.5 rounded-xl border border-border">
                    <Label htmlFor="modalCustomerName" className="text-xs font-semibold flex items-center justify-between">
                      <span>Cliente Factura / Ticket *</span>
                      <span className="text-rotulo font-bold text-destructive-soft">(Obligatorio)</span>
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
                    <Label className="text-xs font-semibold text-foreground">Método de pago</Label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { id: "EFECTIVO", label: "Efectivo" },
                        { id: "NEQUI", label: "Nequi" },
                        { id: "DAVIPLATA", label: "Daviplata" },
                        { id: "TARJETA_DEBITO", label: "T. Débito" },
                        { id: "TARJETA_CREDITO", label: "T. Crédito" },
                        { id: "TRANSFERENCIA", label: "Transf." },
                      ].map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setMetodoPago(m.id as typeof metodoPago)}
                          className={cn(
                            "py-2 px-1.5 rounded-xl text-xs font-medium transition-all border text-center",
                            metodoPago === m.id
                              ? "bg-brand/10 border-brand text-brand font-bold shadow-xs"
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
                        <Label htmlFor="montoRecibido" className="text-xs font-semibold text-foreground">
                          Efectivo recibido ($ COP)
                        </Label>
                        <Input
                          id="montoRecibido"
                          type="number"
                          value={montoRecibido}
                          onChange={(e) => setMontoRecibido(e.target.value)}
                          placeholder={totalConPropina.toString()}
                          className="h-10 text-base font-bold rounded-xl font-mono bg-background"
                        />
                      </div>

                      {/* Presets de billetes */}
                      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                        {[
                          { label: "Exacto", val: totalConPropina },
                          { label: "$20k", val: 20000 },
                          { label: "$50k", val: 50000 },
                          { label: "$100k", val: 100000 },
                        ].map((b) => (
                          <button
                            key={b.label}
                            type="button"
                            onClick={() => setMontoRecibido(b.val.toString())}
                            className="px-2.5 py-1 rounded-lg bg-background border border-border text-rotulo font-bold hover:bg-brand hover:text-brand-foreground transition-colors"
                          >
                            {b.label}
                          </button>
                        ))}
                      </div>

                      {/* Devuelta calculada */}
                      <div className="flex items-center justify-between pt-2 border-t border-border/60">
                        <span className="text-xs font-semibold text-muted-foreground">Cambio / Devuelta:</span>
                        <span className="numeral text-lg font-bold text-success-soft">
                          {formatCop(cambioDevuelta)}
                        </span>
                      </div>
                    </div>
                  ) : (
                    /* Si es Tarjeta / Electrónico: Número de comprobante obligatorio */
                    <div className="space-y-1.5 p-3.5 rounded-2xl bg-muted/40 border border-border">
                      <Label htmlFor="numeroComprobante" className="text-xs font-semibold text-foreground">
                        Número de Comprobante / Referencia de Pago *
                      </Label>
                      <Input
                        id="numeroComprobante"
                        value={numeroComprobante}
                        onChange={(e) => setNumeroComprobante(e.target.value)}
                        placeholder="Ej. # 482910 / Aprobación datáfono"
                        className="h-10 text-xs rounded-xl bg-background font-mono"
                        required
                      />
                      <span className="text-rotulo text-muted-foreground block">
                        Requerido para conciliación de pagos electrónicos y tarjetas.
                      </span>
                    </div>
                  )}

                  {/* Solo en negocios que de verdad pueden emitir: en el resto el
                      cobro no muestra nada fiscal y la venta va a consumidor
                      final, que es lo normal en un bar. */}
                  <DatosFiscales
                    puedeFacturar={puedeFacturar}
                    orderId={activeOrderId ?? "nuevo"}
                    valor={fiscal}
                    onChange={setFiscal}
                  />

                  <div className="pt-2">
                    <Button
                      type="button"
                      disabled={procesandoAccion}
                      onClick={() => ejecutarProcesarPos("PAGAR_DIRECTO")}
                      className="w-full h-11 bg-brand hover:bg-brand/90 text-brand-foreground font-bold text-sm rounded-xl shadow-xs gap-2"
                    >
                      {procesandoAccion ? "Procesando cobro..." : `Confirmar pago de ${formatCop(totalConPropina)}`}
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
                <div className="p-4 border-b border-border bg-[var(--panel-2)] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <PauseCircle className="size-5 text-warning-soft" />
                    <h3 className="font-bold text-base text-foreground">
                      Pedidos en espera ({enEspera.length})
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
                  {enEspera.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground space-y-1">
                      <PauseCircle className="size-10 mx-auto opacity-30" />
                      <p className="text-sm font-semibold">No hay pedidos en espera</p>
                      <p className="text-xs opacity-75">
                        Los que dejes con &quot;Dejar en espera&quot; aparecen acá para retomarlos.
                      </p>
                    </div>
                  ) : (
                    enEspera.map((p) => (
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
                              <Badge variant="outline" className="text-rotulo bg-brand/10 text-brand">
                                Turno #{p.turnNumber}
                              </Badge>
                            )}
                            <Badge variant="secondary" className="text-rotulo">
                              {p.type === "DOMICILIO" ? "🛵 Domicilio" : "🛍️ Llevar"}
                            </Badge>
                          </div>
                          {p.customerName && (
                            <p className="text-xs font-medium text-muted-foreground truncate">
                              Cliente: {p.customerName}
                            </p>
                          )}
                          <p className="numeral text-xs font-bold text-brand">
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
                <div className="p-4 border-b border-border bg-[var(--panel-2)] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="size-5 text-warning-soft" />
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
                    <div className="p-6 text-center text-xs text-success-soft bg-success/10 rounded-xl border border-success/20 font-medium">
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
                                  className="text-rotulo px-1.5 py-0 uppercase font-mono"
                                >
                                  {a.tipo === "INSUMO"
                                    ? "Insumo Receta"
                                    : a.tipo === "PRODUCTO_TERMINADO"
                                    ? "Producto Reventa"
                                    : "Plato Receta"}
                                </Badge>
                              </div>
                              <p className="text-rotulo text-muted-foreground">{a.detalle}</p>
                            </div>

                            <Badge
                              className={cn(
                                "text-rotulo font-bold shrink-0",
                                a.nivel === "CRITICO"
                                  ? "bg-destructive text-white"
                                  : "bg-warning text-white"
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

      <SelectorModificadores
        producto={productoAElegir}
        abierto={productoAElegir !== null}
        onCerrar={() => setProductoAElegir(null)}
        permitirVentaSinStock={settings.permitirVentaSinStock}
        onConfirmar={({ opcionIds, quantity, notes }) => {
          if (!productoAElegir) return;

          const todas = (productoAElegir.modifierGroups ?? []).flatMap((a) =>
            a.group.options.map((o) => ({ ...o, groupName: a.group.name })),
          );
          const opciones = opcionIds
            .map((id) => todas.find((o) => o.id === id))
            .filter((o) => o !== undefined)
            .map((o) => ({
              id: o.id,
              groupName: o.groupName,
              name: o.name,
              priceDeltaCop: o.priceDeltaCop,
            }));

          agregarCombinacion(productoAElegir, opciones, quantity, notes);
          setProductoAElegir(null);
        }}
        yaEnCarrito={productoAElegir ? enCarritoDelProducto(productoAElegir.id) : 0}
        inventoryEnabled={settings.inventoryEnabled}
      />
    </div>
  );
}
