# Platlia — convenciones del proyecto

SaaS multi-tenant de gestión para bares y restaurantes. Next.js **15.5.22** (App Router),
React 19, Tailwind v4, Prisma 7 sobre PostgreSQL. UI en español.

> Este proyecto usa Next 15, no 16. Antes había aquí un bloque autogenerado que mandaba a
> leer `node_modules/next/dist/docs/`: **esa carpeta no existe en Next 15** (es una
> característica de la 16) y nada la reescribe, porque `generate-agent-files.js` tampoco
> existe en esta versión. Las convenciones reales están abajo.

## Next 15 — lo que se rompe si lo escribís de memoria

- **`params` y `searchParams` son Promises. `cookies()` y `headers()` son async.** Hay que
  `await`. La capa de compatibilidad síncrona emite warning; no usarla.
  ```tsx
  export default async function Page({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
  }
  ```
- **No existen los tipos globales `PageProps<>` / `LayoutProps<>` / `RouteContext<>`** (son de
  Next 16). Se tipan las props a mano.
- **El archivo es `middleware.ts`, no `proxy.ts`** (ese rename es de Next 16).
- **`error.tsx` recibe `{ error, reset }`**, no `retry` (`retry` es de Next 16).
- `after()` se importa de `next/server`.
- `serverExternalPackages` es top-level. **`@prisma/client`, `prisma`, `pg` y `@node-rs/argon2`
  ya están en la lista por defecto** — no agregarlos.
- No usar `next lint` (deprecado): el script `lint` llama a `eslint` directo.
- El bundler de `build` es webpack. Si algún día se pasa a Turbopack, revalidar Prisma primero.
- **Una carpeta que empieza con `_` es privada y NO genera ruta.** Verificado con un build:
  `app/__pl/bootstrap/route.ts` responde 404. Por eso la ruta de bootstrap del superadmin
  **es `/pl-bootstrap`**, no `/__pl/bootstrap` como quedó anotado en el commit del renombre.
  Lo que la protege no es el nombre: sin `SUPERADMIN_BOOTSTRAP_TOKEN` en el entorno responde
  404, indistinguible de una ruta inexistente.

## Prisma 7 — lo que cambió respecto de la 6

- **La configuración vive en `prisma.config.ts`, no en el bloque `prisma` de package.json**
  (ese bloque ya no se lee). Ahí van `schema`, `datasource.url` y `migrations.seed`.
- **La CLI ya no carga `.env` sola.** `prisma.config.ts` lo hace con `process.loadEnvFile()`.
  Los scripts sueltos usan `tsx --env-file=.env`.
- **El driver adapter es obligatorio.** `lib/db/root.ts` monta `PrismaPg` sobre el pool de
  `lib/db/pool.ts`: hay un solo pool en el proceso, compartido con el SQL crudo del health check.
- **El cliente se genera en `generated/prisma/` y está en `.gitignore`.** Se importa de
  `@/generated/prisma/client` (y los enums de `@/generated/prisma/enums`). Un clon nuevo
  necesita `prisma generate`, que corre solo en `postinstall`.
- **El DMMF ya no existe en tiempo de ejecución.** Por eso la lista de modelos con `businessId`
  está escrita a mano en `lib/db/tenant-models.ts` y hay un test que la contrasta contra el
  schema.
- Los enums generados son objetos `as const`, no enums de TypeScript. El `Algorithm` de
  `@node-rs/argon2` sí es un `const enum` y no se puede importar con `isolatedModules`.

## Reglas de arquitectura — no negociables

1. **Toda `page.tsx` y toda Server Action verifica auth por su cuenta.** Los layouts NO son
   frontera de seguridad: no se re-renderizan en navegación cliente. Usar los helpers de
   `lib/auth/dal.ts` (`requireUser`, `requireBusiness`, `requireActiveLicense`, `requireRole`,
   `requireModule`). El layout de `(app)` solo llama `getCurrentUser()` para pintar el shell.

2. **Ninguna Server Action se escribe sin `defineAction`** (`lib/actions/define-action.ts`).
   Las Server Actions son alcanzables por POST directo sin pasar por la UI; el wrapper hornea
   sesión + licencia + rol + módulo + validación zod + scoping de tenant.

3. **Nunca importar el cliente Prisma base fuera de `lib/db/`.** ESLint lo bloquea. En código
   de negocio se usa `tenantDb(businessId)`, que inyecta el `businessId` solo. `rootDb` es
   exclusivo de auth, billing y superadmin.
   Dos huecos que `tenantDb` no tapa y hay que llenar a mano: las **escrituras anidadas**
   (`order.create({ data: { items: { create: [...] } } })`) no reciben el `businessId` —como la
   columna es obligatoria, el olvido revienta en vez de escribir mal—, y **`$queryRaw` /
   `$executeRaw`** pasan de largo: ahí el `businessId` va como parámetro y a la vista en el WHERE.

