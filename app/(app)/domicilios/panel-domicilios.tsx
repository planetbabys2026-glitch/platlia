"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bike,
  Clock,
  MapPin,
  MessageSquare,
  Phone,
  Receipt,
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
  { id: "PENDIENTE", label: "🟡 Recibidos", color: "bg-warning/10 text-warning-soft border-warning/30" },
  { id: "EN_PREPARACION", label: "🟠 En cocina", color: "bg-warning/10 text-warning-soft border-warning/30" },
  { id: "EN_CAMINO", label: "🔵 En reparto", color: "bg-info/10 text-info-soft border-info/30" },
  { id: "ENTREGADO", label: "🟢 Entregados", color: "bg-success/10 text-success-soft border-success/30" },
  { id: "CANCELADO", label: "🔴 Anulados", color: "bg-destructive/10 text-destructive-soft border-destructive/30" },
];

export function PanelDomicilios({ domicilios, timeZone }: PanelDomiciliosProps) {
  const router = useRouter();
  const [filtroEstado, setFiltroEstado] = useState("TODOS");
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

  const cambiarEstado = async (orderId: string, deliveryStatus: "PENDIENTE" | "EN_PREPARACION" | "EN_CAMINO" | "ENTREGADO" | "CANCELADO") => {
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
    <div className="space-y-6">
      {/* ─────────────────────────────────────────────────────────────
          PÍLDORAS DE FILTRADO Y BÚSQUEDA
          ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
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
                  "inline-flex min-h-11 tableta:min-h-9 items-center rounded-full px-3.5 py-1.5 text-xs font-bold transition-all shrink-0 border",
                  filtroEstado === est.id
                    ? "bg-[var(--brasa)] text-[var(--tinta)] border-[var(--brasa)] shadow-sm font-bold"
                    : "bg-[var(--panel-2)] text-muted-foreground hover:text-[var(--papel)] border-[var(--linea-30)]",
                )}
              >
                {est.label} ({count})
              </button>
            );
          })}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar cliente, tel, dirección..."
            className="pl-9 h-9 text-xs"
          />
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          TARJETAS DE PEDIDOS A DOMICILIO
          ───────────────────────────────────────────────────────────── */}
      {domiciliosFiltrados.length === 0 ? (
        <Card className="p-12 text-center shadow-sm">
          <CardContent className="space-y-2">
            <Bike className="size-10 mx-auto text-muted-foreground/60" />
            <h3 className="font-bold text-base">No hay pedidos a domicilio en este estado</h3>
            <p className="text-xs text-muted-foreground">
              Los pedidos a domicilio generados por QR o el POS aparecerán acá en tiempo real.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(20rem,100%),1fr))] gap-4">
          {domiciliosFiltrados.map((pedido) => {
            const esAnulado = pedido.status === "ANULADA" || pedido.deliveryStatus === "CANCELADO";
            const celLimpio = pedido.customerPhone ? pedido.customerPhone.replace(/\D/g, "") : "";
            const waUrl = celLimpio ? `https://wa.me/57${celLimpio}` : null;

            return (
              <Card
                key={pedido.id}
                className={cn(
                  "shadow-sm transition-all border flex flex-col justify-between",
                  pedido.deliveryStatus === "PENDIENTE" && "border-warning/50 bg-warning/5",
                  pedido.deliveryStatus === "EN_CAMINO" && "border-info/50 bg-info/5",
                  pedido.deliveryStatus === "ENTREGADO" && "border-success/30 bg-success/5",
                  esAnulado && "opacity-60 bg-muted/20 border-border",
                )}
              >
                <CardContent className="p-4 space-y-4 flex-1 flex flex-col justify-between">
                  {/* Encabezado Pedido */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-lg text-foreground">#{pedido.code}</span>
                        {pedido.turnNumber && (
                          <Badge variant="outline" className="font-bold text-xs">
                            Turno 0{pedido.turnNumber}
                          </Badge>
                        )}
                        <Badge variant="secondary" className="font-bold text-rotulo bg-brand/10 text-brand-accent">
                          {pedido.channel === "DOMICILIO_QR"
                            ? "🛵 Domicilio QR"
                            : pedido.channel === "MESA_QR"
                            ? "🪑 Mesa QR"
                            : pedido.channel === "MESERO"
                            ? "🧑‍🍳 Mesero"
                            : "🖥️ POS"}
                        </Badge>
                      </div>

                      <Badge
                        variant="outline"
                        className={cn(
                          "font-bold text-xs",
                          ESTADOS_DELIVERY.find((e) => e.id === pedido.deliveryStatus)?.color || "border-border",
                        )}
                      >
                        {ESTADOS_DELIVERY.find((e) => e.id === pedido.deliveryStatus)?.label || pedido.deliveryStatus}
                      </Badge>
                    </div>

                    <div className="text-rotulo text-muted-foreground flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1">
                        <Clock className="size-3.5 shrink-0" />
                        <span>{formatDateTimeInTimeZone(pedido.openedAt, timeZone)}</span>
                      </div>
                      <span className="text-rotulo font-mono text-muted-foreground">Origen: {pedido.channel}</span>
                    </div>
                  </div>

                  {/* Datos del Cliente */}
                  <div className="rounded-xl border border-border/80 bg-background/80 p-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between font-bold text-foreground">
                      <div className="flex items-center gap-1.5 truncate">
                        <User className="size-3.5 text-brand-accent shrink-0" />
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
                          <span>{pedido.customerPhone}</span>
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
                      <div className="flex items-start gap-1.5 text-foreground font-medium pt-0.5 border-t border-border/50">
                        <MapPin className="size-3.5 text-brand-accent shrink-0 mt-0.5" />
                        <span className="leading-snug">{pedido.deliveryAddress}</span>
                      </div>
                    )}
                  </div>

                  {/* Renglones del Pedido */}
                  <div className="space-y-1.5 pt-1">
                    <h4 className="text-rotulo font-bold uppercase tracking-wider text-muted-foreground">
                      Productos ({pedido.items.reduce((acc, i) => acc + i.quantity, 0)})
                    </h4>
                    <div className="space-y-1 max-h-36 overflow-y-auto pr-1 text-xs">
                      {pedido.items.map((item) => (
                        <div key={item.id} className="flex justify-between items-start text-xs border-b border-border/40 pb-1">
                          <div>
                            <span className="font-semibold text-foreground">
                              {item.quantity}x {item.nameSnapshot}
                            </span>
                            {item.notes && (
                              <span className="block text-rotulo text-warning-soft italic">
                                📝 {item.notes}
                              </span>
                            )}
                          </div>
                          <span className="numeral font-medium text-muted-foreground shrink-0">
                            {formatCop(item.lineTotalCop)}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="flex justify-between items-center pt-2 font-black text-sm text-foreground border-t border-border">
                      <span>Total</span>
                      <span className="numeral text-base text-brand-accent">
                        {formatCop(pedido.totalCop)}
                      </span>
                    </div>
                  </div>

                  {/* Acciones de Estado y Cobro */}
                  {!esAnulado && (
                    <div className="space-y-2 pt-2 border-t border-border">
                      <div className="grid grid-cols-2 gap-1.5">
                        {pedido.deliveryStatus === "PENDIENTE" && (
                          <Button
                            type="button"
                            size="sm"
                            disabled={cargandoId === pedido.id}
                            onClick={() => cambiarEstado(pedido.id, "EN_PREPARACION")}
                            className="bg-warning hover:bg-warning/90 text-white font-bold text-xs h-8"
                          >
                            En preparación
                          </Button>
                        )}
                        {pedido.deliveryStatus === "EN_PREPARACION" && (
                          <Button
                            type="button"
                            size="sm"
                            disabled={cargandoId === pedido.id}
                            onClick={() => cambiarEstado(pedido.id, "EN_CAMINO")}
                            className="bg-info hover:bg-info/90 text-white font-bold text-xs h-8"
                          >
                            En camino
                          </Button>
                        )}
                        {pedido.deliveryStatus === "EN_CAMINO" && (
                          <Button
                            type="button"
                            size="sm"
                            disabled={cargandoId === pedido.id}
                            onClick={() => cambiarEstado(pedido.id, "ENTREGADO")}
                            className="bg-success hover:bg-success/90 text-white font-bold text-xs h-8"
                          >
                            Entregado
                          </Button>
                        )}

                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={cargandoId === pedido.id}
                          onClick={() => cambiarEstado(pedido.id, "CANCELADO")}
                          className="text-destructive-soft border-destructive/30 hover:bg-destructive/10 text-xs h-8"
                        >
                          Anular
                        </Button>

                        {/* Botón directo de Cobrar / Facturar */}
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => router.push(`/pedido/${pedido.id}`)}
                          className="bg-brand text-white font-bold text-xs h-8 col-span-2 shadow-sm gap-1"
                        >
                          <Receipt className="size-3.5" /> Facturar / Cobrar
                        </Button>
                      </div>
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
