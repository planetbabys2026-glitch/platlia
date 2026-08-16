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

**Verificación de correo y recuperación de contraseña** (`features/auth/tokens.ts`) comparten un
solo modelo, `VerificationToken`, distinguido por `purpose`. Se guarda el **hash** del token, no
el token: una fila filtrada no puede regalar ninguna cuenta. Antes de emitir uno nuevo se borran
los anteriores sin usar del mismo usuario y propósito, para que nunca haya dos enlaces vivos
compitiendo por ser "el" válido.

Verificar el correo consume el token en un simple `GET` —como en casi todo el resto de la
industria—: saber el propio correo no da acceso a nada. Restablecer la contraseña NO: el enlace
del correo abre un formulario y el token se consume recién al mandarlo por `POST`. La diferencia
importa porque los escáneres de seguridad de algunos correos corporativos abren los enlaces por su
cuenta antes de que la persona los toque; que eso queme un token de sesión real sería un enlace de
recuperación muerto antes de usarse.

`solicitarRecuperacion` contesta **siempre el mismo mensaje**, exista o no la cuenta —el mismo
principio que ya aplica `ingresar` con su hash señuelo—: decir "ese correo no existe" es regalarle
a cualquiera la lista de quién tiene cuenta.

## Superadministración

Puerta aparte: cookie `pl_sa` con path `/superadmin`, sesión de tipo `SUPERADMIN` y
`requireSuperAdmin()`. **Una sesión del producto no abre esta puerta** por más que el usuario
tenga `isSuperAdmin`: quien da soporte entra a propósito, no por arrastre.

`/pl-bootstrap` **rehace** el superadministrador maestro: es la puerta de recuperación para cuando
nadie puede entrar a `/superadmin`. Borra los superadministradores que haya y deja solo el que se
escriba ahí. A quien además tenga membresía en un negocio no se le borra la cuenta —eso se llevaría
por cascada las membresías y dejaría a un negocio sin su dueño—: se le quita la marca y se le
revocan las sesiones de soporte. A las cuentas que solo existían para dar soporte no les queda nada
que conservar y se borran.

Responde **404** —no "no autorizado"— cuando falta `SUPERADMIN_BOOTSTRAP_TOKEN`: así es
indistinguible de una ruta inexistente y no confirma que la puerta exista. El token se compara en
tiempo constante y los intentos con token incorrecto quedan en `AuditLog`.

**Mientras la variable esté en el entorno la puerta está abierta.** Antes también se cerraba sola al
existir el primer superadministrador, lo que servía de red para el olvido de borrarla; esa red ya no
está, porque cerrarse sola es justamente lo que impedía recuperar un acceso perdido. El token pasó a
ser una llave permanente: sacarlo del entorno apenas se usa dejó de ser una recomendación.

Sumar gente al equipo de soporte **no** se hace por acá sino en `/superadmin/equipo`, que exige
estar adentro. Esta puerta reemplaza, no suma.

La consola muestra **cuentas, no contenido**: cuántas mesas y cuántos pedidos, nunca qué
vendieron. Dar soporte no requiere leerle la operación a nadie. Toda acción sobre un negocio
—suspender, extender licencia— pide motivo y queda en `AuditLog` con quién la hizo, porque son
cosas que un dueño después pregunta por qué se hicieron. Las de `/superadmin/equipo` (agregar,
editar, resetear clave, quitar acceso) quedan igual en `AuditLog` pero sin motivo escrito: es
gestión interna del propio equipo de soporte, no una acción sobre un cliente.

**En un archivo `"use server"` no pueden vivir los esquemas de zod**: toda función a nivel de
módulo se compila como Server Action y el build falla con "Server Actions must be async
functions", que no menciona a zod por ningún lado. Por eso cada feature tiene su `schemas.ts`.

**El equipo de superadministración no tiene jerarquía de roles**, a diferencia del de un negocio:
cualquiera edita, resetea la contraseña o da de alta a cualquiera, porque ya es el mismo círculo
de confianza. La única regla real (`lib/auth/reglas-superadmin.ts`) es la que impide los dos
accidentes que dejan a la plataforma sin nadie que pueda entrar: quitarse el acceso a uno mismo, y
quitarle el acceso al último que queda. Quitarle a alguien la marca de superadministrador revoca
solo sus sesiones de tipo `SUPERADMIN` (`revokeAllSessions(userId, "SUPERADMIN")`): si esa persona
además es cliente de algún negocio, esa sesión no tiene nada que ver con esto y sigue viva.
Resetearle la contraseña sí revoca todo, sin filtrar por tipo: la contraseña cambió, así que toda
sesión que dependía de ella tiene que morir.

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