4. **El dinero es `Int` en pesos colombianos enteros.** Ni `Decimal` ni `BigInt`: ninguno de
   los dos cruza el límite RSC → Client Component. Las tarifas de impuesto son `Int` en puntos
   básicos (`800` = 8%).

5. **El impuesto es dato, no código.** Se lee de `TaxRate` por empresa (default: impuesto al
   consumo 8%) y **se congela en cada `OrderItem`** al agregarlo, para que un recibo viejo se
   reimprima idéntico. Se redondea **por línea**, nunca sobre el total.

6. **Nada de fechas ingenuas.** Todo `DateTime` es `@db.Timestamptz(3)`. Todo cálculo de día
   pasa por `lib/time.ts` con la zona horaria de la empresa. Prohibido `CURRENT_DATE` o
   `now()::date` en SQL: el `businessDate` siempre va como parámetro.
   El día de negocio no empieza a medianoche sino en `BusinessSettings.businessDayStartMinutes`
   (5 a.m. por defecto): la madrugada del bar pertenece a la jornada anterior. Es `@db.Date`, se
   representa como medianoche UTC y los informes filtran con el rango semiabierto de
   `businessDayRange()`.

7. **Todo parámetro operativo es configurable por empresa** (`BusinessSettings`), con valores
   por defecto colombianos. Nada de constantes globales de negocio.

## Autenticación

La cookie `pl_session` lleva un JWT firmado que **no es la sesión**: es un puntero a una fila
de `Session`. Quien decide si sigue viva es el DAL contra la base, y eso es lo que permite
revocarla de verdad (`revokeAllSessions`). `middleware.ts` solo verifica la firma, sin tocar
la base, y por eso únicamente puede importar `lib/auth/token.ts`: corre en edge.

Las reglas puras de autorización (`licenciaVigente`, `tieneRol`) viven en `lib/auth/reglas.ts`,
sin `server-only`, para que tengan tests. `lib/auth/dal.ts` las reexporta.

Un detalle que rompe el build si se olvida: **un componente cliente no puede importar de
`lib/actions/define-action.ts`** (tiene `server-only` y arrastra Prisma). El estado de las
acciones se importa de `lib/actions/estado.ts`.

Errores: cualquier excepción dentro de una acción se convierte en un mensaje genérico para no
filtrar detalles del servidor. Para un texto que sí deba leer el usuario ("ese correo ya tiene
cuenta") se lanza `ErrorDeUsuario`.

## Marca

Dos colores: verde azulado profundo **`#1D4E51`** y terracota cálido **`#A75F39`**. Están en
`--brand` y `--brand-accent` (clases `bg-brand`, `text-brand-accent`), y el verde azulado es
además `--primary`. En modo oscuro **no se usan esos valores** —el verde azulado sobre `#101416`
da 1,7:1—: se aclaran a `#3E9EA2` y `#C8855F`, que pasan 4,5:1. Los tokens de marca son
identidad, no función; para decir "esto está bien" o "esto falló" están `--success`,
`--warning` y `--destructive`.

Las piezas se usan por `components/marca/logo.tsx`, nunca con `<img>` suelto: `Logo` (con
bajada, de 80 px de alto para arriba), `Logotipo` (sin bajada, para la interfaz) e `Isotipo`.
Cada una pinta la versión clara y la inversa y las alterna con la clase `dark`, porque elegir
en el cliente haría parpadear el logo equivocado en cada carga. Los iconos de la app salen de
`app/{favicon.ico,icon.png,apple-icon.png}` por convención de archivos de Next.

## Estructura

```
middleware.ts            chequeo optimista de cookie, SIN tocar la base de datos
prisma.config.ts         configuración de la CLI de Prisma 7
prisma/schema.prisma     modelo de datos    prisma/migrations/    prisma/seed.ts
generated/prisma/        cliente generado (ignorado por git)
app/(auth|onboarding|app|superadmin|bootstrap|bloqueado)/   grupos de rutas
app/imprimir/            HTML limpio para @page 55mm/80mm
lib/db/                  pool.ts · root.ts (rootDb) · tenant.ts (tenantDb) · tenant-models.ts
lib/{auth,actions,billing,printing,email}/      infraestructura
lib/{money,tax,time,turns}.ts                   lógica pura, con tests
features/<dominio>/{actions,queries,schemas}.ts + components/
components/ui/           shadcn (generado)
```

## Comandos

```bash
pnpm dev          pnpm build        pnpm start
pnpm typecheck    pnpm lint         pnpm test        pnpm test:e2e
pnpm db:migrate   pnpm db:studio    pnpm seed
pnpm dev:https    # necesario para probar la PWA en local
```

Los e2e usan el **Chrome instalado en la máquina** (`channel: "chrome"`), no el Chromium de
Playwright: no hay que bajar 130 MB y se prueba contra el navegador que la gente usa. Corren
contra la base sembrada, así que antes va `pnpm seed`.

El gestor de paquetes es **pnpm**. No hay `package-lock.json`.
