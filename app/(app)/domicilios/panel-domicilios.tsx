"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bike,
  Clock,
  MapPin,
  MessageSquare,
  Phone,
  QrCode,
  Search,
  User,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { actualizarEstadoDomicilio } from "@/features/domicilios/actions";
import type { DomicilioPedido } from "@/features/domicilios/queries";
import { formatCop } from "@/lib/money";
import { formatDateTimeInTimeZone } from "@/lib/time";
import { cn } from "@/lib/utils";

type PanelDomiciliosProps = {
  domicilios: DomicilioPedido[];
  timeZone: string;
};

const ESTADOS_DELIVERY = [
  { id: "TODOS", label: "Todos" },
  { id: "PENDIENTE", label: "Recibidos" },
  { id: "EN_PREPARACION", label: "En preparación" },
  { id: "EN_CAMINO", label: "En reparto" },
  { id: "ENTREGADO", label: "Entregados" },
  { id: "CANCELADO", label: "Anulados" },
] as const;

function formatearCanal(channel: string) {
  switch (channel) {
    case "DOMICILIO_QR":
      return { label: "QR Domicilio", icono: QrCode };
    case "MESA_QR":
      return { label: "QR Mesa", icono: QrCode };
    case "MESERO":
      return { label: "Mesero", icono: User };
    case "POS":
      return { label: "POS Mostrador", icono: Bike };
    default:
      return { label: "Directo", icono: Bike };
  }
}

