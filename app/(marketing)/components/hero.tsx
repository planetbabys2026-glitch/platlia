"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, Clock, CheckCircle2, Flame, Zap, Sparkles } from "lucide-react";

interface OrderDemo {
  id: string;
  origen: string;
  pago: string;
  items: [number, string, number, string, string][]; // [qty, name, price, area, notes]
  subtotal: number;
  ico: number;
  total: number;
}

const ORDERS: OrderDemo[] = [
  {
    id: "0214",
    origen: "MESA 04 · SALÓN",
    pago: "TARJETA",
    items: [
      [2, "Burger Especial Ahumada", 56000, "COCINA", "Término 3/4, sin cebolla"],
      [1, "Papas Rústicas con Queso", 18000, "COCINA", "Salsa tártara aparte"],
      [2, "Cerveza Artesanal IPA", 24000, "BARRA", "Bien frías"],
    ],
    subtotal: 90740,
    ico: 7260,
    total: 98000,
  },
  {
    id: "0215",
    origen: "QR · TERRAZA MESA 07",
    pago: "NEQUI",
    items: [
      [1, "Salchipapas Quesudas XL", 26000, "COCINA", "Con tocineta crocante"],
      [2, "Limonada de Coco Frappé", 22000, "BARRA", "Poco dulce"],
      [1, "Alitas BBQ x12", 34000, "COCINA", "Salsa picante aparte"],
    ],
    subtotal: 75926,
    ico: 6074,
    total: 82000,
  },
  {
    id: "0216",
    origen: "DOMICILIO · WHATSAPP",
    pago: "DAVIPLATA",
    items: [
      [2, "Costillas BBQ Ahumadas", 68000, "COCINA", "Extra salsa"],
      [1, "Porción de Yuca Frita", 12000, "COCINA", "Con suero costeño"],
      [1, "Gaseosa 1.5L Manzana", 7000, "BARRA", "Empacada"],
    ],
    subtotal: 80556,
    ico: 6444,
    total: 87000,
  },
];

