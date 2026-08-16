-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "cobroAutomatico" TEXT,
ADD COLUMN     "ultimoAvisoClave" TEXT;

-- La lista base de precios. Va acá y no en `pnpm seed` porque el seed arrasa la
-- base y no corre en producción: sin esto, un despliegue nuevo se queda sin
-- precio y `listaVigente` cae al valor de fábrica del código.
-- Idempotente a propósito: reaplicar la migración no duplica la fila.
INSERT INTO "ListaDePrecios" ("id", "nombre", "updatedAt")
VALUES ('lista-base', 'Lista base', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
