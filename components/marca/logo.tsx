import React from "react";
import { cn } from "@/lib/utils";

/**
 * Platlia — Logotipo e Isotipo Oficial (Brand Manual v2 / Dark Kitchen-Fire Vector System)
 *
 *  · `Isotipo`   Tirilla de papel térmico (comanda) de 6 dientes con monograma "P" (Big Shoulders 900) y acento Brasa #FF4E1F
 *  · `Logotipo`  Isotipo + Palabra PLATLIA + Eyebrow opcional (ideal para navbar, headers y modales)
 *  · `Logo`      Isotipo + Palabra PLATLIA + Bajada institucional "Gestión de Restaurantes y Bares"
 */

export type MarcaProps = {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  variant?: "dark" | "tinta" | "mono";
  showText?: boolean;
  eyebrow?: string;
  priority?: boolean;
  onClick?: () => void;
};

/**
 * Isotipo: Tirilla de papel térmico (comanda) dentada con monograma "P" y acento Brasa #FF4E1F
 * Geometría vectorial oficial (Brand Manual v2):
 * - Ticket 48×56 sobre retícula de 96 (viewBox centrado: 24 16 48 56)
 * - 6 picos dentados inferiores
 * - Monograma P en Big Shoulders Display 900
 * - Línea brasa 24×5
 */
export function Isotipo({
  className,
  size = "md",
  variant = "dark",
  onClick,
}: MarcaProps) {
  const dims = {
    sm: { w: 24, h: 28 },
    md: { w: 31, h: 36 },
    lg: { w: 41, h: 48 },
    xl: { w: 60, h: 70 },
  }[size];

  // Paleta según variante de fondo
  const isTinta = variant === "tinta";
  const isMono = variant === "mono";

  const ticketFill = isTinta ? "#171512" : isMono ? "currentColor" : "#EDE7DA";
  const pFill = isTinta ? "#EDE7DA" : isMono ? "#171512" : "#171512";
  const barFill = isMono ? "currentColor" : "#FF4E1F";

  return (
    <svg
      viewBox="24 16 48 56"
      width={dims.w}
      height={dims.h}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      onClick={onClick}
      className={cn(
        "flex-shrink-0 transition-transform duration-150",
        onClick && "cursor-pointer hover:scale-105",
        className
      )}
      aria-label="Platlia Isotipo"
      role="img"
    >
      {/* Silueta de tirilla de comanda con borde dentado de 6 picos */}
      <path
        d="M24 16H72V64L68 72L64 64L60 72L56 64L52 72L48 64L44 72L40 64L36 72L32 64L28 72L24 64Z"
        fill={ticketFill}
      />

      {/* Monograma P oficial (Big Shoulders Display 900 vectorizado) */}
      <path
        d="M42.2 44V20H47.9Q51.3 20 52.8 21.4Q54.3 22.7 54.4 25.9Q54.4 27.1 54.4 28.2Q54.4 29.3 54.4 30.5Q54.3 33.6 52.8 35Q51.3 36.4 47.9 36.4H46.7V44ZM46.7 32.4H47.9Q48.9 32.4 49.4 32Q49.8 31.6 49.9 30.8Q49.9 30 50 29.1Q50 28.2 50 27.3Q49.9 26.3 49.9 25.6Q49.8 24.8 49.4 24.4Q48.9 24 47.9 24H46.7Z"
        fill={pFill}
      />

      {/* Barra de acento Brasa #FF4E1F (el ítem que arde en cocina) */}
      <rect x="36" y="52" width="24" height="5" fill={barFill} />
    </svg>
  );
}

/**
 * Logotipo: Isotipo + Palabra "PLATLIA" (con Eyebrow opcional)
 */
export function Logotipo({
  className,
  size = "md",
  variant = "dark",
  eyebrow,
  onClick,
}: MarcaProps) {
  const fontSizes = {
    sm: "text-xl",
    md: "text-2xl",
    lg: "text-3xl",
    xl: "text-4xl",
  }[size];

  const textColor =
    variant === "tinta"
      ? "text-[#171512]"
      : variant === "mono"
        ? "text-current"
        : "text-foreground";

  return (
    <div
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2.5 select-none",
        onClick && "cursor-pointer",
        className
      )}
    >
      <Isotipo size={size} variant={variant} />
      <div className="flex flex-col leading-none">
        {eyebrow && (
          <span className="font-mono text-rotulo uppercase tracking-[0.16em] text-brand font-semibold mb-0.5">
            {eyebrow}
          </span>
        )}
        <span
          className={cn(
            "font-display font-black tracking-[-0.02em] uppercase leading-none",
            textColor,
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
  variant = "dark",
  eyebrow = "SISTEMA GASTRONÓMICO",
  onClick,
}: MarcaProps) {
  const textColor =
    variant === "tinta"
      ? "text-[#171512]"
      : variant === "mono"
        ? "text-current"
        : "text-foreground";

  return (
    <div
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-3 select-none",
        onClick && "cursor-pointer",
        className
      )}
    >
      <Isotipo size={size} variant={variant} />
      <div className="flex flex-col leading-none">
        {eyebrow && (
          <span className="font-mono text-rotulo uppercase tracking-[0.18em] text-brand font-bold mb-1">
            {eyebrow}
          </span>
        )}
        <span
          className={cn(
            "font-display font-black text-3xl sm:text-4xl tracking-[-0.02em] uppercase leading-none",
            textColor
          )}
        >
          PLATLIA
        </span>
        <span className="font-sans text-rotulo tracking-wide text-muted-foreground mt-1 font-medium">
          Gestión de Restaurantes y Bares
        </span>
      </div>
    </div>
  );
}
