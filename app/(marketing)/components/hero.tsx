"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, ArrowRight } from "lucide-react";

const ESTADOS_DEMO = [
  { id: 1, numero: "Mesa 01", estado: "Libre", color: "bg-mesa-libre", pax: "-", total: "$0", tiempo: "-" },
  { id: 2, numero: "Mesa 02", estado: "Ocupada", color: "bg-mesa-ocupada", pax: "4 pers.", total: "$124.500", tiempo: "24 min" },
  { id: 3, numero: "Mesa 03", estado: "Cuenta pedida", color: "bg-mesa-cuenta", pax: "2 pers.", total: "$68.000", tiempo: "42 min" },
  { id: 4, numero: "Mesa 04", estado: "Reservada", color: "bg-mesa-reservada", pax: "6 pers.", total: "$0", tiempo: "20:00 h" },
] as const;

export function Hero() {
  const [mesaSeleccionada, setMesaSeleccionada] = useState(2);

  return (
    <section className="relative overflow-hidden pt-12 pb-16 lg:pt-20 lg:pb-28 bg-gradient-to-b from-background via-muted/30 to-background border-b border-border/50">
      {/* Elementos decorativos sutiles */}
      <div className="absolute top-1/4 left-1/2 -z-10 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand/5 blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 right-10 -z-10 h-72 w-72 rounded-full bg-brand-accent/5 blur-3xl pointer-events-none" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          
          {/* Columna Izquierda - Propuesta de valor */}
          <div className="lg:col-span-7 space-y-6 text-center lg:text-left">
            <Badge variant="outline" className="inline-flex items-center gap-2 border-brand-accent/40 bg-brand-accent/10 text-brand-accent px-3.5 py-1 text-xs sm:text-sm font-medium rounded-full">
              <span>SaaS Multi-tenant para Colombia 🇨🇴</span>
            </Badge>

            <div className="space-y-4">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-foreground leading-[1.1]">
                Tu restaurante o bar, <br className="hidden sm:block" />
                <span className="text-brand dark:text-[#3E9EA2]">ordenado de principio a fin</span>
              </h1>
              <p className="text-muted-foreground text-lg sm:text-xl max-w-2xl mx-auto lg:mx-0 leading-relaxed text-pretty">
                Mesas en vivo, comandas digitales a cocina, control de turnos, arqueo de caja e informes reales con horario nocturno. Todo en una sola plataforma rápida y fácil de usar.
              </p>
            </div>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 pt-2">
              <Button asChild size="lg" className="w-full sm:w-auto bg-brand text-brand-foreground hover:bg-brand/90 h-12 px-8 text-base shadow-md">
                <Link href="/registro" className="flex items-center justify-center gap-2">
                  Empezar prueba gratis 7 días
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="w-full sm:w-auto h-12 px-6 text-base">
                <a href="#precios" className="flex items-center justify-center gap-2">
                  Ver plan de $50.000 COP
                </a>
              </Button>
            </div>

            {/* Garantías clave */}
            <div className="pt-4 flex flex-wrap items-center justify-center lg:justify-start gap-x-6 gap-y-2 text-xs sm:text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
                <span>Sin tarjeta de crédito</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
                <span>Instalación inmediata en 2 minutos</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
                <span>Mesas y usuarios ilimitados</span>
              </div>
            </div>
          </div>

          {/* Columna Derecha - Demostrador de Interfaz del Salón */}
          <div className="lg:col-span-5">
            <div className="relative mx-auto max-w-md lg:max-w-none rounded-2xl border border-border bg-card shadow-2xl p-5 overflow-hidden">
              
              {/* Header de la App Simulada */}
              <div className="flex items-center justify-between pb-4 border-b border-border">
                <div className="flex items-center gap-2">
                  <span className="size-3 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="font-semibold text-sm">Salón Principal · Caja Abierta</span>
                </div>
                <Badge variant="secondary" className="text-xs font-mono">
                  Turno #14
                </Badge>
              </div>

              {/* KPI Cards rápidas */}
              <div className="grid grid-cols-3 gap-2 my-4">
                <div className="p-2.5 rounded-lg bg-muted/60 text-center">
                  <p className="text-[11px] text-muted-foreground font-medium">Ventas hoy</p>
                  <p className="numeral text-sm sm:text-base font-bold text-foreground">$1.450.000</p>
                </div>
                <div className="p-2.5 rounded-lg bg-muted/60 text-center">
                  <p className="text-[11px] text-muted-foreground font-medium">Mesas activas</p>
                  <p className="numeral text-sm sm:text-base font-bold text-brand dark:text-[#3E9EA2]">6 / 12</p>
                </div>
                <div className="p-2.5 rounded-lg bg-muted/60 text-center">
                  <p className="text-[11px] text-muted-foreground font-medium">Prom. Cocina</p>
                  <p className="numeral text-sm sm:text-base font-bold text-foreground">11 min</p>
                </div>
              </div>

              {/* Grilla de Mesas Interactivas */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground flex items-center justify-between">
                  <span>Estado de mesas en vivo (Haz clic):</span>
                  <span className="text-[11px] text-brand-accent">Interactivo</span>
                </p>
                <div className="grid grid-cols-2 gap-2.5">
                  {ESTADOS_DEMO.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMesaSeleccionada(m.id)}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        mesaSeleccionada === m.id
                          ? "border-brand ring-2 ring-brand/20 bg-accent/40 shadow-sm"
                          : "border-border hover:border-muted-foreground/30 bg-card"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-xs text-foreground">{m.numero}</span>
                        <span className={`size-2.5 rounded-full ${m.color}`} />
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1">{m.estado}</p>
                      <div className="flex items-center justify-between mt-2 pt-1 border-t border-border/50 text-[10px] text-muted-foreground">
                        <span>{m.pax}</span>
                        <span className="numeral font-bold text-foreground">{m.total}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Detalle de Mesa Seleccionada */}
              <div className="mt-4 p-3 rounded-xl bg-muted/40 border border-border text-xs space-y-2">
                <div className="flex items-center justify-between font-semibold">
                  <span>Detalle de {ESTADOS_DEMO.find((m) => m.id === mesaSeleccionada)?.numero}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {ESTADOS_DEMO.find((m) => m.id === mesaSeleccionada)?.estado}
                  </Badge>
                </div>
                {mesaSeleccionada === 2 ? (
                  <div className="space-y-1 text-muted-foreground text-[11px]">
                    <div className="flex justify-between">
                      <span>2x Hamburguesa Especial Platlia</span>
                      <span className="numeral font-medium">$56.000</span>
                    </div>
                    <div className="flex justify-between">
                      <span>4x Cerveza Artesanal Club</span>
                      <span className="numeral font-medium">$48.000</span>
                    </div>
                    <div className="flex justify-between">
                      <span>1x Papas Rústicas con Queso</span>
                      <span className="numeral font-medium">$20.500</span>
                    </div>
                    <div className="flex justify-between pt-1.5 border-t border-border font-bold text-foreground text-xs">
                      <span>Total + ICO (8%)</span>
                      <span className="numeral text-brand dark:text-[#3E9EA2]">$124.500</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-[11px]">
                    Selección en tiempo real sincronizada con la comanda de cocina y la caja registradora.
                  </p>
                )}
              </div>

            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