export function Hero() {
  const [orderIndex, setOrderIndex] = useState(0);
  const [visibleItemsCount, setVisibleItemsCount] = useState(0);
  const [ticketStamped, setTicketStamped] = useState(false);
  const [stampTimeText, setStampTimeText] = useState("EN COCINA");
  const [chronoText, setChronoText] = useState("00:00.0");
  const [ticketFadeOut, setTicketFadeOut] = useState(false);

  // Animación interactiva en vivo del ticket térmico
  useEffect(() => {
    let timer: NodeJS.Timeout;
    let chronoInterval: NodeJS.Timeout;
    let startTime = Date.now();

    const currentOrder = ORDERS[orderIndex];
    setVisibleItemsCount(0);
    setTicketStamped(false);
    setTicketFadeOut(false);
    setStampTimeText("EN COCINA");

    // Cronómetro en milisegundos
    chronoInterval = setInterval(() => {
      const d = Date.now() - startTime;
      const mm = String(Math.floor(d / 60000)).padStart(2, "0");
      const ss = String(Math.floor((d % 60000) / 1000)).padStart(2, "0");
      const ms = Math.floor((d % 1000) / 100);
      setChronoText(`${mm}:${ss}.${ms}`);
    }, 100);

    // Impresión progresiva renglón por renglón
    let count = 0;
    const itemInterval = setInterval(() => {
      count++;
      setVisibleItemsCount(count);
      if (count >= currentOrder.items.length) {
        clearInterval(itemInterval);

        // Estampado de despacho con sello
        timer = setTimeout(() => {
          clearInterval(chronoInterval);
          const elapsed = Date.now() - startTime;
          const mm = String(Math.floor(elapsed / 60000)).padStart(2, "0");
          const ss = String(Math.floor((elapsed % 60000) / 1000)).padStart(2, "0");
          setStampTimeText(`LISTO · ${mm}:${ss}`);
          setTicketStamped(true);

          // Transición al siguiente pedido
          setTimeout(() => {
            setTicketFadeOut(true);
            setTimeout(() => {
              setOrderIndex((prev) => (prev + 1) % ORDERS.length);
            }, 400);
          }, 3500);
        }, 1200);
      }
    }, 450);

    return () => {
      clearInterval(chronoInterval);
      clearInterval(itemInterval);
      clearTimeout(timer);
    };
  }, [orderIndex]);

  const currentOrder = ORDERS[orderIndex];

  return (
    <section className="relative overflow-hidden pt-12 pb-16 lg:pt-20 lg:pb-28 bg-[radial-gradient(720px_460px_at_50%_0%,color-mix(in_oklch,var(--brasa)_8%,transparent),transparent_70%)] border-b border-dashed border-[var(--linea-30)]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          
          {/* Columna Izquierda - Propuesta de Valor */}
          <div className="lg:col-span-6 space-y-6 text-center lg:text-left rise">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-[var(--linea-30)] bg-[var(--panel-2)] text-xs font-mono tracking-widest text-[var(--brasa)] font-bold uppercase shadow-sm">
              <Zap className="size-3.5" />
              <span>OPTIMIZACIÓN REAL DEL SERVICIO · COLOMBIA 🇨🇴</span>
            </div>

            <div className="space-y-4">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black font-display tracking-tight text-[var(--papel)] uppercase leading-[0.95]">
                Cada segundo cuenta: <br />
                <span className="text-[var(--brasa)]">Felicidad para tu cliente, rentabilidad para tu negocio</span>
              </h1>
              <p className="text-[var(--linea)] text-base sm:text-lg lg:text-xl max-w-2xl mx-auto lg:mx-0 leading-relaxed font-normal">
                Para nosotros, cada segundo que logramos optimizar en la toma de pedidos, el despacho en cocina y el cobro de cuentas se traduce en dos cosas: <strong>comensales felices que regresan</strong> y una <strong>mayor rotación de mesas</strong> para tu restaurante.
              </p>
            </div>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 pt-2">
              <Button asChild size="lg" className="w-full sm:w-auto bg-[var(--brasa)] text-[var(--tinta)] hover:bg-[var(--brasa-hover)] h-13 px-8 text-base font-bold shadow-lg shadow-[var(--brasa)]/20 transition-all hover:scale-[1.02] active:scale-[0.98]">
                <Link href="/registro" className="flex items-center justify-center gap-2">
                  Probar 7 días gratis
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="w-full sm:w-auto h-13 px-6 text-base font-bold border-[var(--linea-30)] text-[var(--papel)] hover:bg-[var(--panel-2)] transition-all hover:scale-[1.02]">
                <a href="#precios" className="flex items-center justify-center gap-2">
                  Ver plan de $50.000 COP
                </a>
              </Button>
            </div>

            {/* Garantías y badges */}
            <div className="pt-4 flex flex-wrap items-center justify-center lg:justify-start gap-x-6 gap-y-2 text-xs sm:text-sm text-[var(--linea)] font-medium">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-[var(--brasa)]" />
                <span>Menos tiempo de espera por mesa</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-[var(--brasa)]" />
                <span>Mayor rotación en horas pico</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-[var(--brasa)]" />
                <span>Cierre de caja en 60 segundos</span>
              </div>
            </div>
          </div>

          {/* Columna Derecha - Simulación de Comanda Térmica en Vivo Animada */}
          <div className="lg:col-span-6 flex justify-center">
            <div
              className={`w-full max-w-md bg-[var(--panel-bg)] border border-[var(--linea-16)] rounded-2xl p-6 shadow-2xl relative overflow-hidden transition-all duration-300 ${
                ticketFadeOut ? "opacity-30 scale-95" : "opacity-100 scale-100"
              }`}
            >
              {/* Sello animado de despacho (stamp-in) */}
              {ticketStamped && (
                <div className="absolute top-10 right-6 z-20 pointer-events-none animate-stamp-in">
                  <div className="border-4 border-[var(--brasa)] bg-[var(--tinta)]/95 text-[var(--brasa)] font-display font-black text-xl px-4 py-1.5 rounded-xl uppercase tracking-wider shadow-2xl rotate-[-7deg] flex items-center gap-2">
                    <Flame className="size-5 animate-pulse" />
                    {stampTimeText}
                  </div>
                </div>
              )}

              {/* Encabezado del Ticket */}
              <div className="flex items-center justify-between border-b border-dashed border-[var(--linea-30)] pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full bg-[var(--brasa)] animate-pulse" />
                  <span className="font-mono text-xs font-bold tracking-wider uppercase text-[var(--papel)]">
                    PLATLIA EN VIVO
                  </span>
                </div>
                <span className="font-mono text-[11px] text-[var(--linea)]">
                  COMANDA #{currentOrder.id} · {currentOrder.origen}
                </span>
              </div>

              {/* Cronómetro en vivo */}
              <div className="flex items-center justify-between bg-[var(--panel-2)] rounded-lg px-3.5 py-2 mb-4 border border-[var(--linea-16)]">
                <span className="font-mono text-xs text-[var(--linea)] flex items-center gap-1.5">
                  <Clock className="size-3.5 text-[var(--brasa)]" /> TIEMPO EN FUEGO:
                </span>
                <span className="font-mono font-bold text-sm text-[var(--brasa)] tracking-wider">
                  {chronoText}
                </span>
              </div>

              {/* Lista de Platos en Vivo (Impresión renglón por renglón con animate-card-in) */}
              <div className="space-y-3 font-mono text-xs border-b border-dashed border-[var(--linea-30)] pb-4 mb-4 min-h-[140px]">
                {currentOrder.items.slice(0, visibleItemsCount).map(([qty, name, price, area, notes], idx) => (
                  <div key={idx} className="flex justify-between items-start animate-card-in">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[var(--papel)]">
                          {qty}x {name}
                        </span>
                        <span className="text-[9.5px] px-1.5 py-0.2 rounded bg-[var(--panel-3)] text-[var(--linea)] font-bold">
                          {area}
                        </span>
                      </div>
                      {notes && <p className="text-[11px] text-[var(--linea)] italic pl-2">· {notes}</p>}
                    </div>
                    <span className="text-[var(--papel)] font-semibold shrink-0 pl-2">
                      ${price.toLocaleString("es-CO")}
                    </span>
                  </div>
                ))}

                {visibleItemsCount < currentOrder.items.length && (
                  <div className="flex items-center gap-2 text-[var(--linea)] italic pt-1 animate-pulse">
                    <span className="size-1.5 rounded-full bg-[var(--brasa)]" />
                    <span>Imprimiendo comanda...</span>
                  </div>
                )}
              </div>

              {/* Indicador de optimización de tiempo */}
              <div className="bg-[var(--panel-2)] border border-[var(--linea-30)] rounded-lg p-2.5 mb-3 flex items-center justify-between text-xs font-mono">
                <span className="text-[var(--papel)] font-bold flex items-center gap-1.5">
                  <Sparkles className="size-3.5 text-[var(--brasa)]" /> Optimización de turno:
                </span>
                <span className="text-[var(--brasa)] font-bold">-4.5 min por servicio</span>
              </div>

              {/* Liquidación de Totales */}
              <div className="space-y-1.5 font-mono text-xs text-[var(--linea)]">
                <div className="flex justify-between">
                  <span>Subtotal Neto:</span>
                  <span className="text-[var(--papel)]">${currentOrder.subtotal.toLocaleString("es-CO")}</span>
                </div>
                <div className="flex justify-between">
                  <span>Impoconsumo (8% ICO):</span>
                  <span className="text-[var(--papel)]">${currentOrder.ico.toLocaleString("es-CO")}</span>
                </div>
                <div className="flex justify-between font-bold text-sm text-[var(--papel)] pt-2 border-t border-dashed border-[var(--linea-30)]">
                  <span>TOTAL CUENTA:</span>
                  <span className="text-[var(--brasa)] text-base font-black">
                    ${currentOrder.total.toLocaleString("es-CO")} COP
                  </span>
                </div>
              </div>

              {/* Sello de comanda activa */}
              <div className="mt-4 pt-3 border-t border-[var(--linea-16)] flex items-center justify-between">
                <span className={`chip ${ticketStamped ? "is-hot" : ""} font-bold transition-all`}>
                  <Flame className="size-3" />
                  {ticketStamped ? "DESPACHADO A MESA" : "EN COCINA (KDS)"}
                </span>
                <span className="text-[11px] font-mono text-[var(--linea)]">
                  PAGO: {currentOrder.pago}
                </span>
              </div>

            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