**El precio vive en `ListaDePrecios`, no en el código.** Es una tabla de la plataforma —no de un
negocio— que edita el superadministrador en `/superadmin/precios`. Una fila sin fechas es la lista
base; una fila con fechas es una promoción y le gana a la base mientras esté en su ventana. Antes el
precio estaba escrito a mano en seis archivos y ya habían divergido: el schema decía 50.000, el alta
de la segunda sede 30.000, y la portada calculaba con `* 0.9` y `* 0.8`.

Toda la aritmética está en `lib/billing/precios.ts`, puro y con 30 tests; la consulta a la base, en
`lib/billing/lista.ts`. **Nunca escribir un precio a mano en una pantalla**: se cotiza con
`cotizar()`, que es lo que garantiza que la portada prometa lo mismo que cobra el checkout.

**El descuento son meses de regalo, no un porcentaje**: 6 meses se pagan 5 y 12 se pagan 10. Un
porcentaje sobre pesos enteros deja centavos que hay que redondear en algún lado, y "un mes de
regalo" se explica sin calculadora.

**`Subscription.priceCop` protege de las SUBAS, no de los descuentos** (`listaParaNegocio`): quien
entró pagando menos conserva su precio cuando la lista sube, pero una promoción vigente le gana igual
—una promo es una lista completa, no un descuento que se apile sobre otro precio—.

**Un pago dice cuántos meses compró.** `aplicarPagoAprobado(sub, pagadoEn, meses)` **exige** el
parámetro a propósito: antes sumaba `addMonths(desde, 1)` fijo, la cantidad no viajaba a ninguna
parte y pagar un año daba un mes sin que nada fallara ni quedara registro. Los meses van en la
`metadata` de la preferencia —que escribe el servidor, no el cliente— y `mesesSegunMonto` los deduce
del monto como red. Ante la duda se aplica **lo menor**: equivocarse de menos se arregla con un
mensaje a soporte; de más es plata regalada que nadie audita.

**El intento de pago se registra ANTES de salir a MercadoPago**, con su `mpPreferenceId`: si el
webhook nunca llega o la persona abandona el checkout, queda la fila que soporte necesita mirar.

**Extender una licencia tiene que destrabar.** `estadoSegunFechas` deja `SUSPENDIDA` congelada a
propósito, pero el cron marca así a todo lo que pasó la gracia: sin un caso especial, soporte
regalaba 30 días y el negocio seguía bloqueado. `extenderLicencia` revive solo si
`Business.status === "ACTIVO"`; lo que suspendió soporte a mano se reactiva desde su propia pestaña.

**La licencia es de la CUENTA, no de la sede** (`lib/billing/cuenta.ts`). El modelo no tiene tabla de
cuenta —cada `Business` tiene su `Subscription`— y la cuenta es implícita: las membresías de
PROPIETARIO de una persona. La **principal** es la sede más vieja y es la única que cobra; un pago
aprobado sincroniza las fechas de todas (`sincronizarSedes`). Sin eso, como el precio depende de
cuántas sedes hay, cada sede cotizaba `50.000 + 30.000×(n−1)` por separado y **dos sedes salían
$160.000 en vez de $80.000**.

**`tenantDb` pisa el `businessId` que le pases en un `create`** (`withScope` lo esparce al final).
Por eso los pagos se escriben con `rootDb`: pertenecen a la sede principal, que puede no ser la
activa, y con `tenantDb` habrían quedado en la sede equivocada sin ningún error.

**La sede adicional se compra primero y se crea después.** `comprarSedeAdicional` cobra el prorrateo
de lo que queda del período y el webhook solo hace `maxBranches: { increment: 1 }` —una operación
mínima e idempotente por el `mpPaymentId` único—; recién entonces `crearSucursalAdicional` deja
crearla. Fabricar un negocio entero desde un aviso HTTP, con su configuración, sus impuestos y su
membresía, es plata cobrada sin servicio si algo falla a mitad de camino. Antes la segunda sede era
**gratis**: la guarda decía `cantActual >= maxPermitidas && maxPermitidas >= 2` y con el
`maxBranches` de fábrica en 1 la segunda parte era falsa. Y la sede nueva **hereda las fechas de la
cuenta** con `priceCop: 0`; antes nacía con siete días de prueba propios y su propio precio, o sea
que vencía en otro momento y se cobraba aparte.

