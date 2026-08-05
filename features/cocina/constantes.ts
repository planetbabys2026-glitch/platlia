/**
 * Valores de cocina que necesitan los dos lados: el servidor para consultar y la
 * pantalla para pintar el color de la espera.
 *
 * Vive aparte de queries.ts porque aquel importa "server-only" —arrastra Prisma—
 * y traerlo al bundle del navegador rompe el build. Sin imports a propósito.
 */

/** Lo que se le concede a un plato que no declaró cuánto tarda. */
export const MINUTOS_POR_DEFECTO = 10;
