"use client";

import React, { useState, useEffect } from "react";
import { Flame } from "lucide-react";

interface OrderDemo {
  id: string;
  origen: string;
  pago: string;
  items: [number, string, number, string][];
  total: number;
}

const ORDERS: OrderDemo[] = [
  {
    id: "0847",
    origen: "MESA 12 · SALÓN",
    pago: "EFECTIVO",
    items: [
      [2, "CERVEZA CORONA 330ML", 24000, "BARRA"],
      [1, "COMBO HAMB. CLASICA", 25000, "COCINA"],
      [1, "HIT LULO 500ML", 5500, "BARRA"],
    ],
    total: 54500,
  },
  {
    id: "0848",
    origen: "MOSTRADOR · LLEVAR",
    pago: "TARJETA",
    items: [
      [1, "SALCHIPAPAS QUESUDAS", 20000, "COCINA"],
      [1, "POSTOBON MANZANA 200ML", 3000, "BARRA"],
    ],
    total: 23000,
  },
  {
    id: "0849",
    origen: "DOMICILIO · WHATSAPP",
    pago: "NEQUI",
    items: [
      [2, "COMBO HAMB. CLASICA", 50000, "COCINA"],
      [1, "PEPSI 1.5L", 7000, "BARRA"],
    ],
    total: 57000,
  },
];