### Cobro automático y avisos

**El débito automático es otra API de MercadoPago**: `preapproval`, no Checkout Pro
(`lib/billing/preapproval.ts`). Trae dos avisos nuevos al webhook —
`subscription_preapproval` cuando la autorización cambia de estado y
`subscription_authorized_payment` en cada cobro—, y el webhook los acepta explícitamente: cualquier
tipo que no esté en la lista se contesta 200 y se ignora, que es lo que hace que MercadoPago deje de
reintentar.

Un cobro recurrente avisa con el id de una **factura** (`authorized_payment`), no con el del pago.
Hay que resolverla primero (`consultarFacturaDeSuscripcion`) y recién ahí entra al camino de
siempre. Ese pago **no trae nuestra metadata** —la autorización no la propaga a cada cobro—, así que
la cantidad de meses la deduce `mesesSegunMonto` del monto: es exactamente para eso que existe esa
red.

**El primer débito se agenda para el fin del período ya pagado.** Quien lo enciende faltándole
veinte días no puede terminar pagando dos veces por los mismos veinte días.

**Cancelar el cobro NO apaga la licencia**: lo pago se usa hasta el final y después entra la gracia
normal. Cortar el servicio en el momento sería cobrar por días que no se dan, y es lo que hace que
la gente le tenga miedo al botón de cancelar. Por eso el botón está a la vista desde antes de
activar y dice qué pasa al usarlo.

**Si el débito se cae** (tarjeta vencida, sin cupo), MercadoPago pausa la autorización: el webhook
apaga el cobro automático de este lado y la pantalla vuelve a ofrecer el pago manual, en vez de
decir "se cobra solo" mientras no se cobra nada.

**Los avisos de vencimiento salen del cron diario**, a 3 días del corte y el día del corte
(`lib/billing/avisos-licencia.ts`, puro y con tests). La idempotencia va en `ultimoAvisoClave`, que
guarda `"<fecha de corte>:<umbral>"`: al renovarse la licencia la fecha cambia y los avisos del
período nuevo vuelven a salir **solos**, sin que nadie tenga que limpiar una marca. Con un booleano
habría que acordarse de apagarlo en cada pago, y el día que alguien se olvide el cliente deja de
recibir avisos para siempre sin que nada falle. Con cobro automático encendido **no se avisa**: se
va a cobrar solo.

**`lib/email/enviar.ts` no importa `server-only`**, por la misma razón que `lib/env.ts`: el cron es
Node plano y `server-only` lanza fuera de la condición `react-server`. La guarda real es el
`typeof window`.

**Lo que no pasa por `defineAction` verifica la licencia a mano.** `crearPedidoClienteQR` es pública
—la usa un comensal sin sesión— y no tenía ningún chequeo: un negocio vencido siguió recibiendo
pedidos por QR indefinidamente. Misma clase de olvido: `crearNegocioPropio` validaba "ya tenés
negocio" solo en la página, y una Server Action es un POST alcanzable con curl.

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

## Marca (Dark Kitchen-Fire)

La paleta cromática se basa en el acero inoxidable de cocina, el papel de tirilla térmica, la tinta de impresión y el fuego de las brasas:
- **`--tinta: #171512`**: Fondo principal oscuro (hierro fundido y carbón).
- **`--papel: #EDE7DA`**: Texto principal, fondos de ticket y alto contraste.
- **`--brasa: #FF4E1F`**: Acento institucional, fuego de cocina, alertas y sellos (mapeado a `--brand` y `--primary`).
- **`--acero: #3A3733`**: Paneles secundarios, tarjetas y superficies de soporte (`--panel-bg`, `--panel-2`, `--panel-3`).
- **`--linea: #C9C2AF`**: Líneas guía punteadas, bordes y **texto** secundario / bajadas.

**`--muted` es superficie, `--muted-foreground` es texto.** Esto ya se rompió tres veces: `--muted`
estaba apuntando a `--linea` —un beige de texto— así que cada `bg-muted` pintaba un bloque casi
blanco sobre el fondo oscuro. Hoy `--muted` es `--panel-2` y el beige vive solo en
`--muted-foreground`. Nunca escribir `text-[var(--muted)]`: es `text-muted-foreground`.

**Los campos tienen pozo.** `--input-bg` (acero 26% sobre tinta) y `--input-bg-focus` existen y hay
que usarlos: un campo tiene que ser MÁS oscuro que el panel que lo contiene. `bg-input/20` da un
beige al 3%, o sea nada, y el campo desaparece.

