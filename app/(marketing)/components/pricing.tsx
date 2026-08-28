"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Check, Sparkles, Building2, Store, PhoneCall, ArrowRight } from "lucide-react";
import { cotizar, mensualDeLaLista, type ListaDePrecios, type Periodicidad } from "@/lib/billing/precios";
import { AvisoPromocion } from "@/features/facturacion/components/aviso-promocion";
import { formatCop } from "@/lib/money";
import { enlaceWhatsapp } from "@/lib/soporte";

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

  /**
   * Cuántos meses de regalo trae cada frecuencia, según la LISTA.
   *
   * Los badges decían "-10%" y "-20%" escritos a mano y las dos cifras eran
   * falsas: el regalo real de hoy es 1 mes y 2 meses, o sea 16,7% en los dos
   * casos. Es el mismo defecto que ya había costado que esta sección calculara
   * con `* 0.9` y `* 0.8`, y el peor de todos porque es la página que vende.
   *
   * Además se dice en meses y no en porcentaje, que es como lo cobra el sistema:
   * "2 meses gratis" se entiende sin calculadora, y un porcentaje sobre pesos
   * enteros deja centavos que hay que redondear en algún lado.
   */
  const regalo = (p: Periodicidad) =>
    cotizar({ lista, sedes: sucursales === "3+" ? 3 : sucursales, periodicidad: p }).mesesGratis;

  const etiquetaRegalo = (p: Periodicidad) => {
    const m = regalo(p);
    return m === 0 ? null : m === 1 ? "1 mes gratis" : `${m} meses gratis`;
  };

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
— Un solo precio, en pesos
          </span>
          <h2 className="font-display font-black text-4xl sm:text-6xl uppercase tracking-tight text-[var(--papel)] leading-[0.92]">
            Tarifa plana sin letras pequeñas
          </h2>
          <p className="text-muted-foreground text-base sm:text-lg leading-relaxed max-w-2xl mx-auto">
Pagás por local, no por mesero ni por mesa ni por pantalla. Probalo 7 días gratis: no te pedimos tarjeta, y si no te sirve no hacés nada.
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
1 · ¿Cuántos locales tenés?
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
                  2 · ¿Cada cuánto querés pagar?
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
                    {etiquetaRegalo("SEMESTRAL") && (
                      <span className="rounded bg-[var(--brasa)] px-1.5 py-0.5 text-rotulo font-bold text-[var(--tinta)]">
                        {etiquetaRegalo("SEMESTRAL")}
                      </span>
                    )}
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
                    <span>12 MESES</span>
                    {etiquetaRegalo("ANUAL") && (
                      <span className="rounded bg-[var(--tinta)] px-1.5 py-0.5 text-rotulo font-bold text-[var(--papel)]">
                        {etiquetaRegalo("ANUAL")}
                      </span>
                    )}
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
                    "Tarifa por local, más baja mientras más sedes",
                    "Cada sede con su caja, su carta y sus permisos",
                    "Te cargamos el menú y el inventario",
                    "Capacitamos a tu equipo",
                    "Facturación electrónica habilitada en cada sede",
                    "Te atendemos por WhatsApp, sin tiquetes",
                  ].map((item, idx) => (
                    <li key={idx} className="flex items-center gap-2">
                      <Check className="size-3.5 text-[var(--brasa)] shrink-0 stroke-[3]" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <Button asChild className="w-full bg-[var(--brasa)] text-[var(--tinta)] font-bold hover:bg-[var(--brasa-hover)] h-12 text-base">
                <a href={enlaceWhatsapp("Hola, quisiera cotizar Platlia para un grupo gastronómico de varias sucursales.")} target="_blank" rel="noopener">
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
                  <span>Se cobra:</span>
                  <span className="text-[var(--papel)] font-bold">{precio.periodoText}</span>
                </div>
                <div className="flex justify-between font-mono">
                  <span>Mesas y pedidos:</span>
                  <span className="text-[var(--papel)] font-bold">100% Ilimitadas</span>
                </div>
                <div className="flex justify-between font-mono">
                  <span>Pantallas de cocina:</span>
                  <span className="text-[var(--papel)] font-bold">Sin límite</span>
                </div>
              </div>

              <div className="space-y-3">
                <p className="font-mono text-rotulo uppercase tracking-wider text-muted-foreground">
                  Todo lo que incluye tu suscripción:
                </p>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs text-[var(--papel)]">
                  {[
                    // Acá va SOLO lo que cubre la licencia. La factura
                    // electrónica se cobra aparte, por paquetes, así que
                    // listarla como incluida sería venderla dos veces.
                    "Salón, mostrador y domicilios",
                    "Pantalla de cocina, sin límite",
                    "Carta QR con tu logo y tus colores",
                    "Imprime solo en la impresora del local",
                    "Inventario y receta por plato",
                    "Informes por día, semana, mes y año",
                    "Mesas, meseros y pantallas sin límite",
                    "Actualizaciones y soporte por WhatsApp",
                  ].map((item, idx) => (
                    <li key={idx} className="flex items-center gap-2">
                      <Check className="size-3.5 text-[var(--papel)] shrink-0 stroke-[3]" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Lo único que se cobra aparte, dicho acá y no en una nota al pie.
                  La sección se titula "sin letras pequeñas": si algo cuesta
                  extra y no está a la vista, el título es la letra pequeña.
                  Se cuenta como lo que es —una ventaja— porque lo es: la
                  competencia vende planes anuales de miles de facturas que un
                  bar no emite ni en tres años. */}
              <div className="rounded-xl border border-[var(--linea-30)] bg-[var(--panel-2)] p-4 space-y-1.5">
                <p className="font-mono text-rotulo uppercase tracking-wider text-[var(--brasa)]">
                  Aparte de la licencia
                </p>
                <p className="text-xs leading-relaxed text-[var(--papel)]">
                  <strong>Las facturas electrónicas se compran por paquete</strong>, según cuántas
                  emitas al año. Empezá con uno chico y sumá cuando se acabe: no pagás un plan anual
                  de miles de facturas que no vas a usar. Nosotros ponemos la conexión con la DIAN,
                  así que no contratás ni configurás un proveedor.
                </p>
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
