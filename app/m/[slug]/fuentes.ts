import { Fraunces, Space_Mono } from "next/font/google";

/**
 * Las letras que un negocio puede elegir para SU carta.
 *
 * Solo se cargan en la ruta del menú QR, no en la aplicación: son un ajuste del
 * escaparate de cada local y no tienen nada que hacer en el turno de trabajo.
 * Van por `next/font`, así que se descargan al compilar y se sirven desde
 * nuestro dominio; en la calle, con datos flojos, un pedido a Google Fonts es un
 * segundo de texto invisible.
 *
 * Dos de las cuatro opciones ya viven en la aplicación —Big Shoulders y General
 * Sans— y se toman de sus variables globales. Acá se suman las dos que no:
 *
 * · **Fraunces** para el restaurante que quiere leerse como un mantel largo. Es
 *   una serif de contraste alto con carácter propio, no la Playfair de siempre.
 * · **Space Mono** para el café de especialidad o la cervecería artesanal, donde
 *   la máquina de escribir es el género. Salió del sistema cuando la tercera
 *   letra pasó a Space Grotesk, y acá vuelve como decisión de un negocio y no
 *   como valor por defecto de nadie.
 */
export const fraunces = Fraunces({
  variable: "--fuente-serif",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "700", "900"],
});

export const spaceMono = Space_Mono({
  variable: "--fuente-maquina",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "700"],
});

/** De la opción guardada a la variable CSS que la pinta. */
export const VARIABLE_DE_FUENTE = {
  CONDENSADA: "var(--font-display)",
  LIMPIA: "var(--font-sans)",
  SERIF: "var(--fuente-serif)",
  MAQUINA: "var(--fuente-maquina)",
} as const;

/**
 * Cada letra pide su propio tratamiento: la condensada aguanta versalitas
 * apretadas, la serif se rompe si se la aprieta igual. Sin esto, elegir la letra
 * cambiaría la forma de las eses y nada más.
 */
export const TRATAMIENTO_DE_FUENTE = {
  CONDENSADA: "uppercase tracking-tight",
  LIMPIA: "tracking-tight",
  SERIF: "tracking-[-0.01em]",
  MAQUINA: "uppercase tracking-[0.02em]",
} as const;