**Nada de paletas crudas de Tailwind.** No hay `emerald-`, `amber-`, `rose-`, `slate-` en la
interfaz: para estado va la tríada semántica `success` / `warning` / `destructive` / `info`, cada
una con su variante `-soft` para TEXTO sobre fondo oscuro (la sólida es para rellenos, y ahí el
texto va en `-foreground`).

Sistema tipográfico:
1. **Display (Títulos & Números Gigantes)**: `Big Shoulders` (`--font-display` / 900 Black) para
   números de mesa, encabezados de comanda y contadores de turno. El manual la llama *Big Shoulders
   Display*, que es como se llamaba en Google Fonts antes de que absorbieran la superfamilia: **no
   existe un `Big_Shoulders_Display` que importar**, el build falla.
2. **Body (Lectura en Piso)**: `General Sans` (`--font-sans` / 400, 500, 600, 700). Viene de
   Fontshare, no de Google, así que los `.woff2` viven en `app/fonts/` y se cargan con
   `next/font/local`: sin pedido a un tercero, que es lo único que funciona cuando la PWA arranca
   sin red. No poner `font-feature-settings` de Inter (`cv02`…`cv11`): General Sans no los tiene.
3. **Monospaced (Dinero COP & Tiempos)**: `Space Mono` (`--font-mono` / 400, 700 con
   `.numeral tabular-nums`) para moneda colombiana, cronómetros y sellos.

**La escala son seis pasos y no se inventa uno nuevo.** Había veinte tamaños, ocho de ellos valores
sueltos en píxeles (9, 9.5, 10, 10.5, 11, 11.5, 12, 13) que a la vista son el mismo tamaño pero no
coinciden en ninguna línea: eso es lo que se lee como desprolijo. Están redefinidos en `@theme`, así
que se usan por su nombre de Tailwind:

| clase | px | para qué |
|---|---|---|
| `text-rotulo` | 11 | mono en versalitas: rótulo de sección, chip, sello |
| `text-xs` | 13 | dato denso: metadato, pie de tarjeta |
| `text-sm` | 15 | **el cuerpo** |
| `text-base` | 17 | lo que se lee primero: nombre de plato, renglón |
| `text-lg` | 20 | título de tarjeta o panel |
| `text-xl` | 24 | número de mesa dentro de una tarjeta |

`text-2xl` y para arriba también están redefinidos: con los de fábrica, `xl` y `2xl` caen los dos en
24px. Nada de `text-[13px]` ni parecidos — si hace falta un tamaño que no está, falta una decisión,
no una clase.

**Cuándo va cada letra.** Display solo para identificadores (número de mesa, de turno, título de
pantalla). Mono para **cifras, horas y sellos**, nunca para una frase: una oración en monoespaciada
se lee letra por letra, y así estaban las bajadas de los KPI de informes. Y cuando una cifra lleva
palabra —"12 pedidos"— el número va en `.numeral` y la palabra en General Sans, aparte: en mono, el
ancho fijo separa la palabra de su número como si fueran dos datos.

**No poner `font-display` y `.numeral` en el mismo elemento**: las dos declaran la familia y se
pisan. Ese bug estaba en la tarjeta de KPI.

### El menú despliega las secciones de cada módulo

Los módulos que por dentro son varias pantallas —Caja, Informes, Inventario, Configuración—
declaran sus `secciones` en `app/(app)/navegacion.ts` y el menú las abre cuando el módulo está
activo. Antes esas vistas solo existían como una tira de pestañas adentro de la pantalla: para saber
que Inventario tenía Proveedores había que entrar y mirar.

**La sección viaja en la URL** (`?vista=`), porque un enlace del menú no puede apuntar a un
`useState`. `lib/vista-en-url.ts` es el hook compartido: usa `replace` y no `push` —cambiar de
pestaña dentro de un módulo no es navegar, y con `push` habría que apretar "atrás" seis veces para
salir de Configuración— y omite el parámetro cuando es la vista por defecto, así que `/caja` y
`/caja?vista=cobros` se escriben igual.

Se perdió una comodidad a propósito: Caja arrancaba en "movimientos" cuando no había cuentas por
cobrar. Una pestaña que cambia sola según los datos no se puede enlazar, porque el mismo enlace
llevaría a lugares distintos según la hora.

**Configuración salió de Administración** y quedó al mismo nivel: adentro tiene siete pantallas, y
dejarla como sub-ítem habría anidado un acordeón dentro de otro, tres niveles en una barra de 240px.
La licencia es una de esas siete y ya no está suelta en el menú: es un parámetro del negocio, no una
pantalla de trabajo.

