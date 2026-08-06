"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Sparkles, ShieldCheck, CreditCard, Building2, HelpCircle, Store, PhoneCall, ArrowRight } from "lucide-react";

export function Pricing() {
  const [sucursales, setSucursales] = useState<1 | 2 | "3+">(1);
  const [frecuencia, setFrecuencia] = useState<"mensual" | "6meses" | "12meses">("12meses");

  // Matriz de Precios
  // 1 sucursal: $50.000/mes base
  // 2 sucursales: $80.000/mes base ($40.000/sucursal)
  // 3+ sucursales: Plan Personalizado (Contactar Asesor)
  const calcularPrecio = () => {
    if (sucursales === "3+") {
      return null;
    }
    const baseMensual = sucursales === 1 ? 50000 : 80000;
    if (frecuencia === "mensual") {
      return {
        mensualEquiv: baseMensual,
        cobroTotal: baseMensual,
        ahorroText: "Facturación mensual flexible",
        periodoText: "al mes",
      };
    } else if (frecuencia === "6meses") {
      const mensualConDesc = baseMensual * 0.9;
      const total6Meses = mensualConDesc * 6;
      const ahorroTotal = baseMensual * 6 - total6Meses;
      return {
        mensualEquiv: Math.round(mensualConDesc),
        cobroTotal: Math.round(total6Meses),
        ahorroText: `Ahorras $${ahorroTotal.toLocaleString("es-CO")} COP (10% desc)`,
        periodoText: `cobrado cada 6 meses ($${Math.round(total6Meses).toLocaleString("es-CO")} COP)`,
      };
    } else {
      // 12 meses (20% desc)
      const mensualConDesc = baseMensual * 0.8;
      const total12Meses = mensualConDesc * 12;
      const ahorroTotal = baseMensual * 12 - total12Meses;
      return {
        mensualEquiv: Math.round(mensualConDesc),
        cobroTotal: Math.round(total12Meses),
        ahorroText: `¡Ahorras $${ahorroTotal.toLocaleString("es-CO")} COP! (2 meses gratis)`,
        periodoText: `cobrado al año ($${Math.round(total12Meses).toLocaleString("es-CO")} COP)`,
      };
    }
  };

  const precio = calcularPrecio();

  return (
    <section id="precios" className="py-20 bg-muted/30 border-y border-border relative">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        
        {/* Encabezado */}
        <div className="text-center max-w-3xl mx-auto space-y-4 mb-12">
          <Badge variant="outline" className="border-brand-accent/40 bg-brand-accent/10 text-brand-accent px-3 py-1 text-xs sm:text-sm font-medium">
            Precios Claros y Transparentes
          </Badge>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
            Elige el plan ideal para tus sucursales
          </h2>
          <p className="text-muted-foreground text-lg leading-relaxed text-pretty">
            Tarifa plana sin límite de mesas, meseros ni comandas. Disfruta de 7 días de prueba totalmente gratis.
          </p>

          {/* Selectores de Sucursales y Frecuencia */}
          <div className="pt-6 flex flex-col items-center gap-5">
            
            {/* Selector de Sucursales */}
            <div className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">
                1. Selecciona el número de sucursales:
              </span>
              <div className="inline-flex flex-wrap justify-center items-center p-1 rounded-2xl bg-card border border-border shadow-sm gap-1">
                <button
                  type="button"
                  onClick={() => setSucursales(1)}
                  className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all flex items-center gap-2 ${
                    sucursales === 1
                      ? "bg-brand text-brand-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Store className="size-4" />
                  <span>1 Sucursal ($50k/mes)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSucursales(2)}
                  className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all flex items-center gap-2 ${
                    sucursales === 2
                      ? "bg-brand text-brand-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Store className="size-4" />
                  <span>2 Sucursales ($80k/mes)</span>
                  <span className="bg-brand-accent text-brand-accent-foreground text-[10px] font-bold px-2 py-0.5 rounded-full">
                    Ahorras $20k/mes
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setSucursales("3+")}
                  className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all flex items-center gap-2 ${
                    sucursales === "3+"
                      ? "bg-brand text-brand-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Building2 className="size-4" />
                  <span>3+ Sucursales (Plan Cadena)</span>
                  <span className="bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                    Cotización Especial
                  </span>
                </button>
              </div>
            </div>

            {/* Selector de Frecuencia (Solo si no es 3+) */}
            {sucursales !== "3+" && (
              <div className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">
                  2. Selecciona la frecuencia de pago:
                </span>
                <div className="inline-flex flex-wrap justify-center items-center p-1 rounded-2xl bg-card border border-border shadow-sm gap-1">
                  <button
                    type="button"
                    onClick={() => setFrecuencia("mensual")}
                    className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all ${
                      frecuencia === "mensual"
                        ? "bg-muted text-foreground font-semibold shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Mensual
                  </button>
                  <button
                    type="button"
                    onClick={() => setFrecuencia("6meses")}
                    className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all flex items-center gap-1.5 ${
                      frecuencia === "6meses"
                        ? "bg-brand text-brand-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <span>6 Meses</span>
                    <span className="bg-emerald-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md">
                      -10%
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFrecuencia("12meses")}
                    className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all flex items-center gap-1.5 ${
                      frecuencia === "12meses"
                        ? "bg-brand text-brand-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <span>12 Meses (Anual)</span>
                    <span className="bg-brand-accent text-brand-accent-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-md">
                      -20% (2 meses gratis)
                    </span>
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>

        {/* Tarjeta Principal de Precio */}
        <div className="max-w-xl mx-auto rounded-3xl border-2 border-brand/40 bg-card p-8 sm:p-10 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 bg-brand text-brand-foreground font-semibold text-xs px-4 py-1.5 rounded-bl-xl shadow-sm flex items-center gap-1">
            <Sparkles className="size-3.5" />
            <span>
              {sucursales === 1 ? "1 Sucursal" : sucursales === 2 ? "2 Sucursales" : "3+ Sucursales"}
            </span>
          </div>

          {sucursales === "3+" ? (
            /* Vista para 3 o más sucursales */
            <div className="space-y-6">
              <div>
                <h3 className="text-2xl font-bold text-foreground">
                  Plan Empresarial para Cadenas Gastronómicas
                </h3>
                <p className="text-muted-foreground text-sm mt-1">
                  Para grupos gastronómicos, franquicias y marcas con 3 o más locales.
                </p>
              </div>

              <div className="py-6 border-y border-border/60 space-y-2">
                <div className="text-3xl sm:text-4xl font-bold text-brand dark:text-[#3E9EA2]">
                  Cotización Personalizada
                </div>
                <p className="text-xs text-muted-foreground">
                  Ofrecemos tarifas preferenciales por volumen, consolidación multi-negocio y acompañamiento en la carga inicial de menús e insumos.
                </p>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Beneficios del Plan Empresarial (3+ locales):
                </p>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-foreground">
                  {[
                    "Sucursales y marcas ilimitadas",
                    "Descuentos progresivos por volumen",
                    "Consola matriz con reportes consolidados",
                    "Capacitación guiada para el personal",
                    "Migración e importación de catálogo",
                    "Gerente de cuenta y soporte 24/7",
                  ].map((item, idx) => (
                    <li key={idx} className="flex items-center gap-2 text-xs sm:text-sm">
                      <Check className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="pt-4 space-y-3">
                <Button asChild size="lg" className="w-full bg-brand text-brand-foreground hover:bg-brand/90 text-base font-semibold h-13 shadow-md">
                  <a href="#contacto" className="flex items-center justify-center gap-2">
                    <PhoneCall className="size-4" />
                    Contactar para definir precio
                    <ArrowRight className="size-4" />
                  </a>
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  Respuesta comercial garantizada en menos de 2 horas hábiles.
                </p>
              </div>
            </div>
          ) : (
            /* Vista para 1 o 2 sucursales */
            <div className="space-y-6">
              <div>
                <h3 className="text-2xl font-bold text-foreground">
                  Licencia Platlia {sucursales === 1 ? "Individual" : "Doble Sucursal"}
                </h3>
                <p className="text-muted-foreground text-sm mt-1">
                  {sucursales === 1
                    ? "Incluye 1 restaurante o bar con todos los módulos."
                    : "Incluye 2 restaurantes o bares en el mismo grupo con consola unificada."}
                </p>
              </div>

              {/* Cifra de precio calculada */}
              {precio && (
                <div className="py-4 border-y border-border/60 flex items-baseline gap-2">
                  <span className="text-muted-foreground text-2xl font-medium">$</span>
                  <div className="flex flex-col">
                    <div className="flex items-baseline gap-2">
                      <span className="numeral text-5xl sm:text-6xl font-bold tracking-tight text-foreground">
                        {precio.mensualEquiv.toLocaleString("es-CO")}
                      </span>
                      <span className="text-muted-foreground text-sm font-medium">
                        COP / mes equivalente
                      </span>
                    </div>
                    <span className="text-xs text-brand-accent font-semibold mt-1">
                      {precio.periodoText} · {precio.ahorroText}
                    </span>
                  </div>
                </div>
              )}

              <div className="p-3.5 rounded-xl bg-brand/10 border border-brand/20 text-brand dark:text-[#3E9EA2] text-xs font-medium flex items-center gap-2">
                <ShieldCheck className="size-4 shrink-0" />
                <span>Prueba gratis durante 7 días sin tarjeta de crédito ni compromisos.</span>
              </div>

              {/* Lista de características incluidas */}
              <div className="space-y-3 pt-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Características incluidas en la licencia:
                </p>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-foreground">
                  {[
                    `${sucursales} ${sucursales === 1 ? "Sucursal completa incluida" : "Sucursales incluidas"}`,
                    "📱 Menú Digital QR con autopedido (Colores, Logos, Cloudinary)",
                    "🛵 Domicilios con trazabilidad Redis SSE y WhatsApp",
                    "💰 Caja Dividida en 2 módulos (Cobros + Movimientos & Cierre)",
                    "👨‍🍳 Comandas KDS a cocina con notas e integración Turnero TV",
                    "📊 Inventario automático por costo de recetas",
                    "🪑 Mesas, salones y usuarios ilimitados",
                    "🖨️ Impresión de tiquetes térmicos y tarjetas QR",
                    "🌙 Informes por jornada nocturna (corte 5:00 a.m.)",
                    "🇨🇴 Soporte técnico preferencial en Colombia",
                  ].map((item, idx) => (
                    <li key={idx} className="flex items-center gap-2 text-xs sm:text-sm font-medium">
                      <Check className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Botón CTA */}
              <div className="pt-4 space-y-3">
                <Button asChild size="lg" className="w-full bg-brand text-brand-foreground hover:bg-brand/90 text-base font-semibold h-13 shadow-md">
                  <Link href="/registro">
                    Comenzar prueba gratis de 7 días
                  </Link>
                </Button>
                <p className="text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                  <CreditCard className="size-3.5" />
                  <span>Cobro seguro administrado con MercadoPago</span>
                </p>
              </div>

            </div>
          )}
        </div>

        {/* FAQ rápido */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          <div className="p-5 rounded-xl border border-border bg-card">
            <h4 className="font-semibold text-sm text-foreground flex items-center gap-2 mb-2">
              <HelpCircle className="size-4 text-brand" />
              ¿Cómo funciona el descuento de 6 y 12 meses?
            </h4>
            <p className="text-xs text-muted-foreground">
              Al contratar 6 meses obtienes un 10% de descuento. Al contratar 12 meses ahorras el 20%, equivalente a 2 meses totalmente gratis.
            </p>
          </div>
          <div className="p-5 rounded-xl border border-border bg-card">
            <h4 className="font-semibold text-sm text-foreground flex items-center gap-2 mb-2">
              <Building2 className="size-4 text-brand" />
              ¿Qué ocurre si tengo 3 o más sucursales?
            </h4>
            <p className="text-xs text-muted-foreground">
              Para cadenas y grupos gastronómicos de 3 o más locales diseñamos un plan personalizado con tarifa por volumen y soporte dedicado.
            </p>
          </div>
          <div className="p-5 rounded-xl border border-border bg-card">
            <h4 className="font-semibold text-sm text-foreground flex items-center gap-2 mb-2">
              <CreditCard className="size-4 text-brand" />
              ¿Qué medios de pago aceptan?
            </h4>
            <p className="text-xs text-muted-foreground">
              Tarjetas de crédito/débito, PSE, Nequi, Daviplata y puntos de efectivo en Colombia con factura electrónica enviada a tu correo.
            </p>
          </div>
        </div>

      </div>
    </section>
  );
}
