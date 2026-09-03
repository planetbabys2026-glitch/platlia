-- El freno por procedencia para las puertas públicas: ingresar, registrarse,
-- recuperar la contraseña y el pedido por QR.
--
-- Vive en Postgres y no en Redis por la misma razón que la cola de impresión:
-- `lib/redis.ts` devuelve null sin REDIS_URL y todos sus publicadores se vuelven
-- no-ops en silencio. Un limitador que se apaga solo cuando falta una variable
-- opcional figura en el código y no frena nada.
--
-- La unicidad (clave, ventanaAt) es lo que permite contar con un solo upsert
-- atómico: leer y después escribir deja pasar los intentos simultáneos, que en
-- un limitador son justamente los que hay que frenar. Y como el comienzo de la
-- ventana forma parte de la clave, al cambiar de ventana aparece una fila nueva
-- y el conteo arranca de cero solo, sin que nadie tenga que reiniciar nada.

-- CreateTable
CREATE TABLE "IntentoDeAcceso" (
    "id" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "ventanaAt" TIMESTAMPTZ(3) NOT NULL,
    "intentos" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntentoDeAcceso_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IntentoDeAcceso_clave_ventanaAt_key" ON "IntentoDeAcceso"("clave", "ventanaAt");

-- CreateIndex: lo usa el barrido diario del cron.
CREATE INDEX "IntentoDeAcceso_ventanaAt_idx" ON "IntentoDeAcceso"("ventanaAt");
