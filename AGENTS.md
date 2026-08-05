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

## Superadministración

Puerta aparte: cookie `pl_sa` con path `/superadmin`, sesión de tipo `SUPERADMIN` y
`requireSuperAdmin()`. **Una sesión del producto no abre esta puerta** por más que el usuario
tenga `isSuperAdmin`: quien da soporte entra a propósito, no por arrastre.

`/pl-bootstrap` crea el superadministrador maestro una sola vez. Responde **404** —no "no
autorizado"— cuando falta `SUPERADMIN_BOOTSTRAP_TOKEN` o cuando ya existe uno: así es
indistinguible de una ruta inexistente y no confirma que la puerta exista. El token se compara en
tiempo constante.

La consola muestra **cuentas, no contenido**: cuántas mesas y cuántos pedidos, nunca qué
vendieron. Dar soporte no requiere leerle la operación a nadie. Toda acción pide motivo y queda
en `AuditLog` con quién la hizo.

**En un archivo `"use server"` no pueden vivir los esquemas de zod**: toda función a nivel de
módulo se compila como Server Action y el build falla con "Server Actions must be async
functions", que no menciona a zod por ningún lado. Por eso cada feature tiene su `schemas.ts`.

## Equipo y correo

El alta de empleados la hace el dueño en persona: crea la cuenta con una contraseña y se la
entrega. **La contraseña nunca viaja por correo** —quedaría escrita para siempre en un buzón que
no controlamos—; el correo solo avisa que lo sumaron y da el enlace de ingreso.

Las reglas de quién puede hacerle qué a quién viven en `lib/auth/reglas-equipo.ts`, puras y con
tests. Las dos que importan: solo un propietario nombra propietarios (si no, un administrador se
asciende solo) y no se puede degradar ni dar de baja al último propietario. Dar de baja o
cambiar una contraseña **revoca las sesiones** de esa persona: si no, dar de baja no es dar de baja.

**Un correo nunca tumba una operación.** `enviarCorreoSinBloquear` registra el fallo y sigue: que
Resend esté caído no puede impedir que un empleado quede creado. `APP_URL` se normaliza sin barra
final en `lib/env.ts`, porque todo el código compone `${APP_URL}/algo`.

## Facturación

Se cobra con Checkout Pro: se crea una preferencia, el cliente paga en MercadoPago y vuelve.
Nunca vemos ni guardamos un dato de tarjeta.

El webhook (`/api/webhooks/mercadopago`) es una URL pública que mueve el estado de la licencia,
así que se defiende en tres capas:

1. **Firma** (`lib/billing/firma.ts`): HMAC-SHA256 del manifiesto `id:…;request-id:…;ts:…;`,
   comparación en tiempo constante y ventana de 5 minutos contra reenvíos. Sin secreto
   configurado **falla cerrado**. Solo se apaga con `MP_SIGNATURE_ENFORCE=false`, en staging.
2. **Idempotencia de entrega**: `MpWebhookEvent.mpEventId` único.
3. **Idempotencia de negocio**: `SubscriptionPayment.mpPaymentId` único, y el mes se suma
   **solo cuando la fila se creó en esa pasada**. Diez reenvíos suman un mes, no diez.

El estado del pago **se pregunta a la API**, nunca se lee del cuerpo del aviso: creerle a quien
avisa es creerle a cualquiera. Y el webhook está en la lista pública del middleware —MercadoPago
no tiene cookie— junto con `/api/health`.

`estadoSegunFechas` no revive lo cancelado ni lo suspendido a mano: eso son decisiones, no
accidentes de cobro. El cron `pnpm cron:subs` solo escribe lo que el reloj ya volvió cierto.

## Despliegue (VPS con Dokploy / nixpacks)

`nixpacks.toml` manda; sin él nixpacks adivina y se equivoca en tres cosas, todas verificadas
contra el build real:

1. **La versión de pnpm.** Nixpacks eligió 9.15.9 y el repo usa 11. `pnpm-workspace.yaml` está
   escrito con `allowBuilds` (pnpm 10+) y pnpm 9 muere ahí con *"packages field missing or
   empty"*, antes de compilar. Mover ese ajuste a `package.json` **no** es alternativa: pnpm 11
   lo ignora y responde `ERR_PNPM_IGNORED_BUILDS`. Por eso el install trae pnpm por `npm -g`
   con `--prefix /usr/local` y lo invoca por ruta absoluta: Node vive en el store de nix, que
   es de solo lectura, así que `corepack enable` y `npm -g` sin prefijo fallan ahí.
2. **El arranque.** Con `output: "standalone"` no sirve `next start`. Se arranca
   `node .next/standalone/server.js`, y los estáticos se copian en la fase de build para que el
   runtime no necesite ni pnpm ni bash.
3. **`HOSTNAME=0.0.0.0`.** El servidor standalone escucha en localhost, que detrás de un proxy
   es no escuchar.

**`DATABASE_URL`, `SESSION_SECRET` y `APP_URL` tienen que estar en el BUILD**, no solo en
runtime: `next build` importa `lib/env.ts` al recolectar las rutas y aborta sin ellas.

Las migraciones no corren en el despliegue. Se aplican aparte con `pnpm db:deploy` contra la
base del VPS, para que un deploy no cambie el esquema mientras hay gente cobrando.

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

Los e2e corren **en serie y con un solo worker**: comparten una base cuyo estado clave es
singleton —hay una sola caja abierta por empresa— y en paralelo se pisan entre archivos.

**No dejes `pnpm dev` corriendo mientras corrés los e2e.** `next dev` vigila el proyecto y
reescribe el mismo `.next` que usa el build de producción: al tocar cualquier archivo lo corrompe
y el servidor empieza a responder 500 con `Cannot read properties of undefined (reading 'call')`
y `Could not find files for /_error`. El síntoma no se parece en nada a la causa.

Tres trampas más, que ya costaron tiempo dos veces cada una:

- **Next inyecta un `role="alert"` vacío** (`#__next-route-announcer__`) para anunciar los
  cambios de ruta. Un `getByRole("alert")` suelto lo agarra a él y falla con `""`. Hay que
  acotar al formulario: `page.locator("form").filter({ has: … }).getByRole("alert")`.
- **Después de enviar un formulario o de hacer clic en un enlace hay que esperar la navegación**
  (`await expect(page).toHaveURL(...)`) antes de leer la página o de hacer otro `goto`. Sin eso
  se lee la página vieja, o el `goto` cancela el envío y la acción nunca corre.
- **Los selectores por texto son ambiguos más seguido de lo que parece**: "Salón" es el `h1` y
  también un área del seed; "Contraseña" coincide con los campos "Contraseña nueva" de cada
  miembro del equipo. Conviene acotar con `level`, `exact` o al formulario que corresponde.

El gestor de paquetes es **pnpm**. No hay `package-lock.json`.
