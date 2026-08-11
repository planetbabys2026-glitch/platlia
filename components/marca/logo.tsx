import React from "react";
import { cn } from "@/lib/utils";

/**
 * Platlia — Logotipo e Isotipo Oficial (Dark Kitchen-Fire Vector System)
 *
 *  · `Logo`      Tirilla dentada + Palabra PLATLIA + Bajada opcional
 *  · `Logotipo`  Tirilla dentada + Palabra PLATLIA (ideal para navbar y header)
 *  · `Isotipo`   Solo la tirilla dentada con el monograma "P" y acento Brasa
 */

type MarcaProps = {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  showText?: boolean;
  eyebrow?: string;
  priority?: boolean;
  onClick?: () => void;
};

/**
 * Isotipo: Tirilla de papel térmico dentada con monograma "P" y acento Brasa #FF4E1F
 */
export function Isotipo({
  className,
  size = "md",
  onClick,
}: MarcaProps) {
  const dims = {
    sm: { w: 26, h: 32 },
    md: { w: 32, h: 40 },
    lg: { w: 42, h: 52 },
    xl: { w: 60, h: 76 },
  }[size];

  return (
    <svg
      viewBox="0 0 40 50"
      width={dims.w}
      height={dims.h}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      onClick={onClick}
      className={cn(
        "flex-shrink-0 transition-transform duration-150 hover:scale-105",
        onClick && "cursor-pointer",
        className
      )}
      aria-label="Platlia Isotipo"
    >
      {/* Silueta de tirilla dentada con 22 picos */}
      <path
        d="M2 5 
           L5 3 L8 5 L11 3 L14 5 L17 3 L20 5 L23 3 L26 5 L29 3 L32 5 L35 3 L38 5 
           L38 45 
           L35 47 L32 45 L29 47 L26 45 L23 47 L20 45 L17 47 L14 45 L11 47 L8 45 L5 47 L2 45 
           Z"
        fill="currentColor"
        stroke="var(--linea-30, rgba(201, 194, 175, 0.3))"
        strokeWidth="1"
        className="text-foreground/90 dark:text-papel"
      />
      {/* Acento en Brasa (#FF4E1F) */}
      <rect x="7" y="10" width="26" height="3.5" rx="1.5" fill="#FF4E1F" />

      {/* Monograma "P" */}
      <path
        d="M13 18 H22 C25 18 27 20 27 23 C27 26 25 28 22 28 H17 V36 H13 Z M17 22 V24.5 H21.5 C22.8 24.5 23.5 24 23.5 23 C23.5 22 22.8 21.8 21.5 21.8 Z"
        fill="var(--background, #171512)"
        className="fill-background dark:fill-tinta"
      />

      {/* Micro líneas de corte térmico */}
      <line x1="8" y1="40" x2="32" y2="40" stroke="#FF4E1F" strokeWidth="1.5" strokeDasharray="2 2" />
    </svg>
  );
}

/**
 * Logotipo: Isotipo + Palabra "PLATLIA"
 */
export function Logotipo({
  className,
  size = "md",
  eyebrow,
  onClick,
}: MarcaProps) {
  const fontSizes = {
    sm: "text-xl",
    md: "text-2xl",
    lg: "text-3xl",
    xl: "text-4xl",
  }[size];

  return (
    <div
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2.5 select-none",
        onClick && "cursor-pointer",
        className
      )}
    >
      <Isotipo size={size} />
      <div className="flex flex-col leading-none">
        {eyebrow && (
          <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-brand font-semibold mb-0.5">
            {eyebrow}
          </span>
        )}
        <span
          className={cn(
            "font-display font-black tracking-tight uppercase leading-none text-foreground",
            fontSizes
          )}
        >
          PLATLIA
        </span>
      </div>
    </div>
  );
}

/**
 * Logo: Versión completa con bajada institucional
 */
export function Logo({
  className,
  size = "lg",
  eyebrow = "SISTEMA GASTRONÓMICO",
  onClick,
}: MarcaProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-3 select-none",
        onClick && "cursor-pointer",
        className
      )}
    >
      <Isotipo size={size} />
      <div className="flex flex-col leading-none">
        {eyebrow && (
          <span className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-brand font-bold mb-1">
            {eyebrow}
          </span>
        )}
        <span className="font-display font-black text-3xl sm:text-4xl tracking-tight uppercase leading-none text-foreground">
          PLATLIA
        </span>
        <span className="font-sans text-[11px] tracking-wide text-muted-foreground mt-1 font-medium">
          Gestión de Restaurantes y Bares
        </span>
      </div>
    </div>
  );
}