function ActiveTicket({ order, onNext }: { order: OrderDemo; onNext: () => void }) {
  const [lineIndex, setLineIndex] = useState(0);
  const [stamped, setStamped] = useState(false);
  const [stampText, setStampText] = useState("LISTO · 00:00");
  const [chronoText, setChronoText] = useState("00:00.0");
  const [liveLabel, setLiveLabel] = useState("EN COCINA");
  const [tearOff, setTearOff] = useState(false);

  useEffect(() => {
    const startTime = Date.now();
    let tearTimer: NodeJS.Timeout | undefined;

    // Cronómetro en vivo
    const chronoTimer = setInterval(() => {
      const d = Date.now() - startTime;
      const mm = String(Math.floor(d / 60000)).padStart(2, "0");
      const ss = String(Math.floor((d % 60000) / 1000)).padStart(2, "0");
      const ms = Math.floor((d % 1000) / 100);
      setChronoText(`${mm}:${ss}.${ms}`);
    }, 100);

    // Impresión progresiva de líneas simulando salida del cabezal térmico
    let currentLine = 0;
    const totalLines = 5 + order.items.length * 2;

    const lineTimer = setInterval(() => {
      currentLine++;
      setLineIndex(currentLine);

      if (currentLine >= totalLines) {
        clearInterval(lineTimer);

        // Estampado de comanda
        setTimeout(() => {
          clearInterval(chronoTimer);
          const elapsed = Date.now() - startTime;
          const mm = String(Math.floor(elapsed / 60000)).padStart(2, "0");
          const ss = String(Math.floor((elapsed % 60000) / 1000)).padStart(2, "0");
          setStampText(`LISTO · ${mm}:${ss}`);
          setStamped(true);
          setLiveLabel("PEDIDO LISTO");

          // Desgarre / arrancar ticket
          tearTimer = setTimeout(() => {
            setTearOff(true);
            setTimeout(() => {
              onNext();
            }, 450);
          }, 3200);
        }, 700);
      }
    }, 280);

    return () => {
      clearInterval(chronoTimer);
      clearInterval(lineTimer);
      if (tearTimer) clearTimeout(tearTimer);
    };
  }, [order, onNext]);

  return (
    <>
      {/* ─── Escenario del Ticket que emerge de la ranura ─── */}
      <div
        className={`w-full relative transition-all duration-500 ease-in-out ${
          tearOff ? "opacity-0 translate-y-7 scale-95" : "opacity-100 translate-y-0 scale-100"
        }`}
      >
        {/* Sello de despacho animado */}
        {stamped && (
          <div className="absolute right-4 bottom-14 z-30 pointer-events-none animate-stamp-in">
            <div className="border-[3px] border-[var(--tinta)] bg-[var(--papel)]/90 text-[var(--tinta)] font-mono font-black text-sm px-3.5 py-1.5 rounded-md uppercase tracking-wider shadow-xl rotate-[-8deg] flex items-center gap-1.5">
              <Flame className="size-4 text-[var(--brasa)]" />
              {stampText}
            </div>
          </div>
        )}

        {/* Cuerpo del Ticket de Papel Térmico */}
        <div className="w-full bg-[var(--papel)] text-[var(--tinta)] font-mono text-xs leading-relaxed p-6 shadow-[0_30px_70px_rgba(0,0,0,0.6),0_4px_14px_rgba(0,0,0,0.4)] relative">
          
          {/* Header */}
          <div className="text-center pb-2 border-b border-dashed border-[var(--tinta)]/40">
            <p className="font-display font-black text-2xl tracking-tight uppercase leading-none">
              PLATLIA
            </p>
            <p className="text-rotulo opacity-75 tracking-wider uppercase mt-1">
              COMANDA EN VIVO · TURNO NOCHE
            </p>
          </div>

          {/* Meta del pedido */}
          <div className="py-2 space-y-1 text-rotulo border-b border-dashed border-[var(--tinta)]/40">
            <div className="flex justify-between">
              <span className="font-bold">Nº {order.id}</span>
              <span className="opacity-80">5:00 A.M. CORTE</span>
            </div>
            <div className="flex justify-between font-semibold text-[var(--brasa)]">
              <span>{order.origen}</span>
              <span>{order.items.length} ITEMS</span>
            </div>
          </div>

          {/* Lista de Platos que se imprimen progresivamente */}
          <div className="py-3 space-y-2 min-h-[110px]">
            {order.items.map(([qty, name, price, route], idx) => {
              const visible = lineIndex > idx * 2;
              if (!visible) return null;

              return (
                <div key={idx} className="animate-card-in space-y-0.5">
                  <div className="flex justify-between font-bold">
                    <span>
                      {qty}x {name}
                    </span>
                    <span>${price.toLocaleString("es-CO")}</span>
                  </div>
                  <div className="text-rotulo opacity-75 pl-3">
                    ↳ Estación: {route}
                  </div>
                </div>
              );
            })}

            {lineIndex < 5 + order.items.length * 2 && (
              <div className="flex items-center gap-1.5 text-rotulo opacity-70 italic pt-1 animate-pulse">
                <span className="size-1.5 rounded-full bg-[var(--brasa)]" />
                <span>Imprimiendo en tiempo real...</span>
              </div>
            )}
          </div>

          {/* Totales y Pago */}
          <div className="pt-2 border-t-2 border-dashed border-[var(--tinta)]/50 space-y-1">
            <div className="flex justify-between font-black text-sm pt-1">
              <span>TOTAL</span>
              <span>${order.total.toLocaleString("es-CO")} COP</span>
            </div>
            <div className="text-center text-rotulo opacity-75 uppercase pt-1">
              MÉTODO: {order.pago} · TRANSACCIÓN SEGURA
            </div>
          </div>

        </div>

        {/* ─── Borde Dentado de Tirilla Térmica (Sawtooth Serrated Tear) ─── */}
        <div
          className="w-full h-3"
          style={{
            background:
              "linear-gradient(135deg, var(--papel) 25%, transparent 25%) -6px 0 / 12px 12px repeat-x, linear-gradient(225deg, var(--papel) 25%, transparent 25%) -6px 0 / 12px 12px repeat-x",
            filter: "drop-shadow(0 10px 12px rgba(0,0,0,0.5))",
          }}
        />
      </div>

      {/* Indicador de Estado en Vivo debajo del ticket */}
      <div className="mt-5 inline-flex items-center gap-2.5 font-mono text-xs font-bold tracking-wider text-[var(--brasa)] uppercase">
        <span className="size-2 rounded-full bg-[var(--brasa)] animate-pulse shadow-[0_0_6px_var(--brasa)]" />
        <span>{liveLabel}</span>
        <span className="text-[var(--papel)] tabular-nums font-mono">[{chronoText}]</span>
      </div>
    </>
  );
}

export function ThermalPrinterTicket() {
  const [orderIndex, setOrderIndex] = useState(0);

  return (
    <div className="w-full max-w-[430px] mx-auto flex flex-col items-center select-none">
      {/* ─── Boca de la Impresora Térmica (Hardware Slot) ─── */}
      <div className="w-full h-9 rounded-t-xl bg-[#2a2723] border border-[var(--linea-30)] border-b-0 flex items-center justify-center relative shadow-lg z-20">
        <span className="w-3/4 h-1.5 rounded-full bg-[#12100e] shadow-[inset_0_1px_2px_rgba(0,0,0,0.8)]" />
        <span className="absolute right-4 size-2 rounded-full bg-[var(--brasa)] animate-pulse shadow-[0_0_8px_var(--brasa)]" />
      </div>

      {/* Ticket activo animado */}
      <ActiveTicket
        key={orderIndex}
        order={ORDERS[orderIndex]}
        onNext={() => setOrderIndex((prev) => (prev + 1) % ORDERS.length)}
      />
    </div>
  );
}
