"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Check, Sparkles, Building2, Store, PhoneCall, ArrowRight } from "lucide-react";
import { cotizar, mensualDeLaLista, type ListaDePrecios, type Periodicidad } from "@/lib/billing/precios";
import { AvisoPromocion } from "@/features/facturacion/components/aviso-promocion";
import { formatCop } from "@/lib/money";

/**
 * La calculadora de precios de la portada.
 *
 * Los números NO se calculan acá: llegan de la misma lista con la que se cobra.
 * Antes esta pantalla tenía su propia matriz —`* 0.9` y `* 0.8`— que no coincidía
 * con nada del backend y que además se contradecía sola: cobraba 20% de descuento
 * al año y el texto decía "(2 meses gratis)", que es otro número. Prometer un
 * precio distinto del que se cobra es la peor clase de bug.
 */
export function Pricing({
  lista,
  base,
  promo,
}: {
  lista: ListaDePrecios;
  /** La lista de siempre, para poder decir de cuánto bajó una promoción. */
  base: ListaDePrecios;
  /** La promoción vigente, si hay alguna. */
  promo: ListaDePrecios | null;
}) {
  const [sucursales, setSucursales] = useState<1 | 2 | "3+">(1);
  const [frecuencia, setFrecuencia] = useState<"mensual" | "6meses" | "12meses">("12meses");

  /** En miles, que es como se lee un precio de un vistazo en un botón. */
  const enMiles = (sedes: number) => `$${Math.round(mensualDeLaLista(lista, sedes) / 1000)}k`;

  const calcularPrecio = () => {
    if (sucursales === "3+") return null;

    const periodicidad: Periodicidad =
      frecuencia === "mensual" ? "MENSUAL" : frecuencia === "6meses" ? "SEMESTRAL" : "ANUAL";
    const c = cotizar({ lista, sedes: sucursales, periodicidad });

    const meses = c.mesesGratis === 1 ? "1 mes gratis" : `${c.mesesGratis} meses gratis`;

    return {
      mensualEquiv: c.mensualEquivalenteCop,
      cobroTotal: c.totalCop,
      ahorroText:
        c.ahorroCop > 0
          ? `Ahorrás ${formatCop(c.ahorroCop)} COP · ${meses}`
          : "Facturación mensual flexible",
      periodoText:
        periodicidad === "MENSUAL"
          ? "al mes"
          : `cobrado cada ${c.mesesOtorgados} meses (${formatCop(c.totalCop)} COP)`,
    };
  };

  const precio = calcularPrecio();

  return (
    <section id="precios" className="py-24 bg-[var(--tinta)] border-t border-dashed border-[var(--linea-30)] relative">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        
        {/* Encabezado */}
        <div className="text-center max-w-3xl mx-auto space-y-4 mb-16">
          <span className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">
            — Tarifas en Pesos Colombianos (COP)
          </span>
          <h2 className="font-display font-black text-4xl sm:text-6xl uppercase tracking-tight text-[var(--papel)] leading-[0.92]">
            Tarifa plana sin letras pequeñas
          </h2>
          <p className="text-muted-foreground text-base sm:text-lg leading-relaxed max-w-2xl mx-auto">
            Sin límite de mesas, meseros, comandas ni pantallas conectadas. 7 días de prueba gratis sin ingresar tarjeta de crédito.
          </p>

          {promo && (
            <div className="mx-auto max-w-xl pt-2 text-left">
              <AvisoPromocion
                promo={promo}
                base={base}
                sedes={sucursales === "3+" ? 3 : sucursales}
                timeZone="America/Bogota"
              />
            </div>
          )}

          {/* Selectores de Sucursales y Frecuencia */}
          <div className="pt-6 flex flex-col items-center gap-5">
            
            {/* Selector de Sucursales */}
            <div className="space-y-2">
              <span className="font-mono text-rotulo uppercase tracking-wider text-muted-foreground block">
                1. SELECCIONA EL NÚMERO DE SUCURSALES:
              </span>
              <div className="inline-flex flex-wrap justify-center items-center p-1 rounded-xl bg-[var(--panel-2)] border border-[var(--linea-30)] gap-1">
                <button
                  type="button"
                  onClick={() => setSucursales(1)}
                  className={`px-4 py-2 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-2 ${
                    sucursales === 1
                      ? "bg-[var(--papel)] text-[var(--tinta)] shadow-sm"
                      : "text-muted-foreground hover:text-[var(--papel)]"
                  }`}
                >
                  <Store className="size-3.5" />
                  <span>1 SUCURSAL ({enMiles(1)}/mes)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSucursales(2)}
                  className={`px-4 py-2 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-2 ${
                    sucursales === 2
                      ? "bg-[var(--papel)] text-[var(--tinta)] shadow-sm"
                      : "text-muted-foreground hover:text-[var(--papel)]"
                  }`}
                >
                  <Store className="size-3.5" />
                  <span>2 SUCURSALES ({enMiles(2)}/mes)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSucursales("3+")}
                  className={`px-4 py-2 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-2 ${
                    sucursales === "3+"
                      ? "bg-[var(--papel)] text-[var(--tinta)] shadow-sm"
                      : "text-muted-foreground hover:text-[var(--papel)]"
                  }`}
                >
                  <Building2 className="size-3.5" />
                  <span>3+ SUCURSALES (CADENAS)</span>
                </button>
              </div>
            </div>

            {/* Selector de Frecuencia (Solo si no es 3+) */}
            {sucursales !== "3+" && (
              <div className="space-y-2">
                <span className="font-mono text-rotulo uppercase tracking-wider text-muted-foreground block">
                  2. SELECCIONA LA FRECUENCIA DE PAGO:
                </span>
                <div className="inline-flex flex-wrap justify-center items-center p-1 rounded-xl bg-[var(--panel-2)] border border-[var(--linea-30)] gap-1">
                  <button
                    type="button"
                    onClick={() => setFrecuencia("mensual")}
                    className={`px-4 py-2 rounded-lg text-xs font-mono font-bold transition-all ${
                      frecuencia === "mensual"
                        ? "bg-[var(--papel)] text-[var(--tinta)] shadow-xs"
                        : "text-muted-foreground hover:text-[var(--papel)]"
                    }`}
                  >
                    MENSUAL
                  </button>
                  <button
                    type="button"
                    onClick={() => setFrecuencia("6meses")}
                    className={`px-4 py-2 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 ${
                      frecuencia === "6meses"
                        ? "bg-[var(--papel)] text-[var(--tinta)] shadow-xs"
                        : "text-muted-foreground hover:text-[var(--papel)]"
                    }`}
                  >
                    <span>6 MESES</span>
                    <span className="bg-[var(--brasa)] text-[var(--tinta)] text-rotulo font-bold px-1.5 py-0.5 rounded">
                      -10%
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFrecuencia("12meses")}
                    className={`px-4 py-2 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 ${
                      frecuencia === "12meses"
                        ? "bg-[var(--brasa)] text-[var(--tinta)] shadow-xs"
                        : "text-muted-foreground hover:text-[var(--papel)]"
                    }`}
                  >
                    <span>12 MESES (ANUAL)</span>
                    <span className="bg-[var(--tinta)] text-[var(--papel)] text-rotulo font-bold px-1.5 py-0.5 rounded">
                      -20%
                    </span>
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>

        {/* Tarjeta Principal de Precio */}
        <div className="max-w-xl mx-auto rounded-2xl border border-[var(--brasa)]/60 bg-[var(--panel-bg)] p-8 sm:p-10 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 bg-[var(--brasa)] text-[var(--tinta)] font-bold text-xs font-mono px-4 py-1.5 rounded-bl-xl flex items-center gap-1">
            <Sparkles className="size-3.5" />
            <span>
              {sucursales === 1 ? "1 SUCURSAL" : sucursales === 2 ? "2 SUCURSALES" : "3+ SUCURSALES"}
            </span>
          </div>

          {sucursales === "3+" ? (
            /* Vista para 3 o más sucursales */
            <div className="space-y-6">
              <div>
                <h3 className="font-display font-black text-3xl uppercase text-[var(--papel)]">
                  Plan Cadenas & Franquicias
                </h3>
                <p className="text-muted-foreground text-sm mt-1">
                  Para grupos gastronómicos y marcas con 3 o más locales.
                </p>
              </div>

              <div className="py-6 border-y border-dashed border-[var(--linea-30)] space-y-2">
                <div className="font-display font-black text-4xl text-[var(--brasa)]">
                  Cotización Especial
                </div>
                <p className="text-xs text-muted-foreground">
                  Ofrecemos tarifas preferenciales por volumen, consolidación multi-negocio y acompañamiento en la carga inicial.
                </p>
              </div>

              <div className="space-y-3">
                <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                  Beneficios del Plan Empresarial:
                </p>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-[var(--papel)]">
                  {[
                    "Sucursales y marcas ilimitadas",
                    "Descuentos progresivos por volumen",
                    "Consola matriz de informes consolidados",
                    "Capacitación guiada para el personal",
                    "Migración de menú e inventario",
                    "Soporte prioritario 1 a 1 por WhatsApp",
                  ].map((item, idx) => (
                    <li key={idx} className="flex items-center gap-2">
                      <Check className="size-3.5 text-[var(--brasa)] shrink-0 stroke-[3]" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <Button asChild className="w-full bg-[var(--brasa)] text-[var(--tinta)] font-bold hover:bg-[var(--brasa-hover)] h-12 text-base">
                <a href="https://wa.me/573105742111?text=Hola%2C%20quisiera%20cotizar%20Platlia%20para%20un%20grupo%20gastron%C3%B3mico%20de%20varias%20sucursales" target="_blank" rel="noopener">
                  <PhoneCall className="size-4 mr-2" />
                  Hablar con un Asesor por WhatsApp
                </a>
              </Button>
            </div>
          ) : precio ? (
            /* Vista para 1 o 2 sucursales con calculadora */
            <div className="space-y-6">
              <div>
                <span className="font-mono text-rotulo uppercase tracking-widest text-muted-foreground">
                  PLAN PROFESIONAL ILIMITADO
                </span>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="font-display font-black text-5xl sm:text-6xl text-[var(--papel)] leading-none tracking-tight">
                    ${precio.mensualEquiv.toLocaleString("es-CO")}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground uppercase">
                    COP / MES
                  </span>
                </div>
                <p className="font-mono text-xs text-[var(--brasa)] font-bold mt-2">
                  {precio.ahorroText}
                </p>
              </div>

              <div className="py-4 border-y border-dashed border-[var(--linea-30)] space-y-2 text-xs text-muted-foreground">
                <div className="flex justify-between font-mono">
                  <span>Facturación:</span>
                  <span className="text-[var(--papel)] font-bold">{precio.periodoText}</span>
                </div>
                <div className="flex justify-between font-mono">
                  <span>Mesas y comandas:</span>
                  <span className="text-[var(--papel)] font-bold">100% Ilimitadas</span>
                </div>
                <div className="flex justify-between font-mono">
                  <span>Pantallas KDS conectadas:</span>
                  <span className="text-[var(--papel)] font-bold">Sin límite</span>
                </div>
              </div>

              <div className="space-y-3">
                <p className="font-mono text-rotulo uppercase tracking-wider text-muted-foreground">
                  Todo lo que incluye tu suscripción:
                </p>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs text-[var(--papel)]">
                  {[
                    "Plano de mesas en vivo",
                    "POS mostrador táctil ultra-rápido",
                    "Pantallas de cocina KDS ilimitadas",
                    "Menú QR autopedidos personalizable",
                    "Trazabilidad de domicilios y SSE",
                    "Caja arqueo ciego y tirilla 55/80mm",
                    "Recetas y descuento de stock",
                    "Turnero TV para entrega de órdenes",
                  ].map((item, idx) => (
                    <li key={idx} className="flex items-center gap-2">
                      <Check className="size-3.5 text-[var(--papel)] shrink-0 stroke-[3]" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <Button asChild className="w-full bg-[var(--brasa)] text-[var(--tinta)] font-bold hover:bg-[var(--brasa-hover)] h-12 text-base">
                <Link href="/registro" className="flex items-center justify-center gap-2">
                  <span>Empezar 7 días gratis</span>
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
          ) : null}

          <div className="pt-4 text-center font-mono text-rotulo text-[var(--linea-55)] tracking-wider">
            SIN CONTRATO DE PERMANENCIA · CANCELA CUANDO QUIERAS
          </div>
        </div>

      </div>
    </section>
  );
}
