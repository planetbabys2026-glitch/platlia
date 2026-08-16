import React from "react";
import Link from "next/link";
import { Logotipo } from "@/components/marca/logo";
import { ThermalPrinterTicket } from "@/components/marca/thermal-printer-ticket";
import { ArrowLeft } from "lucide-react";

/**
 * Layout de Autenticación con Impresora Térmica en Vivo y Animaciones Dark Kitchen-Fire (Open Design)
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 min-h-screen bg-[var(--tinta)] text-[var(--papel)]">
      {/* ─── Columna Izquierda: Showcase Impresora Térmica en Vivo ─── */}
      <div className="hidden lg:flex lg:col-span-7 relative flex-col justify-between p-8 lg:p-12 border-r border-dashed border-[var(--linea-30)] bg-[radial-gradient(640px_480px_at_50%_50%,color-mix(in_oklch,var(--brasa)_7%,transparent),transparent_70%)] overflow-hidden">
        
        {/* Top Header */}
        <div className="flex items-center justify-between rise">
          <Link href="/" className="transition-opacity hover:opacity-90">
            <Logotipo size="lg" eyebrow="SISTEMA GASTRONÓMICO" />
          </Link>
          <span className="font-mono text-rotulo tracking-widest text-[var(--papel)] border border-[var(--linea-30)] rounded-full px-3.5 py-1 bg-[var(--panel-2)] uppercase">
            PRUEBA GRATIS 7 DÍAS
          </span>
        </div>

        {/* Impresora Térmica Animada: El ticket emerge de la ranura, imprime renglones y se estampa en vivo */}
        <div className="my-auto py-4 w-full flex flex-col items-center rise">
          <div className="text-center max-w-lg mb-5 space-y-1.5">
            <p className="font-mono text-xs tracking-[0.16em] uppercase text-[var(--linea)]">
              — Comandas en tiempo real · KDS
            </p>
            <h2 className="font-display font-black text-3xl lg:text-4xl uppercase tracking-tight text-[var(--papel)] leading-[0.95]">
              La comanda no espera
            </h2>
            <p className="text-xs text-[var(--linea)] max-w-md mx-auto">
              Cada pedido entra, se enruta a su estación de cocina o barra y sale sin papelitos perdidos.
            </p>
          </div>

          <ThermalPrinterTicket />
        </div>

        {/* Footer Meta */}
        <div className="pt-4 border-t border-dashed border-[var(--linea-30)] flex items-center justify-between font-mono text-rotulo text-[var(--linea)] tracking-wider">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-[var(--brasa)] animate-pulse" />
            <span>SISTEMA OPERANDO EN VIVO · CORTE 5:00 A.M.</span>
          </div>
          <span>SOPORTE 1 A 1 EN COLOMBIA</span>
        </div>
      </div>

      {/* ─── Columna Derecha: Formulario ─── */}
      <div className="lg:col-span-5 flex flex-col justify-between p-6 sm:p-10 lg:p-12 bg-[var(--panel-bg)] overflow-y-auto">
        <div className="flex items-center justify-between mb-6 rise">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs font-medium text-[var(--linea)] hover:text-[var(--papel)] transition-colors group"
          >
            <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-1" />
            <span>Volver a la portada</span>
          </Link>
          <div className="lg:hidden">
            <Logotipo size="sm" />
          </div>
        </div>

        <div className="my-auto w-full max-w-md mx-auto py-4 rise">
          {children}
        </div>

        <div className="mt-8 pt-4 border-t border-dashed border-[var(--linea-30)] text-center font-mono text-rotulo text-[var(--linea)] tracking-wider">
          PLATLIA MULTI-TENANT · BOGOTÁ · MEDELLÍN · CALI
        </div>
      </div>
    </div>
  );
}
