"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  ArrowRight,
  Sparkles,
  LayoutGrid,
  QrCode,
  Bike,
  Receipt,
  User,
  Phone,
  MapPin,
  MessageSquare,
  Utensils,
} from "lucide-react";
import { cn } from "@/lib/utils";

const DEMO_TABS = [
  { id: "salon", label: "🪑 Salón & Mesas", icon: LayoutGrid },
  { id: "qr", label: "📱 Menú Digital QR", icon: QrCode },
  { id: "domicilios", label: "🛵 Domicilios SSE", icon: Bike },
  { id: "caja", label: "💰 Módulos de Caja", icon: Receipt },
] as const;

export function Hero() {
  const [tabActiva, setTabActiva] = useState<typeof DEMO_TABS[number]["id"]>("salon");
  const [mesaSeleccionada, setMesaSeleccionada] = useState(2);

  return (
    <section className="relative overflow-hidden pt-12 pb-16 lg:pt-20 lg:pb-28 bg-gradient-to-b from-background via-muted/30 to-background border-b border-border/50">
      {/* Elementos decorativos sutiles de marca */}
      <div className="absolute top-1/4 left-1/2 -z-10 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand/10 blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 right-10 -z-10 h-72 w-72 rounded-full bg-brand-accent/10 blur-3xl pointer-events-none" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          
          {/* Columna Izquierda - Propuesta de Valor */}
          <div className="lg:col-span-6 space-y-6 text-center lg:text-left">
            <Badge variant="outline" className="inline-flex items-center gap-2 border-brand-accent/40 bg-brand-accent/10 text-brand-accent px-4 py-1.5 text-xs sm:text-sm font-bold rounded-full shadow-sm">
              <Sparkles className="size-3.5" />
              <span>SaaS Gastro Multi-tenant para Colombia 🇨🇴</span>
            </Badge>

            <div className="space-y-4">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-foreground leading-[1.1]">
                El sistema POS y <br className="hidden sm:block" />
                <span className="bg-gradient-to-r from-brand via-[#3E9EA2] to-brand-accent bg-clip-text text-transparent dark:from-[#3E9EA2] dark:to-[#C8855F]">
                  Menú Digital QR
                </span>{" "}
                para tu negocio
              </h1>
              <p className="text-muted-foreground text-base sm:text-lg lg:text-xl max-w-2xl mx-auto lg:mx-0 leading-relaxed text-pretty font-normal">
                Salón en vivo, autopedidos por código QR en mesas o domicilios con trazabilidad en vivo (Redis SSE), comandas directas a cocina, caja dividida en cobros y cierre de turno.
              </p>
            </div>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 pt-2">
              <Button asChild size="lg" className="w-full sm:w-auto bg-brand text-brand-foreground hover:bg-brand/90 h-13 px-8 text-base shadow-xl font-bold rounded-xl">
                <Link href="/registro" className="flex items-center justify-center gap-2">
                  Probar 7 días gratis
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="w-full sm:w-auto h-13 px-6 text-base font-bold rounded-xl border-border hover:bg-accent">
                <a href="#precios" className="flex items-center justify-center gap-2">
                  Ver plan de $50.000 COP
                </a>
              </Button>
            </div>

            {/* Garantías clave */}
            <div className="pt-4 flex flex-wrap items-center justify-center lg:justify-start gap-x-6 gap-y-2 text-xs sm:text-sm text-muted-foreground font-medium">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
                <span>Sin tarjeta de crédito</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
                <span>Configuración en 2 minutos</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
                <span>Mesas, QR y usuarios ilimitados</span>
              </div>
            </div>
          </div>

          {/* Columna Derecha - Demostrador Interactivo del Producto */}
          <div className="lg:col-span-6">
            <div className="relative mx-auto max-w-lg lg:max-w-none rounded-3xl border border-border/80 bg-card/90 backdrop-blur-xl shadow-2xl p-5 overflow-hidden transition-all duration-300">
              
              {/* Selector de Pestañas Interactivas */}
              <div className="flex items-center gap-1 p-1 rounded-2xl bg-muted/60 border border-border overflow-x-auto scrollbar-none mb-5">
                {DEMO_TABS.map((tab) => {
                  const Icon = tab.icon;
                  const esActiva = tabActiva === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setTabActiva(tab.id)}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all shrink-0",
                        esActiva
                          ? "bg-brand text-white shadow-md dark:bg-brand-accent dark:text-slate-950"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/80",
                      )}
                    >
                      <Icon className="size-3.5" />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* CONTENIDO DEMO 1: SALÓN Y MESAS */}
              {tabActiva === "salon" && (
                <div className="space-y-4 animate-in fade-in duration-300">
                  <div className="flex items-center justify-between pb-3 border-b border-border text-xs">
                    <div className="flex items-center gap-2 font-bold text-foreground">
                      <span className="size-2.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span>Salón Principal · Caja Abierta</span>
                    </div>
                    <Badge variant="secondary" className="font-mono text-[11px] bg-brand/10 text-brand dark:text-brand-accent">
                      Turno #14
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { id: 1, num: "Mesa 01", estado: "Libre", color: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", total: "$0", pax: "-" },
                      { id: 2, num: "Mesa 02", estado: "Ocupada", color: "border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400", total: "$124.500", pax: "4 pers." },
                      { id: 3, num: "Mesa 03", estado: "Cuenta pedida", color: "border-blue-500/50 bg-blue-500/10 text-blue-600 dark:text-blue-400", total: "$68.000", pax: "2 pers." },
                      { id: 4, num: "Mesa 04", estado: "Reservada", color: "border-purple-500/40 bg-purple-500/10 text-purple-600 dark:text-purple-400", total: "$0", pax: "6 pers." },
                    ].map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setMesaSeleccionada(m.id)}
                        className={cn(
                          "p-3.5 rounded-2xl border text-left transition-all space-y-2",
                          m.color,
                          mesaSeleccionada === m.id && "ring-2 ring-brand scale-[1.02]",
                        )}
                      >
                        <div className="flex justify-between items-center font-bold text-xs">
                          <span>{m.num}</span>
                          <span className="text-[10px] uppercase font-extrabold">{m.estado}</span>
                        </div>
                        <div className="text-xs space-y-0.5">
                          <span className="block text-[11px] opacity-80">{m.pax}</span>
                          <span className="block font-black text-sm numeral">{m.total}</span>
                        </div>
                      </button>
                    ))}
                  </div>

                  <div className="rounded-xl border border-border/80 bg-muted/40 p-3 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground font-medium">Ventas de la jornada actual:</span>
                    <span className="font-black text-brand dark:text-brand-accent text-sm numeral">$1.840.000 COP</span>
                  </div>
                </div>
              )}

              {/* CONTENIDO DEMO 2: MENÚ DIGITAL QR */}
              {tabActiva === "qr" && (
                <div className="space-y-3 animate-in fade-in duration-300">
                  <div className="rounded-2xl p-4 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 text-white space-y-3 border border-white/10 shadow-xl">
                    <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                      <div className="flex items-center gap-2">
                        <div className="size-8 rounded-full bg-brand flex items-center justify-center font-black text-xs text-white">
                          PR
                        </div>
                        <div>
                          <h4 className="font-black text-xs">Platlia Restaurant</h4>
                          <span className="text-[10px] text-slate-400 block">Menú QR Personalizable</span>
                        </div>
                      </div>
                      <Badge className="bg-emerald-500 text-slate-950 font-bold text-[10px]">
                        🪑 Mesa 02
                      </Badge>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between items-center p-2 rounded-xl bg-white/10 border border-white/10">
                        <div>
                          <span className="font-bold block">1x Hamburguesa Gourmet</span>
                          <span className="text-[10px] text-amber-300">📝 Sin cebolla, término medio</span>
                        </div>
                        <span className="font-black text-emerald-400">$32.000</span>
                      </div>
                      <div className="flex justify-between items-center p-2 rounded-xl bg-white/10 border border-white/10">
                        <div>
                          <span className="font-bold block">2x Limonada Cerezada</span>
                        </div>
                        <span className="font-black text-emerald-400">$18.000</span>
                      </div>
                    </div>

                    <Button size="sm" className="w-full bg-emerald-600 text-white font-bold h-9 text-xs gap-1.5 shadow-md">
                      <Utensils className="size-3.5" /> Enviar Pedido a Cocina
                    </Button>
                  </div>

                  <p className="text-[11px] text-center text-muted-foreground font-medium">
                    Personalizá fondos, degradados, marcas y tarjetas QR imprimibles por mesa.
                  </p>
                </div>
              )}

              {/* CONTENIDO DEMO 3: DOMICILIOS & SSE */}
              {tabActiva === "domicilios" && (
                <div className="space-y-3 animate-in fade-in duration-300">
                  <div className="rounded-2xl border border-blue-500/40 bg-blue-500/5 p-4 space-y-3">
                    <div className="flex justify-between items-center border-b border-border/60 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-sm text-foreground">Pedido #42</span>
                        <Badge variant="outline" className="text-[10px] bg-brand/10 text-brand dark:text-brand-accent font-bold">
                          🛵 Domicilio QR
                        </Badge>
                      </div>
                      <Badge className="bg-blue-600 text-white text-[10px] font-bold">
                        En reparto
                      </Badge>
                    </div>

                    <div className="rounded-xl bg-card p-3 space-y-1.5 text-xs border border-border">
                      <div className="flex items-center gap-1.5 font-bold text-foreground">
                        <User className="size-3.5 text-brand dark:text-brand-accent shrink-0" />
                        <span>Carlos Mendoza</span>
                      </div>
                      <div className="flex items-center justify-between text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Phone className="size-3 shrink-0" />
                          <span>300 123 4567</span>
                        </div>
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold text-[11px] flex items-center gap-0.5">
                          <MessageSquare className="size-3" /> WhatsApp
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-foreground font-medium border-t border-border/40 pt-1">
                        <MapPin className="size-3 text-brand dark:text-brand-accent shrink-0" />
                        <span className="truncate">Calle 93 # 14-20, Apto 402</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-1 text-center text-[9px] font-bold">
                      <span className="p-1 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400">1. Recibido</span>
                      <span className="p-1 rounded bg-orange-500/20 text-orange-600 dark:text-orange-400">2. Cocina</span>
                      <span className="p-1 rounded bg-blue-500/20 text-blue-600 dark:text-blue-400 ring-1 ring-blue-500">3. En camino</span>
                      <span className="p-1 rounded bg-muted text-muted-foreground opacity-50">4. Entregado</span>
                    </div>
                  </div>
                </div>
              )}

              {/* CONTENIDO DEMO 4: CAJA Y CIERRE */}
              {tabActiva === "caja" && (
                <div className="space-y-3 animate-in fade-in duration-300">
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="p-3.5 rounded-2xl border border-brand/40 bg-brand/5 space-y-2">
                      <span className="font-bold text-foreground block text-xs">💳 Módulo 1: Cobro de Cuentas</span>
                      <p className="text-[11px] text-muted-foreground leading-tight">
                        Cobro de salón, propinas (10%), ICO (8%) y facturación POS instantánea.
                      </p>
                      <Button size="sm" className="w-full h-8 text-[11px] bg-brand text-white font-bold">
                        Cobrar Pedidos
                      </Button>
                    </div>

                    <div className="p-3.5 rounded-2xl border border-brand-accent/40 bg-brand-accent/5 space-y-2">
                      <span className="font-bold text-foreground block text-xs">📊 Módulo 2: Movimientos & Cierre</span>
                      <p className="text-[11px] text-muted-foreground leading-tight">
                        Entradas, egresos, retiros de dinero y arqueo de caja con reporte PDF.
                      </p>
                      <Button size="sm" variant="outline" className="w-full h-8 text-[11px] font-bold">
                        Movimientos de Caja
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border/80 bg-muted/40 p-2.5 text-center text-xs">
                    <span className="text-muted-foreground">Arqueo de caja automático al cierre de turno.</span>
                  </div>
                </div>
              )}

            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
