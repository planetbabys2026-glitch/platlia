"use client";

import { useFormStatus } from "react-dom";
import Lottie from "lottie-react";
import animationData from "../../public/animaciones/loading.json";

export function PantallaCargando({
  forcePending = false,
}: {
  mensaje?: string;
  forcePending?: boolean;
}) {
  const { pending } = useFormStatus();
  const activo = forcePending || pending;

  if (!activo) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[999] flex flex-col items-center justify-center bg-background/70 backdrop-blur-xl backdrop-saturate-150 animate-in fade-in duration-200 pointer-events-auto select-none overflow-hidden"
    >
      {/* Resplandor ambiental de marca animado */}
      <div className="absolute size-96 rounded-full bg-gradient-to-tr from-brand/25 via-brand-accent/15 to-transparent blur-[120px] animate-pulse pointer-events-none" />

      {/* Contenedor halo flotante con efecto cristal ultra-sutil */}
      <div className="relative flex items-center justify-center p-6 rounded-full bg-card/20 border border-white/10 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.5)] backdrop-blur-2xl transition-all duration-300 animate-in zoom-in-90">
        <div className="relative w-48 h-48 sm:w-60 sm:h-60 flex items-center justify-center filter drop-shadow-[0_10px_25px_rgba(0,0,0,0.25)]">
          <Lottie animationData={animationData} loop={true} className="w-full h-full" />
        </div>
      </div>
    </div>
  );
}

export function CargandoOverlay({
  forcePending = false,
}: {
  mensaje?: string;
  forcePending?: boolean;
}) {
  return <PantallaCargando forcePending={forcePending} />;
}