**Colapsada, la barra apila.** El encabezado y el pie ponían su contenido en fila, y en 80px de
ancho —48px útiles arriba, 56px abajo— no entraban: el botón de colapsar y el de cerrar sesión se
salían del borde. Con `flex-col` entran los dos.

### Las categorías se pliegan

`components/marca/seccion-plegable.tsx` agrupa productos por categoría en el POS y en el menú QR.
En un teléfono, una carta de 18 productos en lista corrida muestra tres platos por pantalla y el
resto es fe. La animación va por `grid-template-rows: 0fr → 1fr`, que es lo único que llega a la
altura real sin medirla con JS: nada de `max-height` con un número inventado que recorta la última
tarjeta cuando la categoría crece. Plegado se usa `inert`, no `hidden` —`display:none` cortaría la
animación en seco—, y en el menú QR la primera categoría abre abierta, para que al escanear se vea
comida y no una lista de títulos cerrados.

Las piezas de marca se usan por `components/marca/logo.tsx`: `Logo`, `Logotipo` e `Isotipo` (silueta
de tirilla térmica dentada de 22 picos con monograma "P" y acento Brasa). La composición de una
pantalla sale de `components/marca/pantalla.tsx`: `EncabezadoPantalla`, `RotuloSeccion`, `Panel` y
`Vacio`. **Un `h1` no se escribe a mano**: si no, vuelven a convivir dos convenciones —el display en
mayúsculas del manual y el `text-2xl font-semibold` de shadcn—, que es lo que había.

### Responsive: dos puntos de quiebre propios, y ninguno es de Tailwind

El prototipo conmuta en 1020 y 1180, no en los `md`/`lg`/`xl` de fábrica. Están declarados en
`@theme` y se usan como variantes:

- **`tableta:` (1020px)** — de acá para arriba existe la barra lateral; abajo es cajón. Con el `md`
  (768px) que había antes, una tablet vertical de 820px se comía 256px de barra y dejaba el área de
  trabajo en ~564px: lo peor de los dos mundos.
- **`doble:` (1180px)** — de acá para arriba caben dos columnas; abajo, el panel pegajoso se vuelve
  estático y la pantalla pasa a una sola columna.

**El mínimo táctil son 44px y se cumple solo.** Hay una regla en `@layer base` que se lo pone a
`button`, `select`, `input`, `textarea`, `[role=button]` y `[role=tab]` por debajo de 1020px.
Escribir alturas al revés —`h-9 sm:h-10`, o sea 36px justo en el teléfono— es el error que se
repetía. Para el control que de verdad tiene que ser chico está `.tap-libre`.

`scripts/revisar-viewports.ts` mide las dos cosas que no se ven leyendo código —desborde horizontal
y controles por debajo de 44px— en los nueve tamaños del handoff:

```bash
pnpm tsx --env-file=.env scripts/revisar-viewports.ts --url http://127.0.0.1:3000
```

### El menú QR es la excepción

`app/m/[slug]/` no se apoya en `--tinta`: **el fondo y el acento los elige cada negocio**
(`qrMenuBgColor`, `qrMenuBgGradient`, `qrMenuAccent`). Por eso ahí las superficies son capas
translúcidas —se adaptan a cualquier fondo— y los textos son papel con alfa (`--qr-texto`,
`--qr-texto-2`, `--qr-texto-3`), nunca un gris fijo: sobre un fondo desconocido, un `slate-400`
puede caer en cualquier contraste, y esto se lee en la calle con sol.

De qué color va el texto ENCIMA del acento lo calcula `lib/contraste.ts` (`textoSobre`), y si el
acento es demasiado oscuro para escribir con él sobre el fondo, `acentoSirveComoTexto` lo detecta y
se aclara con `mezclarHacia`. Escribir `text-white` sobre el acento es un error: hay acentos claros
—el ámbar y el celeste de los presets— donde queda ilegible.

## Estructura

```
middleware.ts            chequeo optimista de cookie, SIN tocar la base de datos
prisma.config.ts         configuración de la CLI de Prisma 7
prisma/schema.prisma     modelo de datos    prisma/migrations/    prisma/seed.ts
generated/prisma/        cliente generado (ignorado por git)
app/(auth|onboarding|app|superadmin|bootstrap|bloqueado)/   grupos de rutas
app/imprimir/            HTML limpio para @page 55mm/80mm
app/turnero/             el televisor del salón: fuera de (app), sin barra de navegación
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
