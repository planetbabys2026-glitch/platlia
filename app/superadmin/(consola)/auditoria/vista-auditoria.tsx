"use client";

import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCop } from "@/lib/money";
import { formatDayInTimeZone } from "@/lib/time";
import {
  ShieldCheck,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  User,
  Store,
  X,
  Receipt
} from "lucide-react";

type AuditItem = {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata: Record<string, any> | any;
  createdAt: Date;
  business: { id: string; name: string; slug: string } | null;
  user: { id: string; name: string; email: string } | null;
};

type PagoItem = {
  id: string;
  amountCop: number;
  status: string;
  mpPaymentId: string | null;
  mpPreferenceId: string | null;
  mpStatusDetail: string | null;
  method: string | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  paidAt: Date | null;
  createdAt: Date;
  business: { id: string; name: string; slug: string };
};

type WebhookItem = {
  id: string;
  mpEventId: string;
  type: string;
  error: string | null;
  receivedAt: Date;
  processedAt: Date | null;
};

export function VistaAuditoria({
  auditLogs,
  pagos,
  webhooks,
}: {
  auditLogs: AuditItem[];
  pagos: PagoItem[];
  webhooks: WebhookItem[];
}) {
  const [tabActual, setTabActual] = useState<"auditoria" | "pagos">("auditoria");
  const [busqueda, setBusqueda] = useState("");
  const [filtroAccion, setFiltroAccion] = useState<string>("TODAS");
  const [filtroPago, setFiltroPago] = useState<string>("TODOS");

  // Auditoría filtrada
  const auditLogsFiltrados = useMemo(() => {
    return auditLogs.filter((log) => {
      const q = busqueda.trim().toLowerCase();
      const coincideBusqueda =
        !q ||
        log.user?.name.toLowerCase().includes(q) ||
        log.user?.email.toLowerCase().includes(q) ||
        log.business?.name.toLowerCase().includes(q) ||
        log.business?.slug.toLowerCase().includes(q) ||
        log.action.toLowerCase().includes(q) ||
        (typeof log.metadata === "object" && JSON.stringify(log.metadata).toLowerCase().includes(q));

      if (!coincideBusqueda) return false;

      if (filtroAccion === "TODAS") return true;
      if (filtroAccion === "EXTENDER") return log.action === "superadmin.licencia.extender";
      if (filtroAccion === "SUSPENDER") return log.action.startsWith("superadmin.empresa.");
      if (filtroAccion === "EQUIPO") return log.action.startsWith("superadmin.equipo.");

      return true;
    });
  }, [auditLogs, busqueda, filtroAccion]);

  // Pagos filtrados
  const pagosFiltrados = useMemo(() => {
    return pagos.filter((p) => {
      const q = busqueda.trim().toLowerCase();
      const coincideBusqueda =
        !q ||
        p.business.name.toLowerCase().includes(q) ||
        p.business.slug.toLowerCase().includes(q) ||
        p.mpPaymentId?.toLowerCase().includes(q) ||
        p.mpStatusDetail?.toLowerCase().includes(q);

      if (!coincideBusqueda) return false;

      if (filtroPago === "TODOS") return true;
      if (filtroPago === "APROBADO") return p.status === "APROBADO";
      if (filtroPago === "FALLIDO") return p.status !== "APROBADO";

      return true;
    });
  }, [pagos, busqueda, filtroPago]);

  // Métricas de Pagos
  const resumenPagos = useMemo(() => {
    let totalCOP = 0;
    let aprobados = 0;
    let fallidos = 0;

    for (const p of pagos) {
      if (p.status === "APROBADO") {
        totalCOP += p.amountCop;
        aprobados++;
      } else {
        fallidos++;
      }
    }

    return { totalCOP, aprobados, fallidos, webhooksConError: webhooks.length };
  }, [pagos, webhooks]);

  return (
    <div className="space-y-6">
      
      {/* Selector Principal de Vista */}
      <Tabs value={tabActual} onValueChange={(val) => setTabActual(val as "auditoria" | "pagos")} className="w-full">
        
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pb-2">
          <TabsList className="grid grid-cols-2 max-w-md w-full">
            <TabsTrigger value="auditoria" className="text-xs font-semibold flex items-center gap-1.5">
              <ShieldCheck className="size-3.5" />
              <span>Acciones SuperAdmin ({auditLogs.length})</span>
            </TabsTrigger>
            <TabsTrigger value="pagos" className="text-xs font-semibold flex items-center gap-1.5">
              <Receipt className="size-3.5" />
              <span>Intentos de Pago ({pagos.length})</span>
            </TabsTrigger>
          </TabsList>

          {/* Buscador Integrado */}
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por usuario, negocio o ID..."
              className="pl-9 pr-8 text-xs h-9"
            />
            {busqueda && (
              <button
                type="button"
                onClick={() => setBusqueda("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        </div>

        {/* CONTENIDO PESTAÑA 1: AUDITORÍA DE SUPERADMINISTRADORES */}
        <TabsContent value="auditoria" className="space-y-4 pt-2">
          
          {/* Filtros por Tipo de Acción */}
          <div className="flex flex-wrap items-center gap-1.5 p-3 rounded-xl bg-card border border-border">
            <span className="text-xs font-medium text-muted-foreground mr-2">Filtrar Acción:</span>
            <FiltroBoton
              label="Todas"
              activo={filtroAccion === "TODAS"}
              onClick={() => setFiltroAccion("TODAS")}
            />
            <FiltroBoton
              label="Extensiones de Licencia"
              activo={filtroAccion === "EXTENDER"}
              onClick={() => setFiltroAccion("EXTENDER")}
              colorActive="bg-success text-white"
            />
            <FiltroBoton
              label="Suspensiones / Reactivaciones"
              activo={filtroAccion === "SUSPENDER"}
              onClick={() => setFiltroAccion("SUSPENDER")}
              colorActive="bg-warning text-white"
            />
            <FiltroBoton
              label="Gestión de Equipo"
              activo={filtroAccion === "EQUIPO"}
              onClick={() => setFiltroAccion("EQUIPO")}
              colorActive="bg-brand text-brand-foreground"
            />
          </div>

          {/* Listado de Logs de Auditoría */}
          {auditLogsFiltrados.length === 0 ? (
            <Card className="py-12 text-center border-dashed">
              <CardContent>
                <p className="text-muted-foreground text-sm">No se encontraron registros de auditoría.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground px-1">
                Mostrando {auditLogsFiltrados.length} registros de auditoría
              </p>

              <div className="grid grid-cols-1 gap-3">
                {auditLogsFiltrados.map((log) => (
                  <TarjetaAuditLog key={log.id} log={log} />
                ))}
              </div>
            </div>
          )}

        </TabsContent>

        {/* CONTENIDO PESTAÑA 2: ADQUISICIÓN DE LICENCIAS E INTENTOS DE PAGO */}
        <TabsContent value="pagos" className="space-y-4 pt-2">
          
          {/* Tarjetas de Resumen de Recaudo */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-3.5 space-y-1">
                <p className="text-rotulo text-muted-foreground font-medium uppercase tracking-wider">Recaudado</p>
                <p className="numeral text-xl font-bold text-success-soft">
                  {formatCop(resumenPagos.totalCOP)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3.5 space-y-1">
                <p className="text-rotulo text-muted-foreground font-medium uppercase tracking-wider">Pagos Aprobados</p>
                <p className="numeral text-xl font-bold text-foreground">
                  {resumenPagos.aprobados}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3.5 space-y-1">
                <p className="text-rotulo text-muted-foreground font-medium uppercase tracking-wider">Intentos Fallidos</p>
                <p className="numeral text-xl font-bold text-destructive-soft">
                  {resumenPagos.fallidos}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3.5 space-y-1">
                <p className="text-rotulo text-muted-foreground font-medium uppercase tracking-wider">Errores Webhook</p>
                <p className="numeral text-xl font-bold text-warning-soft">
                  {resumenPagos.webhooksConError}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Filtros de Pagos */}
          <div className="flex flex-wrap items-center gap-1.5 p-3 rounded-xl bg-card border border-border">
            <span className="text-xs font-medium text-muted-foreground mr-2">Filtrar Estado:</span>
            <FiltroBoton
              label="Todos los Intentos"
              activo={filtroPago === "TODOS"}
              onClick={() => setFiltroPago("TODOS")}
            />
            <FiltroBoton
              label="Aprobados / Licencia Otorgada"
              activo={filtroPago === "APROBADO"}
              onClick={() => setFiltroPago("APROBADO")}
              colorActive="bg-success text-white"
            />
            <FiltroBoton
              label="Rechazados / Fallidos"
              activo={filtroPago === "FALLIDO"}
              onClick={() => setFiltroPago("FALLIDO")}
              colorActive="bg-destructive text-white"
            />
          </div>

          {/* Listado de Intentos de Pago */}
          {pagosFiltrados.length === 0 ? (
            <Card className="py-12 text-center border-dashed">
              <CardContent>
                <p className="text-muted-foreground text-sm">No hay intentos de pago registrados con ese criterio.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground px-1">
                Mostrando {pagosFiltrados.length} intentos de pago
              </p>

              <div className="grid grid-cols-1 gap-3">
                {pagosFiltrados.map((pago) => (
                  <TarjetaPago key={pago.id} pago={pago} />
                ))}
              </div>
            </div>
          )}

        </TabsContent>

      </Tabs>

    </div>
  );
}

function FiltroBoton({
  label,
  activo,
  onClick,
  colorActive = "bg-brand text-brand-foreground",
}: {
  label: string;
  activo: boolean;
  onClick: () => void;
  colorActive?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
        activo
          ? `${colorActive} shadow-xs`
          : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

function TarjetaAuditLog({ log }: { log: AuditItem }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const meta = (log.metadata as Record<string, any>) ?? {};

  // Formato visual según la acción
  const esExtension = log.action === "superadmin.licencia.extender";
  const esSuspension = log.action === "superadmin.empresa.suspender";
  const esReactivacion = log.action === "superadmin.empresa.reactivar";

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-xs space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge
            variant="outline"
            className={`text-rotulo font-semibold ${
              esExtension
                ? "border-success/40 bg-success/10 text-success-soft"
                : esSuspension
                ? "border-destructive/40 bg-destructive/10 text-destructive-soft"
                : esReactivacion
                ? "border-info/40 bg-info/10 text-info-soft"
                : "border-brand/40 bg-brand/10 text-brand"
            }`}
          >
            {log.action}
          </Badge>

          {log.business && (
            <span className="flex items-center gap-1 text-xs font-bold text-foreground">
              <Store className="size-3.5 text-brand" />
              <span>{log.business.name}</span>
              <span className="font-mono text-rotulo text-muted-foreground">({log.business.slug})</span>
            </span>
          )}
        </div>

        <span className="text-xs text-muted-foreground font-mono">
          {formatDayInTimeZone(log.createdAt, "America/Bogota")}
        </span>
      </div>

      {/* Superadmin ejecutor y detalle */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <User className="size-3.5 text-brand shrink-0" />
          <span>Ejecutado por: <strong className="text-foreground">{log.user?.name ?? "SuperAdmin"}</strong> ({log.user?.email})</span>
        </div>

        {esExtension && meta.dias && (
          <div className="flex items-center gap-1.5 font-semibold text-success-soft">
            <Clock className="size-3.5 shrink-0" />
            <span>Extensión otorgada: +{meta.dias} días {meta.hasta ? `(Hasta ${formatDayInTimeZone(new Date(meta.hasta), "America/Bogota")})` : ""}</span>
          </div>
        )}
      </div>

      {/* Motivo registrado */}
      {meta.motivo && (
        <div className="p-2.5 rounded-xl bg-muted/60 border border-border/70 text-xs space-y-0.5">
          <span className="text-rotulo font-semibold text-brand-accent uppercase tracking-wider block">
            Motivo obligatorio registrado en la bitácora:
          </span>
          <p className="text-foreground italic font-medium">
            &quot;{meta.motivo}&quot;
          </p>
        </div>
      )}
    </div>
  );
}

function TarjetaPago({ pago }: { pago: PagoItem }) {
  const aprobado = pago.status === "APROBADO";

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-xs space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-sm text-foreground">{pago.business.name}</span>
            <span className="font-mono text-xs text-muted-foreground">({pago.business.slug})</span>
          </div>
          <p className="text-xs text-muted-foreground font-mono">
            {formatDayInTimeZone(pago.paidAt ?? pago.createdAt, "America/Bogota")}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="numeral text-base font-bold text-foreground">
            {formatCop(pago.amountCop)}
          </span>
          <Badge
            variant="outline"
            className={`text-xs font-semibold ${
              aprobado
                ? "border-success/40 bg-success/10 text-success-soft"
                : "border-destructive/40 bg-destructive/10 text-destructive-soft"
            }`}
          >
            {aprobado ? (
              <span className="flex items-center gap-1">
                <CheckCircle2 className="size-3" />
                Pago Exitoso / Licencia Activa
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <XCircle className="size-3" />
                Intento Fallido ({pago.status})
              </span>
            )}
          </Badge>
        </div>
      </div>

      {/* Detalles Técnicos de MercadoPago */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-muted-foreground pt-2 border-t border-border/60">
        <div>
          <span>ID Pago MP: </span>
          <strong className="font-mono text-foreground">{pago.mpPaymentId ?? "Sin ID"}</strong>
        </div>
        <div>
          <span>Detalle MP: </span>
          <strong className="font-mono text-foreground">{pago.mpStatusDetail ?? "Normal"}</strong>
        </div>
        <div>
          <span>Medio de Pago: </span>
          <strong className="font-mono text-foreground">{pago.method ?? "MercadoPago"}</strong>
        </div>
      </div>

      {/* Periodo Otorgado si se Aprobó */}
      {aprobado && pago.periodEnd && (
        <div className="p-2 rounded-lg bg-success/10 border border-success/20 text-xs text-success-soft font-medium flex items-center gap-1.5">
          <CheckCircle2 className="size-3.5 shrink-0" />
          <span>
            Licencia activada con éxito hasta el {formatDayInTimeZone(pago.periodEnd, "America/Bogota")}
          </span>
        </div>
      )}
    </div>
  );
}
