"use client";

import { useState } from "react";
import { formatCop } from "@/lib/money";
import { Users, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";

interface CalculadoraDividirCuentaProps {
  faltanteCop: number;
  onSeleccionarMonto: (monto: number) => void;
}

export function CalculadoraDividirCuenta({
  faltanteCop,
  onSeleccionarMonto,
}: CalculadoraDividirCuentaProps) {
  const [numPersonas, setNumPersonas] = useState<number>(2);
  const [personaSeleccionada, setPersonaSeleccionada] = useState<number>(1);
  const [modoSplit, setModoSplit] = useState<"iguales" | "personalizado">("iguales");

  if (faltanteCop <= 0) return null;

  // Calculo de monto por persona dividiendo exacto
  const montoPorPersona = Math.ceil(faltanteCop / numPersonas);

  const handleAplicarPartes = (personasCount: number) => {
    setNumPersonas(personasCount);
    setPersonaSeleccionada(1);
    const montoCalculado = Math.ceil(faltanteCop / personasCount);
    onSeleccionarMonto(montoCalculado);
  };

  const handleSeleccionarPersona = (idxPersona: number) => {
    setPersonaSeleccionada(idxPersona);
    // Si es la última persona, cobra el remanente exacto para evitar centavos o descuadres
    const esUltimo = idxPersona === numPersonas;
    const yaCobrado = montoPorPersona * (idxPersona - 1);
    const montoPersona = esUltimo ? Math.max(0, faltanteCop - yaCobrado) : montoPorPersona;
    onSeleccionarMonto(montoPersona);
  };

  return (
    <div className="rounded-xl border border-border/80 bg-muted/30 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-bold text-xs text-foreground">
          <Users className="size-3.5 text-brand" />
          <span>Dividir cuenta entre personas</span>
        </div>
        <div className="flex bg-muted rounded-lg p-0.5 border border-border text-[11px] font-medium">
          <button
            type="button"
            onClick={() => {
              setModoSplit("iguales");
              handleAplicarPartes(numPersonas);
            }}
            className={cn(
              "px-2 py-0.5 rounded-md transition-all cursor-pointer",
              modoSplit === "iguales"
                ? "bg-card text-foreground font-bold shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Partes iguales
          </button>
          <button
            type="button"
            onClick={() => setModoSplit("personalizado")}
            className={cn(
              "px-2 py-0.5 rounded-md transition-all cursor-pointer",
              modoSplit === "personalizado"
                ? "bg-card text-foreground font-bold shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Abonos / Atajos
          </button>
        </div>
      </div>

      {modoSplit === "iguales" ? (
        <div className="space-y-2.5">
          {/* Botones de división rápida */}
          <div className="space-y-1">
            <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">
              ¿En cuántas personas dividen?
            </span>
            <div className="grid grid-cols-4 gap-1.5">
              {[2, 3, 4, 5].map((cant) => (
                <button
                  key={cant}
                  type="button"
                  onClick={() => handleAplicarPartes(cant)}
                  className={cn(
                    "h-8 rounded-lg border text-xs font-bold font-mono transition-all cursor-pointer flex items-center justify-center gap-1",
                    numPersonas === cant
                      ? "bg-brand text-brand-foreground border-brand shadow-xs"
                      : "bg-card border-border text-foreground hover:bg-muted",
                  )}
                >
                  <Users className="size-3" />
                  <span>{cant}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Tarjeta de resumen de cobro por integrante */}
          <div className="rounded-lg border border-brand/30 bg-brand/5 p-2.5 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Cada persona paga:</span>
              <span className="font-mono font-black text-brand text-sm">
                {formatCop(montoPorPersona)}
              </span>
            </div>

            {/* Selector de persona actual */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {Array.from({ length: numPersonas }).map((_, idx) => {
                const num = idx + 1;
                const esActivo = personaSeleccionada === num;
                return (
                  <button
                    key={num}
                    type="button"
                    onClick={() => handleSeleccionarPersona(num)}
                    className={cn(
                      "px-2.5 py-1 rounded-md text-[11px] font-mono font-bold transition-all border cursor-pointer",
                      esActivo
                        ? "bg-brand text-brand-foreground border-brand shadow-xs"
                        : "bg-card text-foreground border-border hover:bg-muted",
                    )}
                  >
                    Persona {num}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        /* Modo Atajos / Abonos rápidos */
        <div className="space-y-2">
          <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">
            Atajos de abono rápido:
          </span>
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { label: "50% (Mitad)", val: Math.ceil(faltanteCop * 0.5) },
              { label: "25% (Cuarto)", val: Math.ceil(faltanteCop * 0.25) },
              { label: "Total Restante", val: faltanteCop },
            ].map((preset, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => onSeleccionarMonto(preset.val)}
                className="h-8 rounded-lg border border-border bg-card hover:bg-muted text-foreground text-[11px] font-bold font-mono transition-all flex items-center justify-center gap-1 cursor-pointer"
              >
                <DollarSign className="size-3 text-muted-foreground" />
                <span>{preset.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