export function PanelDomicilios({ domicilios, timeZone }: PanelDomiciliosProps) {
  const router = useRouter();
  const [filtroEstado, setFiltroEstado] = useState<string>("TODOS");
  const [busqueda, setBusqueda] = useState("");
  const [cargandoId, setCargandoId] = useState<string | null>(null);

  // Conexión a Redis SSE Stream para actualizaciones en tiempo real
  useEffect(() => {
    const eventSource = new EventSource("/api/domicilios/stream");

    eventSource.onmessage = () => {
      router.refresh();
    };

    return () => {
      eventSource.close();
    };
  }, [router]);

  const cambiarEstado = async (
    orderId: string,
    deliveryStatus: "PENDIENTE" | "EN_PREPARACION" | "EN_CAMINO" | "ENTREGADO" | "CANCELADO",
  ) => {
    setCargandoId(orderId);
    try {
      await actualizarEstadoDomicilio(undefined, { orderId, deliveryStatus });
      router.refresh();
    } finally {
      setCargandoId(null);
    }
  };

  const domiciliosFiltrados = domicilios.filter((d) => {
    const coincideEstado = filtroEstado === "TODOS" || d.deliveryStatus === filtroEstado;
    const coincideBusqueda =
      !busqueda ||
      d.code.toString().includes(busqueda) ||
      (d.customerName && d.customerName.toLowerCase().includes(busqueda.toLowerCase())) ||
      (d.customerPhone && d.customerPhone.includes(busqueda)) ||
      (d.deliveryAddress && d.deliveryAddress.toLowerCase().includes(busqueda.toLowerCase()));
    return coincideEstado && coincideBusqueda;
  });

  return (
    <div className="space-y-5">
      {/* ─────────────────────────────────────────────────────────────
          PÍLDORAS DE FILTRADO Y BÚSQUEDA
          ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {ESTADOS_DELIVERY.map((est) => {
            const count =
              est.id === "TODOS"
                ? domicilios.length
                : domicilios.filter((d) => d.deliveryStatus === est.id).length;

            return (
              <button
                key={est.id}
                type="button"
                onClick={() => setFiltroEstado(est.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all shrink-0 border",
                  filtroEstado === est.id
                    ? "bg-brand text-brand-foreground border-brand shadow-xs font-bold"
                    : "bg-card text-muted-foreground hover:text-foreground border-border hover:bg-muted/50",
                )}
              >
                <span>{est.label}</span>
                <span className={cn(
                  "text-rotulo font-mono px-1.5 py-0.2 rounded-full",
                  filtroEstado === est.id
                    ? "bg-brand-foreground/20 text-brand-foreground font-bold"
                    : "bg-muted text-muted-foreground",
                )}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por cliente, teléfono o dirección..."
            className="pl-9 h-9 text-xs rounded-xl"
          />
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          TARJETAS DE PEDIDOS A DOMICILIO (TRAZABILIDAD Y DESPACHO)
          ───────────────────────────────────────────────────────────── */}
      {domiciliosFiltrados.length === 0 ? (
        <Card className="p-10 text-center shadow-xs border-border">
          <CardContent className="space-y-2">
            <Bike className="size-8 mx-auto text-muted-foreground/60" />
            <h3 className="font-semibold text-sm text-foreground">No hay domicilios en este estado</h3>
            <p className="text-xs text-muted-foreground">
              Los pedidos a domicilio registrados por el menú QR o desde el salón aparecerán aquí para su despacho.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {domiciliosFiltrados.map((pedido) => {
            const esAnulado = pedido.status === "ANULADA" || pedido.deliveryStatus === "CANCELADO";
            const esPagado = pedido.status === "PAGADA";
            const celLimpio = pedido.customerPhone ? pedido.customerPhone.replace(/\D/g, "") : "";
            const waUrl = celLimpio ? `https://wa.me/57${celLimpio}` : null;
            const canal = formatearCanal(pedido.channel);
            const CanalIcono = canal.icono;

            return (
              <Card
                key={pedido.id}
                className={cn(
                  "shadow-xs transition-all border flex flex-col justify-between rounded-2xl",
                  pedido.deliveryStatus === "PENDIENTE" && "border-warning/40 bg-warning/[0.02]",
                  pedido.deliveryStatus === "EN_CAMINO" && "border-info/40 bg-info/[0.02]",
                  pedido.deliveryStatus === "ENTREGADO" && "border-success/30 bg-success/[0.01]",
                  esAnulado && "opacity-60 bg-muted/20 border-border",
                )}
              >
                <CardContent className="p-4 space-y-3.5 flex-1 flex flex-col justify-between">
                  {/* Encabezado Pedido */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-base text-foreground">Pedido #{pedido.code}</span>
                        {pedido.turnNumber && (
                          <Badge variant="outline" className="font-mono text-rotulo font-bold">
                            Turno 0{pedido.turnNumber}
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-rotulo font-bold uppercase tracking-wider px-2 py-0.5",
                            pedido.deliveryStatus === "PENDIENTE" && "bg-warning/10 text-warning-soft border-warning/30",
                            pedido.deliveryStatus === "EN_PREPARACION" && "bg-warning/10 text-warning-soft border-warning/30",
                            pedido.deliveryStatus === "EN_CAMINO" && "bg-info/10 text-info-soft border-info/30",
                            pedido.deliveryStatus === "ENTREGADO" && "bg-success/10 text-success-soft border-success/30",
                            pedido.deliveryStatus === "CANCELADO" && "bg-destructive/10 text-destructive-soft border-destructive/30",
                          )}
                        >
                          {ESTADOS_DELIVERY.find((e) => e.id === pedido.deliveryStatus)?.label || pedido.deliveryStatus}
                        </Badge>

                        {/* Estado financiero en caja */}
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-rotulo font-semibold px-2 py-0.5",
                            esPagado
                              ? "bg-success/10 text-success-soft border-success/30"
                              : esAnulado
                              ? "bg-destructive/10 text-destructive-soft border-destructive/30"
                              : "text-muted-foreground border-border",
                          )}
                        >
                          {esPagado ? "Pagado" : esAnulado ? "Anulado" : "Cobro pendiente"}
                        </Badge>
                      </div>
                    </div>

                    <div className="text-rotulo text-muted-foreground flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1">
                        <Clock className="size-3.5 shrink-0" />
                        <span>{formatDateTimeInTimeZone(pedido.openedAt, timeZone)}</span>
                      </div>
                      <span className="inline-flex items-center gap-1 font-medium text-muted-foreground">
                        <CanalIcono className="size-3" />
                        {canal.label}
                      </span>
                    </div>
                  </div>

                  {/* Datos del Cliente y Dirección de Entrega */}
                  <div className="rounded-xl border border-border/80 bg-muted/30 p-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between font-bold text-foreground">
                      <div className="flex items-center gap-1.5 truncate">
                        <User className="size-3.5 text-brand shrink-0" />
                        <span className="truncate">{pedido.customerName || "Cliente Domicilio"}</span>
                      </div>
                      {pedido.docType && pedido.docNumber && (
                        <span className="text-rotulo font-mono text-muted-foreground shrink-0">
                          {pedido.docType}: {pedido.docNumber}
                        </span>
                      )}
                    </div>

                    {pedido.customerPhone && (
                      <div className="flex items-center justify-between text-muted-foreground pt-0.5">
                        <div className="flex items-center gap-1.5">
                          <Phone className="size-3.5 shrink-0 text-muted-foreground" />
                          <span className="font-mono">{pedido.customerPhone}</span>
                        </div>
                        {waUrl && (
                          <a
                            href={waUrl}
                            target="_blank"
                            rel="noopener"
                            className="inline-flex items-center gap-1 text-rotulo font-bold text-success-soft hover:underline"
                          >
                            <MessageSquare className="size-3" /> WhatsApp
                          </a>
                        )}
                      </div>
                    )}

                    {pedido.deliveryAddress && (
                      <div className="flex items-start gap-1.5 text-foreground font-medium pt-1 border-t border-border/50">
                        <MapPin className="size-3.5 text-brand shrink-0 mt-0.5" />
                        <span className="leading-snug">{pedido.deliveryAddress}</span>
                      </div>
                    )}
                  </div>

                  {/* Renglones del Pedido con Desglose */}
                  <div className="space-y-1.5 pt-1">
                    <div className="flex justify-between items-center text-rotulo font-bold uppercase tracking-wider text-muted-foreground">
                      <span>Productos ({pedido.items.reduce((acc, i) => acc + i.quantity, 0)})</span>
                      <span>Total</span>
                    </div>

                    <div className="space-y-1 max-h-36 overflow-y-auto pr-1 text-xs">
                      {pedido.items.map((item) => (
                        <div key={item.id} className="flex justify-between items-start text-xs border-b border-border/40 pb-1 gap-2">
                          <div className="truncate">
                            <span className="font-semibold text-foreground">
                              {item.quantity}x {item.nameSnapshot}
                            </span>
                            {item.notes && (
                              <span className="block text-rotulo text-muted-foreground italic truncate">
                                Nota: {item.notes}
                              </span>
                            )}
                          </div>
                          <span className="numeral font-medium text-muted-foreground shrink-0 font-mono">
                            {formatCop(item.lineTotalCop)}
                          </span>
                        </div>
                      ))}
                    </div>

                    {pedido.deliveryFeeCop > 0 && (
                      <div className="flex justify-between items-center text-xs font-semibold text-brand pt-1.5 border-t border-border/40">
                        <span className="flex items-center gap-1">
                          <Bike className="size-3" /> Servicio de domicilio
                        </span>
                        <span className="numeral font-bold text-foreground">
                          +{formatCop(pedido.deliveryFeeCop)}
                        </span>
                      </div>
                    )}

                    <div className="flex justify-between items-center pt-2 font-bold text-sm text-foreground border-t border-border">
                      <span className="text-xs uppercase tracking-wider text-muted-foreground">Total pedido</span>
                      <span className="numeral text-base text-brand font-extrabold">
                        {formatCop(pedido.totalCop)}
                      </span>
                    </div>
                  </div>

                  {/* Acciones de Trazabilidad y Despacho */}
                  {!esAnulado && (
                    <div className="pt-2 border-t border-border">
                      {pedido.deliveryStatus === "PENDIENTE" && (
                        <Button
                          type="button"
                          size="sm"
                          disabled={cargandoId === pedido.id}
                          onClick={() => cambiarEstado(pedido.id, "EN_PREPARACION")}
                          className="w-full bg-brand hover:bg-brand/90 text-brand-foreground font-bold text-xs h-9 rounded-xl shadow-xs"
                        >
                          {cargandoId === pedido.id ? "Actualizando..." : "Aceptar y pasar a cocina"}
                        </Button>
                      )}

                      {pedido.deliveryStatus === "EN_PREPARACION" && (
                        <Button
                          type="button"
                          size="sm"
                          disabled={cargandoId === pedido.id}
                          onClick={() => cambiarEstado(pedido.id, "EN_CAMINO")}
                          className="w-full bg-brand hover:bg-brand/90 text-brand-foreground font-bold text-xs h-9 rounded-xl shadow-xs"
                        >
                          {cargandoId === pedido.id ? "Actualizando..." : "Despachar a reparto"}
                        </Button>
                      )}

                      {pedido.deliveryStatus === "EN_CAMINO" && (
                        <Button
                          type="button"
                          size="sm"
                          disabled={cargandoId === pedido.id}
                          onClick={() => cambiarEstado(pedido.id, "ENTREGADO")}
                          className="w-full bg-success hover:bg-success/90 text-white font-bold text-xs h-9 rounded-xl shadow-xs"
                        >
                          {cargandoId === pedido.id ? "Actualizando..." : "Confirmar entrega al cliente"}
                        </Button>
                      )}

                      {pedido.deliveryStatus === "ENTREGADO" && (
                        <div className="text-center py-1.5 text-xs text-muted-foreground font-medium">
                          ✓ Pedido entregado al cliente
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
