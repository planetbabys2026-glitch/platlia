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

Toda la aritmética está en `lib/billing/precios.ts`, puro y con tests; la consulta a la base, en
`lib/billing/lista.ts`. **Nunca escribir un precio a mano en una pantalla**: se cotiza con
`cotizar()`, que es lo que garantiza que la portada prometa lo mismo que cobra el checkout. La
pantalla de licencia tenía los planes escritos en el JSX y ya mentían: anunciaba "$270.000 semestral
con 10% de descuento" cuando el sistema cobra $250.000, porque el descuento son meses de regalo.

**El descuento son meses de regalo, no un porcentaje**: 6 meses se pagan 5 y 12 se pagan 10. Un
porcentaje sobre pesos enteros deja centavos que hay que redondear en algún lado, y "un mes de
regalo" se explica sin calculadora.

**No hay precio por empresa: la lista es la única fuente.** Si la lista sube, sube para todos; lo
único que mueve el precio por un tiempo es una promoción, y alcanza por igual a los clientes viejos y
a los nuevos. Antes cada `Subscription` guardaba un `priceCop` que se congelaba al registrarse y le
ganaba a la lista —para respetarle la tarifa a los primeros clientes—, con dos efectos malos: el
número que cobraba el sistema no estaba en ninguna pantalla editable (nacía solo y solo se cambiaba
por SQL), y la pantalla de licencia terminaba anunciando la tarifa congelada de ESA cuenta como si
fuera el plan público. La columna ya no existe.

**Una promoción se anuncia, y se puede cortar.** `AvisoPromocion`
(`features/facturacion/components/aviso-promocion.tsx`) va en las tres pantallas que
muestran precio —portada, licencia y checkout— y dice siempre lo mismo: cuánto es, contra cuánto, y
hasta cuándo. Sin eso una promo se ve igual que la tarifa de siempre: el número baja sin explicación
y, cuando termina, sube solo y parece un error de facturación. Por eso `preciosVigentes()` devuelve
la vigente **y** la base: con una sola no hay contra qué comparar. Y `detenerPromocion` existe aparte
de "guardar con la casilla apagada" porque cortar una promo es urgente y no puede exigir revisar
precios, tramos y fechas para llegar a una casilla al pie del formulario.

**La ventana de una promoción se guarda en hora de Colombia, no UTC.** Un `<input type="date">`
entrega `"2026-08-17"` y `new Date(...)` lo pone a medianoche UTC, que acá son las 7 de la tarde del
16: la promo empezaba y terminaba cinco horas antes de lo escrito, y el superadministrador ponía
"hasta el 31" mientras el cliente leía "hasta el 30". `desde` es `inicioDelDiaEnZona` y `hasta` es
`finDelDiaEnZona` —el arranque del día siguiente, exclusivo, que es como compara `listaVigente`—, así
que el día que se escribe cuenta entero. Para volver a mostrarlo hay que retroceder con
`diaFinalDeVentana`. La zona es `ZONA_PLATAFORMA`: la lista es de Platlia y no de un negocio, así que
no hay `BusinessSettings` del cual sacarla.

**De tres sedes para arriba manda un tramo, no la fórmula.** `TramoDePrecios` cuelga de la lista:
`desdeSedes` es el piso y no hay techo, así que gana el tramo de piso más alto que no supere la
cantidad de sedes —"3" cubre 3, 4 y 5 hasta que aparezca un "6"—. El tramo fija el mensual **entero**,
no un recargo que se sume. Sin tramos rige `principal + adicional × (n − 1)`, que es lo razonable
hasta dos locales. Todo pasa por `mensualDeLaLista()`: reconstruir el mensual a mano —como hacía
`aplicar-pago.ts`— hace que `mesesSegunMonto` no reconozca el monto de una cuenta con tramo y un pago
de un año se aplique como un mes.

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
cuenta**; antes nacía con siete días de prueba propios, o sea que vencía en otro momento y se cobraba
aparte.

### El cupo de sedes es la única fuente, también en prueba

`crearSucursalAdicional` tenía **dos** guardas y la primera cortaba antes de la segunda:

```ts
if (status === "PRUEBA") throw …        // bloqueo tajante
if (sedes >= maxBranches) throw …       // el cupo, que nunca se leía
```

Con eso, el cupo que el superadministrador le asignaba a una cadena en evaluación **se guardaba y no
servía para nada**: `/superadmin` mostraba `maxBranches: 3`, la cuenta seguía sin poder crear la
segunda sede, y como extender días a mano tampoco saca de `PRUEBA`, la única salida era pagar por
MercadoPago —justo lo que un cliente que está evaluando no va a hacer todavía—.

Ahora manda el cupo y nada más (`lib/billing/sedes.ts`, puro y con tests). La prueba nace con cupo 1,
así que por su cuenta sigue cubriendo una sola sede; lo que cambió es que un cupo asignado a mano
—decisión de soporte, con motivo y en `AuditLog`— ahora vale. El estado solo decide **qué dice el
mensaje**, que es lo único para lo que hacía falta.

**Y soporte puede activar la licencia sin cobro.** `extenderLicencia` recibe `activar`: extender días
no cambia el estado —alargar una prueba es alargar una prueba— así que la cuenta quedaba encerrada en
`PRUEBA` para siempre. Al activar se apaga `trialEndsAt` y se le da la gracia de una licencia normal:
sin eso `estadoSegunFechas` la devolvía a `PRUEBA` en el próximo recálculo, porque la cuenta seguía
teniendo fecha de prueba.

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
pedidos por QR indefinidamente. **El servidor MCP tuvo exactamente el mismo olvido** y se corrigió en
`autenticar()`: sin eso, una llave emitida antes del corte no caducaba nunca y un negocio vencido
—o suspendido a mano por soporte— seguía entregando sus ventas, sus costos y sus márgenes para
siempre. Misma clase de olvido: `crearNegocioPropio` validaba "ya tenés negocio" solo en la página, y
una Server Action es un POST alcanzable con curl.

## Facturación electrónica DIAN (Factus)

**La cuenta de Factus es UNA, de la plataforma.** Factus nos vende una bolsa de documentos y Platlia
la reparte entre los negocios. Las credenciales viven en el entorno (`FACTUS_CLIENT_ID`,
`FACTUS_CLIENT_SECRET`, `FACTUS_USERNAME`, `FACTUS_PASSWORD`, `FACTUS_URL`) y las lee
`lib/billing/factus-plataforma.ts`, el único archivo de esta familia que toca `lib/env.ts`: el
mapeador queda puro para poder probarlo, porque los tests corren en jsdom y `lib/env.ts` revienta a
propósito con `window` definido.

Antes estaban por negocio en `BusinessSettings`, en texto plano y editables por el dueño de cada bar.
Sacarlas de la base cierra el problema mejor que cifrarlas: una copia de la base ya no se lleva la
llave de la facturación de todo el mundo.

**Lo que sí es de cada negocio** es lo que la DIAN le autorizó a ESE NIT —`factusNumberingRangeId`,
`factusNumberingRangeIdNc`, `municipalityCode`— y **lo asigna el superadministrador** en
`/superadmin/facturacion`. La pestaña del cliente es de solo lectura: un rango mal escrito es una
factura rechazada que aparece recién al emitir, con alguien esperando en la caja.

**La bolsa se reparte contra algo.** `CompraDocumentosDian` es una tabla de plataforma —hermana de
`ListaDePrecios`— con cada paquete comprado. `getBolsaDocumentosDian()` da comprado / asignado /
consumido / **sin asignar**, y asignar más de lo que queda se rechaza. Antes se sumaban documentos
por negocio sin que estuviera escrito en ningún lado cuántos habíamos comprado.

### El payload: cuatro errores que costaban plata

`construirPayloadFactus` existía desde antes y **nunca se había ejecutado contra la API**. Lo que
estaba mal, verificado contra el sandbox:

1. **`price` iba con el impuesto adentro.** La DIAN pide el precio unitario SIN impuesto y se mandaba
   `unitPriceCop`, que en Colombia es el precio de carta con el impuesto incluido. Factus le sumaba
   el `rate` encima: una cerveza de $5.000 se facturaba $5.400. Va la base congelada del renglón,
   `lineSubtotalCop / quantity`.
2. **`cash_rounding_amount` no es el paso de redondeo del efectivo**, sino la diferencia entre lo que
   suman los pagos y el total de la factura (tope ±500). Se mandaba `settings.cashRoundingCop` (50)
   siempre.
3. **La propina no viajaba.** Como los pagos sí la incluyen, la diferencia se iba muy por encima de
   los ±500 y toda venta con propina habría sido rechazada. Va como un renglón sin impuesto
   ("Propina voluntaria"): la alternativa, `allowance_charges`, exige un `concept_type` del catálogo
   de la DIAN que no está documentado, y equivocarlo es una factura rechazada.
4. **`reference_code` llevaba el año en curso**, así que dos reintentos a caballo del 31 de diciembre
   eran dos documentos para la misma venta. Ahora se deriva solo del `order.id`, y es lo que permite
   recuperar un documento perdido.

Los totales no coinciden al centavo y está bien: nosotros sacamos el impuesto por diferencia
(`lib/tax.ts`, para que base + impuesto dé exacto el precio de carta) y Factus lo recalcula
multiplicando. Una venta de $5.000 se factura $5.000,40 y los 40 centavos son el ajuste de redondeo.
`totalesDeFactura()` reproduce la aritmética de Factus para poder afirmar eso con un test en vez de
con fe.

**`taxKindSnapshot` se congela en `OrderItem`.** La DIAN separa IVA (`01`) de impuesto al consumo
(`04`), y el `kind` solo vivía en `TaxRate`, alcanzable únicamente por el producto ACTUAL: facturar
leyendo de ahí sería declarar una venta vieja con la tarifa de hoy.

### La nota crédito es otro endpoint, no otro `document`

Mandarla a `/v2/bills/validate` con `document: "03"` y `related_documents` la rechaza —"El campo id
rango de numeración es inválido"— porque ese endpoint solo acepta rangos de factura de venta. Va a
**`/v2/credit-notes/validate`**, referencia la factura por `bill_number` (no por documento
relacionado), lleva `correction_concept_code` y `customization_id: "20"`, y usa **su propio rango**:
en la cuenta de Factus, "Factura de Venta" y "Nota Crédito" son resoluciones distintas.

**Una nota crédito trae CUDE, no CUFE.** Leer solo `cufe` guardaba como error una nota que la DIAN sí
había validado: el documento existía y el sistema no se enteraba, que es el peor estado posible. Lo
resuelve `identificadorDian()`.

**`GET /v2/numbering-ranges` responde `{ data: { data: [...] } }`**, envuelto dos veces. Leer solo el
primer `data` devolvía siempre una lista vacía, y una lista vacía se parece demasiado a "la cuenta no
tiene rangos" como para notarlo.

### Emitir: tres reglas

1. **La llamada a Factus va FUERA de toda transacción.** Una transacción abierta contra la red es un
   lock de base esperando a un tercero que habla con la DIAN.
2. **La venta se reclama antes de salir**, con un `updateMany` condicionado: dos clics en el botón
   son dos facturas ante la DIAN. Ojo con SQL: `NOT (estado = 'EMITIENDO')` da NULL —no `true`—
   cuando la columna es nula, así que la condición necesita un `OR estado IS NULL` explícito o
   rechaza justamente la primera factura de cada venta. El reclamo caduca a los dos minutos para que
   un proceso muerto no bloquee la venta para siempre.
3. **Si la respuesta se pierde, se busca el documento por su `reference_code`**
   (`buscarDocumentoPorReferencia`). Sin esa segunda vuelta queda un documento vivo ante la DIAN que
   el sistema no registró y que el reintento no puede recrear.

El paquete se descuenta con el CUFE/CUDE en la mano, nunca antes. `documentosEmitidosConsumidos`
existía desde el principio y no se incrementaba en ningún lado.

**`data.errors` de la respuesta no significa rechazo**: la DIAN manda notificaciones (FAJ44b, RUT01)
que conviven con una factura válida. Lo que decide es `is_validated`.

### En la tirilla

Una venta facturada imprime número, CUFE y **el QR**, generado con `qrcode` como SVG en el servidor.
El resto de la aplicación arma sus QR con `api.qrserver.com`, que para una pantalla está bien; para
la tirilla no, porque la estación de impresión de un bar suele estar en una red sin salida y un QR
que no carga es un papel que no sirve.

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

**Los ejecutables del agente de impresión no viajan con el despliegue.** `public/descargas/`
está en `.gitignore` —son ~7 MB por sistema— y la imagen no trae Go (`providers = ["node"]`), así
que en el VPS esa carpeta llega vacía. Hay dos salidas y **la de fábrica es la segunda**:

1. **Publicarlos**, y ahí sirve el botón de descarga con el código en el nombre. Van a un
   volumen del VPS (`DESCARGAS_AGENTE_DIR`) o a un hosting estático cualquiera —Cloudinary, S3,
   un release de GitHub— con una URL por sistema (`DESCARGAS_AGENTE_URL_WINDOWS`, `_LINUX`,
   `_MAC`). La URL le gana a la carpeta: si alguien la configuró es porque ahí está el binario al
   día, y uno viejo olvidado en el volumen sería un agente desactualizado instalándose sin que
   nadie lo note.
2. **No publicarlos** y que la instalación la haga nuestro equipo, con el ejecutable en la mano y
   el `agente.json` que entrega **Configurar a mano**. El servidor deja de repartir binarios.

**Con una URL, el archivo se retransmite; no se redirige.** Parece un rodeo —los 7 MB pasan por el
servidor— y es la razón de ser de la ruta: el código de emparejamiento viaja en el **nombre** del
archivo y ese nombre lo pone nuestro `Content-Disposition`. Un `302` al hosting entrega el archivo
con el nombre que tenga allá, sin código adentro, y el doble clic deja de alcanzar. El efecto
secundario es útil: del otro lado el archivo puede llamarse de cualquier manera, así que si el
hosting no acepta subir un `.exe` se sube sin extensión y sale con la que va. Y el hosting caído
contesta **502**, distinto del 404 de "no está publicado": son dos problemas que arregla gente
distinta.

El panel **dice cuál de las dos está pasando**: sin ejecutables no esconde los botones —eso era
un equipo registrado, un código a la vista y ningún archivo, sin una palabra sobre por qué— sino
que ofrece el archivo de configuración.

Separarlo del build no es solo por Go: la URL del servidor va **horneada** en el binario, así que
actualizarlo es reemplazar un archivo, no volver a desplegar la aplicación.

## Conexión con IA (MCP)

Un negocio puede darle a su asistente —ChatGPT, Claude, el que use— acceso a **su** información y
preguntarle en lenguaje natural. El servidor vive en `app/api/mcp/route.ts` y habla JSON-RPC 2.0,
que es lo que pide el Model Context Protocol: `initialize`, `tools/list`, `tools/call`.

**Está escrito a mano y no con el SDK oficial**: son tres métodos, y el SDK trae su propio manejo de
transporte que pelea con el ciclo de vida de una ruta de Next. Adaptarlo costaba más que los cien
renglones que ocupa, y con una dependencia más en el arranque.

**El `businessId` sale del TOKEN, nunca de los argumentos.** Es toda la separación que hay entre la
información de un negocio y la de otro, así que en ese archivo no existe un solo camino donde el id
venga de algo que mandó el cliente. Es el mismo esquema del agente de impresión y del webhook de
MercadoPago: ruta pública en el `middleware` que **se autentica sola**, porque del otro lado no hay
navegador y no va a haber cookie. De `TokenIa` se guarda **solo el hash** —SHA-256, no argon2: son 32
bytes aleatorios y esto se verifica en cada pregunta— y el prefijo `plt_ia_` está para que un token
pegado por error en un repositorio lo detecten los escáneres de secretos.

`TokenIa` tiene `businessId`, así que **va en `lib/db/tenant-models.ts`**. El test de scoping lo
atrapó al agregarlo, que es exactamente para lo que existe: sin esa línea, `tenantDb` no le habría
puesto el `businessId` al `where` y un negocio podría revocar las llaves de otro.

**Las siete herramientas son de solo lectura, y eso es una decisión de seguridad, no una etapa.** El
radio de daño de un asistente confundido —o de un token filtrado— tiene que ser "alguien vio mis
números", nunca "alguien me anuló la noche". Un agente que se equivoca al leer da una respuesta mala;
uno que se equivoca al escribir arruina una caja.

**No sale un solo dato de comensal**: ni nombres, ni teléfonos, ni direcciones de entrega. Esa
información es de terceros que se la dieron al restaurante, no al proveedor de IA que el restaurante
eligió; mandarla afuera sin consentimiento es justamente lo que la ley de habeas data no permite.
Todo lo que sale es agregado.

**No hay SQL nuevo**: las herramientas llaman a las mismas funciones de `features/informes/queries.ts`
que pintan la pantalla de Informes. Si "ventas" se calculara distinto acá, el dueño tendría dos cifras
y ninguna confiable, que es peor que no tener el módulo.

Se devuelve **texto ya formateado**, no JSON crudo: quien lo lee es un modelo que va a repetirlo casi
tal cual, y `$1.250.000` se lee mejor que `1250000`. Por lo mismo, `initialize` avisa en sus
`instructions` que la jornada **no termina a medianoche**: sin eso el asistente interpreta "hoy" como
el día del calendario y contesta un número que no coincide con el arqueo.

Los errores se registran y **no se devuelven**: del otro lado hay un modelo que repite lo que reciba,
y una excepción de Prisma le contaría a quien pregunte cómo está hecha la base. Es la misma regla que
el menú QR.

**La licencia se verifica en cada llamada, dentro de `autenticar()`.** `Business.status` y
`licenciaVigente(subscription)` se miran por separado porque son dos decisiones distintas: una es el
cobro y la otra es soporte suspendiendo la cuenta a mano. Se contesta **403 y no 401** —el token está
bien, volver a emitirlo no arregla nada— y acá sí se dice cuál es el problema, al revés que en el
menú QR: allá el que lee es un comensal y enterarlo expondría al negocio delante de su cliente; acá
el que lee es el dueño, que es quien puede resolverlo.

**Una llave es de UNA sede.** En este modelo cada `Business` es una sede, así que el token apunta a
una sola y no hay forma de que vea otra: verificado mandando el `businessId` de una sede en los
argumentos de una herramienta con la llave de la otra —se ignora, porque el id sale del token—. La
dirección del servidor, en cambio, es la misma para todas, y eso hay que decirlo en pantalla: en el
cliente de IA las dos conexiones se ven idénticas, así que con más de una sede la pantalla nombra de
cuál es la llave. Con una sola no lo dice: sería ruido.

### Un cliente de IA moderno no acepta que le peguen un token

La llave que se copia a mano desde Configuración sirve para lo que deje poner una cabecera propia.
Claude.ai no: hace el **descubrimiento** del protocolo —pega en `/api/mcp` sin credencial, lee de la
respuesta a dónde ir a pedirla, da de alta su aplicación solo, manda a la persona a aprobar y recién
ahí canja un código por el token—. Sin esas rutas adivina `/authorize`, se encuentra un 404 y no hay
forma de conectar. Pasó tal cual.

Son seis piezas y la cadena se corta si falta cualquiera:

| Ruta | Qué hace |
|---|---|
| `401` de `/api/mcp` con `WWW-Authenticate: … resource_metadata=…` | **arranca todo**: sin esa cabecera no hay descubrimiento |
| `/.well-known/oauth-protected-resource` (y `…/api/mcp`) | a qué servidor pedirle permiso (RFC 9728) |
| `/.well-known/oauth-authorization-server` | dónde queda cada endpoint (RFC 8414) |
| `/api/oauth/register` | la aplicación se da de alta sola (RFC 7591) |
| `/authorize` | **la única pantalla**: el dueño aprueba, y elige la sede |
| `/api/oauth/token` | canje del código y renovación |

**Las dos variantes del documento de recurso tienen que existir.** El RFC define la forma con el
camino del recurso pegado atrás y hay clientes que solo prueban esa: con una sola, el descubrimiento
funciona o no según con qué se conecte.

Los nombres de esas rutas van **en inglés**, a diferencia del resto del producto: son superficie del
protocolo, no del producto, y un cliente que no encuentre el documento las adivina —y lo que adivina
es exactamente eso.

**Registrarse no da acceso a nada.** Se consigue un identificador y la promesa de que el código va a
viajar a la dirección registrada; el acceso lo da un dueño aprobándolo, y solo a la sede que elija.
No hay secreto de cliente porque son aplicaciones que corren en el equipo de la gente y no pueden
guardarlo: lo que las ata es PKCE y la dirección de retorno.

Cuatro decisiones que sostienen el flujo, y las cuatro son fáciles de escribir mal:

1. **PKCE solo en `S256`.** `plain` está en el RFC y se rechaza: manda el verificador tal cual, así
   que ver pasar la petición alcanza para canjear el código.
2. **La dirección de retorno se compara ENTERA contra las registradas.** El código viaja en esa URL:
   aceptar una que el cliente no registró es mandarle el código al servidor de quien lo pidió. Nada
   de comodines ni de comparar solo el dominio.
3. **Cuando la dirección no está verificada, el error se muestra en pantalla y NO se redirige.**
   Mandar un `error=` a una dirección sin verificar sería usar a Platlia de trampolín hacia donde
   quiera el que armó el enlace.
4. **El código se quema en el mismo `updateMany` con que se reclama** —el patrón del reclamo de
   impresión y de la guarda anti-doble-emisión ante la DIAN—: leerlo primero y marcarlo después da
   dos llaves por dos canjes simultáneos del mismo código.

**`GET /api/mcp` contesta 405, y eso es lo correcto.** En este transporte el `GET` es cómo un cliente
abre el canal por el que el servidor le habla a él; acá no se ofrece —las siete herramientas
contestan en el momento y no hay nada que empujar—. Antes devolvía un 200 con un JSON descriptivo,
que es peor que no contestar: el cliente pide un flujo de eventos, recibe otra cosa con código de
éxito, y se queda esperando.

**La versión del protocolo se negocia.** Estaba fija en la de 2024; un cliente actual pide la suya,
se le contesta otra, y algunos cortan ahí. Se devuelve la pedida cuando está en `VERSIONES` —nuestra
superficie son tres métodos de solo lectura, que no cambiaron entre esas revisiones— y la nuestra si
no.

**Los códigos usados y vencidos los barre el cron diario** (`pnpm cron:subs`), con un día de gracia:
si algo salió mal durante una conexión, el rastro del día tiene que seguir estando para mirarlo.

**No registrarse NO es motivo para cortar** (`decidirSobreCliente`, puro y con tests). El alta
automática está y funciona, pero no todos los clientes la usan: en Claude.ai la opción *"usa tu
propio cliente OAuth"* manda el nombre escrito a mano y nunca pasa por el registro —con eso cortado,
conectar por ese camino era imposible y el mensaje mandaba a borrar y volver a agregar la conexión,
que no cambia nada—. Un `client_id` desconocido se acepta y queda **atado** a esa dirección de
retorno; desde entonces no puede apuntar a ningún otro lado. Lo peor que consigue alguien tomando un
nombre conocido antes que su dueño es dejárselo inservible: molesto, y nunca una filtración. El atado
lo escribe la **acción** al aprobar y no la página, que es un GET: si no, cualquier robot que siguiera
el enlace dejaría filas.

**Lo que de verdad protege es que el dueño vea A DÓNDE va el código**, y por eso la pantalla lo dice.
El registro previo protege menos de lo que parece: quien quiera robar el acceso puede registrar una
aplicación llamada "Claude" apuntando a su propio servidor y mandar el enlace igual. Lo único que
separa eso de lo legítimo es que en pantalla diga otra cosa que `claude.ai`.

**El refresco se rota en cada uso**, así que uno filtrado deja de servir en cuanto el cliente
legítimo renueva. Y **la llave de OAuth caduca a los 30 días mientras la manual no**: no es una
inconsistencia, del otro lado de una llave manual no hay nadie que sepa renovarla y caducarla sería
cortar la conexión sin que nadie se entere.

**El flujo sobrevive al ingreso.** `/authorize` es la única del flujo que NO va en la lista pública
del middleware —necesita una persona con sesión, y es la que decide—, y el middleware ya manda el
`desde` con la URL entera. Sin eso se aterriza en el panel y hay que empezar de nuevo desde el
asistente, con un error que del otro lado no explica nada. La página además maneja el caso que el
middleware no puede ver: cookie con firma válida pero sesión revocada en la base, porque el
middleware corre en edge y no toca la base a propósito.

**La pantalla de permiso dice quién pide, a qué sede y qué NO va a poder hacer.** Una pantalla que no
dice qué se está entregando entrena a la gente a aprobar sin leer, y después el clic no significa
nada. Con varias sedes hay que elegir una y no hay opción por defecto que sea la correcta.

**`autorizar` no pasa por `defineAction`** —justamente se está eligiendo la sede— así que las tres
verificaciones del wrapper van a mano: PROPIETARIO **de esa** sede, licencia vigente y dirección
registrada. Que la pantalla ya filtre las sedes vencidas no es la seguridad: es un POST alcanzable
con curl.

**`OAuthCode` tiene `businessId` y va en `lib/db/tenant-models.ts`; `OAuthClient` no lo tiene y va en
`GLOBAL_MODELS`** —cuando una aplicación se registra todavía no se sabe de qué sede va a ser la
llave—. El test de scoping obliga a clasificar cada modelo nuevo en una de las dos listas.

Las llaves las crea el **propietario** en Configuración → Conexión con IA, hasta cinco, y el token se
muestra **una sola vez**. La lista guarda `ultimoUsoEn`, que es lo que le permite al dueño reconocer
cuál apagar meses después: sin eso, revocar es adivinar entre cinco nombres.

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

**El chip de estado tiene sus tres variantes y no se pinta a mano.** Junto a `.chip.is-hot` viven
`.is-ok`, `.is-live` y `.is-wait` (éxito, en curso, en espera). El panel de preparaciones las escribía
con `emerald-500`, `cyan-400` y `amber-400` —tres paletas crudas, y el cian no existe en ningún otro
lado del producto—. El color va en la variante `-soft`, que es la que se lee como texto sobre el
fondo oscuro.

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
3. **Cifras (Dinero COP & Tiempos)**: `Space Grotesk` (`--font-mono` / 400, 500, 600, 700) para
   moneda colombiana, cronómetros y sellos. Es la hermana **proporcional** de Space Mono —mismo
   diseñador, mismo esqueleto—, así que el sistema no cambió de familia: cambió de ancho. Space Mono
   le daba a la "1" el mismo avance que a la "0" y una carta llena de precios quedaba con huecos que
   se leen como error de maquetado.

   **El token se sigue llamando `--font-mono` y ya no es monoespaciada.** Es el slot de Tailwind
   —renombrarlo obligaba a tocar 246 usos en 52 archivos y a que `tailwind-merge` dejara de
   reconocer la utilidad como familia tipográfica—, así que se conserva el nombre y se documenta acá.

   **Lo tabular hay que pedirlo, y está pedido una sola vez.** Medido en el navegador a 20px: sin
   `tabular-nums`, `"111"` mide 25.09px y `"000"` mide 38.47px —trece píxeles, o sea una columna de
   dinero con el borde derecho en serrucho—; con `tabular-nums`, las tres miden 37.20px. Por eso
   `globals.css` se lo pone a la **utilidad `font-mono` entera** y a `.chip`, `.rotulo-seccion` y
   `.eyebrow`, no solo a `.numeral`: el rol de esta letra ES la cifra, así que lo tabular es su
   comportamiento por defecto. Si dependiera de acordarse en cada renglón, alcanza un olvido para que
   una cuenta se desalinee sin que nada falle.

   **La tirilla impresa NO usa este token** (`app/imprimir/pedido/[id]`). Ahí `componerRecibo` rellena
   con espacios hasta un ancho en CARACTERES y el `width` va en `ch`: las dos cosas suponen que toda
   letra mide lo mismo, así que esa pantalla declara una monoespaciada de verdad a mano. Apuntarla a
   `--font-mono` torcería cada columna de cada recibo, y es un defecto que no se ve en pantalla: se
   descubre en el papel que se le entrega al cliente.

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

## Inventario: dos regímenes de stock, y son excluyentes

Un producto se mide de UNA de dos maneras, nunca de las dos:

| Régimen | Cuándo | Dónde vive el stock | Dónde vive el costo |
|---|---|---|---|
| **Directo** | reventa: una cerveza que se compra y se vende igual | `Product.trackStock` + `stockQty` | `Product.costCop` + `stockMin` |
| **Por receta** | lo que se prepara: un menú del día | `InventoryItem.stockCurrent` de cada insumo | la suma de la receta efectiva |

Lo elige el dueño marcando **"lleva receta"** al crear o editar el artículo, y por eso
`hasRecipe` es una declaración y no una consecuencia de que la tabla de recetas tenga filas
(`componerRecetaEfectiva` lo exige explícitamente).

**Contar la misma cerveza en los dos lados es el bug que originó todo esto.**
`crearProductoTerminado` creaba el `Product` con `stockQty` **y** un `InventoryItem` espejo unido
por una receta 1:1, pero sin marcar `hasRecipe`: la venta descontaba solo el primero y la compra
subía los dos, así que el insumo espejo trepaba para siempre y la valorización del inventario
inflaba el patrimonio del negocio sin techo. Hoy el alta de reventa crea un `Product` y nada más;
`guardarReceta` apaga `trackStock` y `guardarProducto` de la carta también, para que la
exclusividad no dependa de que alguien se acuerde.

**Comprar un insumo sube ese insumo y nada más.** `crearFacturaCompra` tenía una rama que, si la
línea no traía producto, buscaba *cualquier* plato con ese insumo en su receta y le subía el
`stockQty`: una bolsa de arroz fabricaba bandejas paisas de la nada. Una línea de factura apunta a
un insumo **o** a un producto directo; si vienen los dos ids manda el insumo.

**El costo es promedio ponderado y neto de impuesto** (`lib/inventory/costo.ts`, puro y con tests).
Antes cada factura pisaba `costCop` con el costo de la última compra: diez cervezas caras un martes
reevaluaban las veinte baratas que ya estaban en la nevera. Dos casos no son promedio y están
tratados aparte: sin costo previo se adopta el entrante entero —un cero casi nunca significa "me lo
regalaron", significa "nadie le puso precio"— y con el stock en cero o negativo no hay nada que
ponderar del lado viejo.

**Activar el inventario NO borra el stock.** La acción corría dos `updateMany` que ponían en cero
todos los insumos y todos los productos la primera vez que se prendía la casilla: quien cargaba su
bodega y después activaba el módulo la perdía entera. Poner en cero es una decisión del dueño, con
su pantalla de ajuste, no el efecto secundario de una casilla.

Las siete acciones de inventario exigen `inventoryEnabled` a mano. **No se usa
`modulo: AppModule.INVENTARIO`**: ese enum se enciende entero al crear la empresa y no se apaga
nunca, así que gatear por él no protege de nada. El interruptor real es el de Configuración.

### El descuento es atómico, y la pantalla lo dice antes del toque

**La guarda va en el `where` del update, no en un `if` antes.** Leer el stock y después
decrementarlo deja pasar a los dos meseros que agregan la última cerveza desde sus dos tablets, y el
stock termina en −1. Es el mismo `update` condicionado con el que se reclama un trabajo de impresión
o se evita la doble emisión ante la DIAN; Prisma contesta `P2025` cuando no encuentra la fila y eso
se traduce a `ErrorDeUsuario`. El chequeo previo sigue existiendo, pero por el **mensaje**: "no hay
pechuga" es accionable, "stock insuficiente" manda a alguien a revisar la bodega entera.

De paso, `stockAfter` del Kardex sale del valor que devuelve ese update y no de una resta sobre la
lectura vieja, que con dos ventas simultáneas escribía un saldo que nunca existió.

**El stock directo ahora también deja Kardex.** `InventoryMovement` tiene `productId` y su
`inventoryItemId` pasó a ser opcional: hasta acá todo el movimiento de `stockQty` —compras, ventas,
ajustes— pasaba sin dejar rastro, así que cuando el conteo físico no cuadraba no había nada que
revisar.

**Las cuatro puertas de venta descuentan, pero solo el POS lo mostraba.** El salón
(`app/(app)/pedido/[id]/carta.tsx`) recibía `stockQty`, `hasRecipe` y `recipeItems` desde `getCarta`
y miraba únicamente `isAvailable`: el mesero veía la tarjeta tocable, la tocaba, y el error le
llegaba parado en la mesa. El menú QR no tenía **ninguna** noción de stock, y su consulta ni
siquiera traía `trackStock`/`stockQty`. Las tres pantallas usan ahora
`calcularStockDisponibleProducto`, que devuelve `null` para lo que no se mide —distinto de cero—.

**`BusinessSettings.permitirVentaSinStock`** (apagado de fábrica) deja cobrar igual y el stock queda
**negativo**. El negativo es el punto: es lo que muestra el faltante en el arqueo, y clavarlo en
cero lo escondería.

**El QR rechaza, no descarta.** `crearPedidoClienteQR` hacía `continue` sobre un producto agotado:
el comensal tocaba confirmar, el pedido entraba sin ese renglón y nadie le decía nada —ni a él ni a
la cocina—, así que la primera noticia era la cuenta con un plato menos del que había pedido.

### La ganancia sale del costo congelado, no de la receta de hoy

`OrderItem.unitCostCopSnapshot` y `lineCostCop` se escriben al vender, por el mismo motivo que
`taxRateBpSnapshot`: reconstruir el costo cruzando el renglón con la receta ACTUAL haría que el
informe de marzo cambiara cada vez que un proveedor sube un precio en diciembre. El descuento de
stock corre **antes** del `orderItem.create` en los cuatro caminos, y de ahí sale el costo — hacerlo
después costaría un `UPDATE` extra por cada producto de cada pedido.

**`null` no es cero.** Significa "no se conocía el costo" (inventario apagado, producto sin costear)
y es lo que permite a `/informes?vista=costos` decir *"12 de 45 renglones sin costo"* en vez de
anunciar un margen del 100%. Con el inventario apagado la sección no existe en el menú y la pantalla
lo dice, en vez de celebrar como hace la vista de alertas.

**El margen se compara contra `lineSubtotalCop`, la base gravable, no contra `lineTotalCop`.** El
impuesto se cobra para entregarlo: contarlo como ingreso propio infla el margen del negocio entero.
Por eso también el costo de compra se guarda neto (`PurchaseInvoice.includesTax` ya desagrega la
base por línea): base contra base. `margenPorcentual` en `lib/money.ts` devuelve `null` sin ventas,
con la misma convención que `variacionPorcentual`.

### Un domicilio pasa por domicilios antes que por la cocina

`Order.deliveryStatus` es el enum `DeliveryStatus` y es **nullable**: lo que no es
un domicilio no tiene estado de reparto. Antes era un `String` con
`@default("PENDIENTE")`, así que **todos** los pedidos del negocio lo traían puesto
—una mesa incluida— y filtrar por esa columna devolvía el día entero; por eso las
consultas necesitaban un OR entre `type` y `channel`. Los valores válidos vivían
copiados a mano en tres archivos.

El recorrido es `POR_CONFIRMAR → EN_PREPARACION → LISTO → EN_CAMINO → ENTREGADO`,
más `CANCELADO`. Las reglas están en `features/domicilios/reglas.ts`, puras y con
tests: se avanza **de a un paso**, no se vuelve atrás, y se anula desde cualquier
punto menos entregado. Antes `actualizarEstadoDomicilio` escribía el string que le
mandaran, así que un POST directo saltaba de recién llegado a entregado sin pasar
por la cocina.

**`LISTO` es el estado que faltaba** y es el que decide que un domicilio aparezca
en caja. Antes la caja lo listaba desde que nacía: el cajero veía cuentas de comida
que todavía no existía.

Quién mueve cada paso, que es lo que no hacía nadie:

| Paso | Quién | Dónde |
|---|---|---|
| Entra `POR_CONFIRMAR` | el comensal, por QR | `crearPedidoClienteQR` |
| → `EN_PREPARACION` | domicilios, confirmando dirección y envío | `confirmarDomicilio` |
| → `LISTO` | **la cocina, sola**, al terminar el último renglón | `avanzarComanda` |
| → `EN_CAMINO` | **la caja, sola**, al facturar | `registrarPago` |
| → `ENTREGADO` | domicilios | `actualizarEstadoDomicilio` |

**Los domicilios por QR se abren y se cierran con el turno.**
`BusinessSettings.qrDeliveryEnabled` arranca **apagado** y lo mueve el cajero
(`abrirDomiciliosQr`). Es distinto de `deliveryEnabled`, que dice si el negocio
reparte —configuración, la decide el dueño—: esto dice si está recibiendo AHORA.
Sin esto un comensal mandaba un domicilio a las cuatro de la mañana, con la caja
cerrada y el local vacío; el pedido entraba perfecto y esperaba a que alguien lo
descubriera al otro día, con un cliente del otro lado que ya había dado su
dirección. La acción vive en `features/domicilios/` y no en `features/negocio/`
aunque escriba en `BusinessSettings`: la usa la operación, y un cajero no tiene
permiso de Configuración —dárselo para que pueda cerrar los domicilios a la
medianoche sería abrirle la puerta a todo lo demás—. El mismo componente
(`InterruptorDomiciliosQr`) se pinta en `/caja` y en `/domicilios` para que no
puedan mostrar estados distintos, y **manda el valor explícito, no un alternar**:
con dos personas tocándolo a la vez desde sus dos pantallas, un alternar deja el
estado al azar, y acá el azar es un local que se cree cerrado recibiendo pedidos.
Nada lo apaga solo al cerrar la caja: es un botón, no una consecuencia.

**El QR no manda un domicilio a la cocina.** `crearPedidoClienteQR` ponía
`sentToKitchenAt` en el mismo commit en que el comensal tocaba "enviar", así que la
comanda aparecía en la plancha con una dirección que nadie había leído. Ahora ese
sello lo pone `confirmarDomicilio`, que además es el único momento en que corregir
dirección, teléfono y `deliveryFeeCop` no cuesta nada —y recalcula el total en la
misma transacción—. Un domicilio que carga el negocio nace `EN_PREPARACION`: quien
lo tomó ya tiene la dirección delante.

**Despachar cierra la comanda** (`features/domicilios/despacho.ts`). El KDS muestra
todo renglón que no esté entregado, y en un domicilio no hay mesero que lo reciba:
sin esto, cada pedido despachado se quedaba en la pantalla de cocina para siempre.

**Anular delega en `anularPedido`.** Antes escribía `status: "ANULADA"` a mano, sin
motivo, sin quién, sin bitácora y **sin devolver el stock**: una anulación que no
devuelve el inventario descuadra el conteo sin que nadie se entere hasta el arqueo.

**El rastreo del comensal tiene su propia ruta.** El menú QR abría un `EventSource`
contra `/api/domicilios/stream`, que exige sesión y licencia: a un comensal le
respondía **401**, así que el rastreo solo avanzaba con el botón de refrescar y el
paso "tu pedido salió" no se veía nunca solo. Ahora va a
`/api/qr/pedido/[id]/stream`, que **no manda datos del pedido**: emite un "algo
cambió" y el cliente vuelve a pedir su estado con `consultarEstadoPedidoQR`, que es
la acción pública que ya decide qué se puede contar. Lo autoriza tener el id, que es
un cuid.

**La caja no es solo de las mesas.** `seccionesDeCaja` y `vistaInicialDeCaja` reciben
`cobraCuentas`, que es `usaMesas || usaDomicilios`. Atado a mesas, un negocio de puro
domicilio abría la caja y no veía nada por cobrar.

**Zonas de entrega y repartidores no existen** —ni modelo, ni columna, ni pantalla—
aunque el copy de `app/(app)/domicilios/page.tsx` los promete.

### El menú QR es una ruta pública: todo lo que llega por la URL es del cliente

**El slug identifica al negocio y es único** (`Business.slug @unique`, y los dos generadores buscan
uno libre antes de crear). Dos sucursales con el mismo nombre reciben slugs distintos, así que por
ahí no se mezclan pedidos.

**La mesa se resuelve en el servidor, contra `tenantDb`.** El QR trae
`?mesa=<nombre>&tableId=<id>`, y el nombre es **solo una etiqueta**: no se lee para nada. El id de
una mesa de otra sucursal no resuelve porque `tenantDb` le agrega el `businessId` al `where`.

Dos cosas que estaban mal y no fallaban:

- **El modo "pedido de mesa" se decidía por la etiqueta** (`esMesa = Boolean(mesaParam)`), así que
  `?mesa=cualquier+cosa` abría el flujo de mesa sin ninguna mesa detrás.
- **Un pedido de mesa cuya mesa no resolvía se creaba igual, con `tableId: null`.** Al mesero le
  llegaba una comanda que decía "mesa" y no decía cuál. Pasaba solo con un QR pegado a una mesa que
  el negocio archivó después, que es exactamente el pedido que parece mezclado. Ahora se rechaza, y
  la pantalla lo avisa al abrir en vez de dejar armar el pedido y fallar al confirmarlo.

**`consultarEstadoPedidoQR` exige el teléfono completo.** Buscaba con `code: Number(q)` y
`customerPhone: { contains: q }`: escribir "3" devolvía el pedido número 3 del negocio —de quien
fuera— con nombre, teléfono y dirección de entrega. Escribir 1, 2, 3… era leer la agenda del día
entera. El número de pedido dejó de servir para consultar; para el pedido recién hecho —y para el de
mesa, que no tiene teléfono— se consulta por el `id`, que es un cuid y no se adivina probando.

**`backdrop-filter` crea bloque contenedor para los hijos `position: fixed`.** El contenedor del
menú QR tenía `backdrop-blur`, así que la barra del pedido se anclaba al fondo de ese div —1400px de
carta— en vez de a la pantalla: había que deslizar hasta el final para verla. El desenfoque va en una
capa `absolute` aparte. Lo mismo le pasaba al carrito y al rastreo.

**La barra del pedido dice QUÉ lleva, no solo cuánto.** Decía "Ver mi pedido (2) · $17.000", así que
para saber si ya había pedido la cerveza había que abrir el carrito, mirar y cerrarlo.

**El pedido queda recordado en el teléfono unas horas** (`app/m/[slug]/pedido-recordado.ts`): una
recarga no le hace perder el rastreo. Se guarda **solo el id**, nunca el teléfono ni la dirección.
Dos comensales que escanean el mismo QR desde sus propios teléfonos no comparten `localStorage`, y
para el aparato prestado está la ventana de vigencia, que lo descarta antes del turno siguiente.
Cerrar el rastreo a mano también olvida.

**Los errores no salen crudos a la calle.** El `catch` devolvía `err.message`, así que una excepción
de Prisma le habría contado al comensal cómo está hecha la base. Solo se muestran los
`ErrorDeUsuario`; el resto va al log con un mensaje genérico.

### El menú es el ÚNICO navegador de secciones

Los módulos que por dentro son varias pantallas —Caja, Informes, Inventario, Configuración—
declaran sus `secciones` en `app/(app)/navegacion.ts` y el menú las despliega. Antes esas vistas
solo existían como una tira de pestañas adentro de la pantalla: para saber que Inventario tenía
Proveedores había que entrar y mirar.

**Las píldoras internas se fueron.** Durante un tiempo convivieron las dos formas —la tira de
píldoras en Brasa sólido adentro de la pantalla y el menú lateral—, que además de duplicar saturaba
de acento. Informes nunca tuvo píldoras y funciona; el resto se alineó con eso. Lo que había que
reponer para no perder información:

- **Cada sección dice su nombre en la pantalla.** El `h1` es el del módulo y no cambia con `?vista=`,
  así que sin píldoras alguien que abre `/inventario?vista=proveedores` no tendría nada que se lo
  diga. Inventario pinta el rótulo de la sección con su contador donde estaba el `TabsList`;
  Configuración ya traía un `h2` por panel.
- **El contador de cuentas por cobrar subió al menú**, como insignia del ítem Caja: es urgencia, no
  tamaño, y ahora se ve desde cualquier pantalla. Va por el stream de avisos
  (`contarCuentasPorCobrar` junto a cocina y domicilios), no por props.

**Los módulos con secciones son acordeones de verdad**, con flecha y estado propio, igual que
Administración. Antes se desplegaban solos si el módulo estaba activo y no había forma de cerrarlos.
La fila es un `<div>` con el `<Link>` que navega y un `<button>` aparte para la flecha: un `<button>`
adentro de un `<a>` es HTML inválido. La animación va por `grid-template-rows: 0fr → 1fr` —la misma
de `seccion-plegable.tsx`— y también se le puso a Administración, que solo rotaba la flecha.

El acordeón de Administración cuelga del grupo marcado con `conAdministracion`. Antes se enganchaba
comparando `grupo.titulo === "Gestión"` en dos lugares distintos, así que renombrar el grupo borraba
Administración del menú entero sin que nada fallara.

**Caja tiene tres secciones y siempre entra por "Cobrar cuentas".** `seccionesDeCaja()` y
`vistaInicialDeCaja()` viven juntas en `navegacion.ts` porque el menú y la pantalla tienen que
coincidir: si divergen, el enlace del menú lleva a una pantalla que no se dibuja. Antes las dos
recibían `usaMesas || deliveryEnabled`, con el argumento de que un mostrador no tiene cuentas de mesa
que cobrar; desde que el POS tiene su propio **Enviar a caja** eso dejó de ser cierto, y esconderle
la sección al negocio de mostrador le escondía justamente las cuentas que acababa de mandar.

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

### La propina se elige ANTES de que la cuenta llegue a caja

Estaba todo construido y desconectado: `BusinessSettings.tipSuggestionEnabled` y
`tipSuggestionRateBp` se editaban en Configuración, `computeSuggestedTip` vivía en `lib/tax.ts` con
sus tests, `ponerPropina` era una Server Action completa y `Order.tipCop` ya entraba en
`recalcularTotales`, en la tirilla y en Informes. **Ninguna pantalla la ofrecía**: el interruptor de
Configuración era decorativo, `pagoSchema` no tenía el campo, y en 27 pedidos la suma de propinas era
cero. Informes mostraba "PROPINAS SUGERIDAS $0" para siempre.

**Se decide en el momento en que se le pregunta al cliente, no en la caja.** Son cuatro puertas:

| Dónde | Quién elige | Con qué acción |
|---|---|---|
| `/pedido/[id]`, al **Pedir la cuenta** | el mesero, en la mesa | `pedirCuenta` |
| Menú QR, al confirmar el pedido | el propio comensal | `crearPedidoClienteQR` |
| POS, en el modal de cobro | el cajero de mostrador | `procesarVentaPosCompleta` |
| POS, al **Enviar a caja** | quien atiende, antes de mandarla | `procesarVentaPosCompleta` (`ENVIAR_CAJA`) |

La cuarta es la misma decisión que la primera vista desde el POS: mandar la cuenta a la caja es el
momento en que se le pregunta. Por eso `tipCop` viaja **suelto** en el esquema del POS y no dentro de
`pago`: ahí todavía no hay pago.

La caja la muestra **ya elegida** y deja cambiarla o quitarla (`registrarPago`), pero ahí es la
corrección, no la decisión. Si se eligiera recién al cobrar, la pre-cuenta que el mesero llevó a la
mesa diría un total y la caja cobraría otro; y un pedido por QR llegaría sin propina, con alguien
teniendo que ir a preguntar.

**La propina viaja con la acción que ya existe, nunca en una llamada aparte.** Es la misma razón por
la que los datos fiscales viajan con el cobro (`features/pedidos/schemas.ts`): una propina guardada
que después no se cobra deja el pedido con un total que nadie pagó. `ponerPropina` quedó sin uso.

**El porcentaje es sobre el consumo COMPLETO, con impuesto incluido** —el número que el cliente ve en
la cuenta— y **la propina no lleva impuesto**: entra como `Order.tipCop`, aparte de los renglones, y
en la factura electrónica viaja como una línea con tarifa cero.

**Arranca en "Sin propina" siempre.** En Colombia es voluntaria y hay que preguntarla antes de
sumarla: preseleccionarla es exactamente lo que esa regla evita. Sugerirla es ofrecerla de un toque.

`features/pedidos/components/propina.tsx` es el único selector, con `tema="qr"` para el menú público,
que no se pinta con la paleta de la aplicación. Un solo componente para que la propina no termine
calculándose de tres maneras según por dónde entre el pedido.

### Un pedido llega a la caja porque alguien lo manda

**Tomar el pedido no es cobrarlo, y mandar la comanda a la plancha tampoco.** Que la cocina termine
un plato no significa que el cliente quiera irse. Hay **dos puertas** a la caja
(`features/caja/reglas.ts`), y ninguna es automática:

1. `Order.status = CUENTA_PEDIDA` — lo escribe una persona: el mesero desde la cuenta de la mesa
   (`pedirCuenta`) o quien atiende desde el POS (`procesarVentaPosCompleta` con `ENVIAR_CAJA`).
2. `Order.deliveryStatus ∈ DOMICILIOS_COBRABLES` — el recorrido propio del domicilio, donde el
   disparador explícito es que la cocina terminó el último renglón (`avanzarComanda`).

`HAY_QUE_COBRAR` tenía dos ramas más y las dos mandaban cuentas a la caja sin que nadie lo
decidiera. `{ tableId: null, status: "ABIERTA" }` metía todo pedido sin mesa apenas nacía —los del
POS guardados en espera, los recién mandados a cocina y, como un domicilio nunca tiene mesa, **todos
los domicilios, incluso sin confirmar**—, con lo cual anulaba por completo a la primera puerta y
contradecía el comentario que tenía encima. Y `{ items: { every: LISTO|ENTREGADO|ANULADO } }` daba la
cuenta por pedida en cuanto salía el último plato. El propio botón del POS lo decía en voz alta:
*"Mandar comanda a cocina **y caja**"*.

El predicado vive en `features/caja/reglas.ts` y no en `queries.ts` —que tiene `server-only` y
arrastra Prisma— para poder probarlo: `HAY_QUE_COBRAR` es el fragmento del `where` y `debeIrACaja` su
espejo puro, y hay un test que fija que el `OR` tenga **exactamente dos ramas**. Una tercera rama es
una cuenta llegando a la caja sin que nadie la haya mandado.

**Lo simétrico también hace falta: si a la cuenta ya en la caja se le agrega algo, vuelve a
`ABIERTA`.** Lo hacía `confirmarPedido` y ahora también `procesarVentaPosCompleta`. Sin eso la cuenta
se queda en la caja con un total que cambió por debajo mientras el cajero la tenía abierta.

**Nada de esto afloja el cierre de caja**: `cerrarCaja` sigue bloqueando con cualquier pedido
`ABIERTA` / `CUENTA_PEDIDA` del turno, así que un pedido que quedó en espera y nadie mandó aparece —
por su nombre— al intentar cerrar. Esa es la red, y es la correcta: avisa al final del turno, no le
llena la pantalla al cajero toda la noche.

### El POS es el único punto de venta, y no le pisa la comanda a la cocina

**Venta Rápida se eliminó.** Era un fork de `/pos` que llamaba a la misma acción con
`accion: "PAGAR_DIRECTO"` fija: sin parquear, sin mandar a cocina, sin domicilio, sin propina y sin
factura electrónica —los props `puedeFacturar` y `usaMesas` y los imports de `DatosFiscales` estaban
declarados y no se usaban—, con un descuento que **no viajaba al servidor**, así que la pantalla decía
"¡Venta Facturada!" mientras el pedido quedaba `ABIERTA` con faltante. Y como el commit que la creó
cambió el ítem del menú de `/pos` a `/venta-rapida`, el POS de verdad quedó fuera del menú y con dos
pruebas e2e fallando en silencio. Lo único que tenía y el POS no —el **lector de código de barras**,
que busca por SKU— se portó antes de borrarla.

**El POS no toca los renglones que ya tomó la cocina.** Ese camino borra y recrea los renglones en
vez de calcular un diff, lo cual está bien para un carrito y es destructivo para una comanda: sobre un
pedido que ya estaba en la plancha les borraba el `sentToKitchenAt`, el estado y los cronómetros,
media pantalla del KDS desaparecía de golpe y la comanda se volvía a imprimir entera. El corte es el
mismo que usa `confirmarPedido` para decidir qué mandar: `status: PENDIENTE` **y** `sentToKitchenAt:
null` es del carrito; cualquier otra cosa es de la cocina, se muestra en un bloque de solo lectura
("Ya en cocina") y suma al total sin poder editarse.

Por eso el carrito del POS puede llegar **vacío** con `orderId` puesto —un pedido que ya está en la
plancha y se retoma solo para mandarlo a caja o cobrarlo—, y el `min(1)` de `items` pasó a exigirse
solo cuando no hay `orderId`. Que quede al menos un renglón vivo lo verifica el servidor contra la
base, que es donde están.

**El modal "En espera" solo lista pedidos sin mesa.** `getPedidosAbiertos` trae todo lo vivo, cuentas
de mesa incluidas, y el POS las cargaba en el carrito como si fueran suyas: al guardar quedaban
convertidas en pedido `LLEVAR`, con la mesa perdida y el nombre de la cuenta pisado. Esa consulta
además está acotada a la jornada en curso; sin eso, un pedido que alguien se olvidó de cerrar
anteanoche seguía apareciendo para siempre.

**`procesarVentaPosCompleta` se había ido separando de `registrarPago` sin motivo.** Cuatro cosas que
el cobro por el POS hacía distinto, y ninguna a propósito: no despachaba el domicilio —lo dejaba en
`LISTO`, en el KDS para siempre y con el rastreo del comensal callado—; aceptaba cobrar sin caja
abierta cuando `requireOpenCashSession` estaba apagado, creando un `OrderPayment` con
`cashSessionId: null` invisible para el arqueo y para el bloqueo de cierre; no validaba que lo
entregado alcanzara; y con `p.tipCop > 0` no había forma de **quitar** una propina ya cargada. Cobrar
exige caja siempre, la exija el negocio o no: `requireOpenCashSession` decide si se pueden *tomar*
pedidos sin turno, que es otra cosa.

### La cocina firma cada plato, y esa firma es el informe

`OrderItem` no tenía marca de "empezado". Con `sentToKitchenAt` y `readyAt` solamente,
**los dos tramos que importan estaban colapsados en un número**: lo que el plato esperó en la
fila —que se arregla con más gente— y lo que tardó en cocinarse —que se arregla con otra receta o
más equipo—. El promedio de los dos no manda a hacer ninguna de las dos cosas. Ahora hay
`startedAt`, `startedById` y `readyById`.

**Solo el cocinero que lo tomó lo marca listo.** Es lo que le da sentido a tocar "Empezar": si
cualquiera puede cerrarlo, el botón no compromete a nadie y el tiempo de preparación que sale en el
informe no es de quien cocinó. Con dos excepciones, y las dos son necesarias:

- **Sin dueño se deja pasar.** `startedById` es NULL en todo lo anterior a la columna. Tratar ese
  NULL como "de nadie, y por lo tanto de ninguno" dejaría trabadas para siempre las comandas viejas.
- **Un administrador releva.** Un cocinero termina el turno y deja tres platos a su nombre; sin
  válvula esa comanda no la cierra nadie. El relevo queda firmado en `readyById`, así que el informe
  puede leer aparte lo que terminó otro en vez de cargárselo a quien empezó — por eso `readyById`
  existe y no se deduce de `startedById`.

Las reglas viven en `features/cocina/reglas.ts`, puras y con tests, y **la pantalla aplica las
mismas**: no se ofrece un botón que el servidor va a rechazar, y donde no va el botón va quién tiene
el plato. Eso no es la seguridad —la acción es un POST alcanzable con curl y valida por su cuenta—:
es que la pantalla no mienta.

**El `status` va en el `where` del update, no en un `if` antes.** Es el mismo `update` condicionado
del descuento de stock y del reclamo de impresión. Dos cocineros tocando el mismo plato desde dos
pantallas leen los dos `PENDIENTE`, los dos pasan la guarda y el segundo pisa la firma del primero:
el plato quedaría a nombre de quien no lo tomó, que es exactamente lo que esto existe para evitar.

**Sin KDS no hay un solo tiempo que medir**, y el informe lo dice en vez de mostrar una tabla de
guiones: `comandaDestino` en `IMPRESA` significa que nadie toca nada. `null` no es cero, igual que en
`lineCostCop`.

### Los informes no son de un día

Eran de un día y nada más: para saber cómo venía el mes había que abrir treinta pantallas y sumar a
mano. `features/informes/periodo.ts` —puro, con tests— define día, semana, mes, año y rango a medida,
y todo el resto del módulo pasó de recibir un `businessDate` a recibir un `Periodo`.

- **La semana arranca el lunes.** No es estética: el fin de semana es la mitad de la venta y tiene
  que quedar junto dentro del mismo tramo. Partiéndolo, cada semana mezcla el domingo de una con el
  sábado de la otra y ninguna comparación significa nada.
- **El período anterior dura lo mismo.** "vs. período anterior" solo quiere decir algo así. Para mes
  y año se retrocede por calendario —restar 31 días funciona en agosto y rompe en marzo—; para un
  rango a medida se corre la ventana entera, así que 10 días se comparan contra 10.
- **El tramo viaja en la URL** (`?periodo=`, `?jornada=`, `?desde=`, `?hasta=`). Un informe es algo
  que se manda al contador. `?jornada=X` sin `periodo` sigue significando exactamente lo que
  significaba, así que los enlaces viejos no se rompen. Y las flechas calculan el tramo vecino del
  lado del cliente con el mismo módulo puro, en vez de mandar un `?mover=-1` que quedaría pegado en
  la URL y correría el informe un tramo más cada vez que alguien la abre.

**Las horas pico se cuentan por `createdAt`, no por `closedAt`.** La pregunta es a qué hora hay que
tener gente en el piso: una mesa que se abre a las 8 y paga a las 11 es trabajo de las 8. Contando
por el pago, el pico se corre hacia el cierre y la conclusión sería contratar a la hora en que la
cocina ya está apagada.

**Dos cosas del SQL crudo que ya costaron una tarde cada una** (`getHorasPico`, `getTiemposDeCocina`
— van en crudo porque Prisma no sabe extraer una hora en la zona del negocio ni restar dos columnas
de fecha, y un año de un local con movimiento son cientos de miles de renglones que no se pueden
traer a JS):

1. **El día de negocio se manda como TEXTO, no como `Date`.** `businessDate` es una columna DATE y
   sus valores son la medianoche UTC del día; mandando un `Date`, el driver lo escribe como
   timestamptz y Postgres castea una punta con el TimeZone de la **sesión**. Verificado contra la
   base: con la sesión en `America/Bogota`, `'2026-08-27T00:00:00Z'::timestamptz::date` da
   **2026-08-26**. El primer día del mes se caía del informe. `'2026-08-27'::date` no depende de
   ninguna zona.
2. **`FILTER` va pegado al agregado, antes del cast.** `AVG(x)::float8 FILTER (...)` no es SQL
   válido; va `(AVG(x) FILTER (...))::float8`.

Y **el total no promedia promedios**: cada tramo vuelve con su cuenta y la ponderación se hace en JS.
Un cocinero con dos platos no puede pesar lo mismo que uno con doscientos.

### Caja: lo cobrado no desaparece

`getCuentasPorCobrar` filtra por `ABIERTA` / `CUENTA_PEDIDA`, así que apenas se cobraba, el pedido se
iba de la pantalla y no volvía a aparecer en ninguna parte del producto: los informes son todos
agregados y no existía ningún listado por pedido. Reimprimir una tirilla o revisar a quién se le
cobró hace media hora no tenía dónde hacerse.

`getCuentasCobradas` es su hermana (`status: "PAGADA"`, ordenada por `closedAt`) y alimenta la
sección "Cuentas cobradas". **No trae los renglones a propósito**: quinientos pedidos por sus ítems
es un payload que la tabla no usa, y el detalle completo ya lo da la tirilla, que está a un clic.

El filtrado, la búsqueda y el paginado son **en memoria sobre la jornada**: es un conjunto acotado,
responde sin ida y vuelta por cada tecla y no hay forma de paginar mal. Si la jornada pasa el tope
(`TOPE_CUENTAS_COBRADAS`), la pantalla lo dice en vez de mentir por omisión. La jornada viaja en
`?jornada=` con el mismo `parseBusinessDate` que usa Informes, así que se puede enlazar.

El historial **no depende de que haya caja abierta**: reimprimir la tirilla de anoche tiene que
funcionar con el turno cerrado.

### Las categorías se pliegan

`components/marca/seccion-plegable.tsx` agrupa productos por categoría en las tres puertas de venta:
el POS, la carta de la mesa y el menú QR. En un teléfono, una carta de 18 productos en lista corrida
muestra tres platos por pantalla y el resto es fe. La animación va por `grid-template-rows: 0fr → 1fr`,
que es lo único que llega a la altura real sin medirla con JS: nada de `max-height` con un número
inventado que recorta la última tarjeta cuando la categoría crece. Plegado se usa `inert`, no
`hidden` —`display:none` cortaría la animación en seco—.

**Todas arrancan cerradas y solo una se abre a la vez.** Las tres pantallas envuelven sus categorías
en `<Acordeon>`, que lleva el estado del grupo por contexto: abrir una cierra la que estaba, y las dos
animan a la vez. Va por contexto y no por props porque las tres recorren sus categorías con un `map`
y pasarles el estado a mano obligaba a repetir el mismo `useState` tres veces y a que las tres se
acordaran de coordinarlo igual.

Antes arrancaban todas abiertas y la carta entera caía de golpe; en el menú QR, además, la primera
abría sola con el argumento de que al escanear había que ver comida y no una lista de títulos. El
argumento se dio vuelta con la carta real: con cinco categorías desplegadas hay que deslizar por
delante de todo lo que no se está buscando, y el encabezado plegado ya dice el nombre y cuántos
productos hay. Cerradas, la primera pantalla es el índice completo y elegir es leer seis títulos en
vez de cuarenta platos.

**El recorte dura lo que dura la animación.** El `overflow-hidden` es obligatorio para que `0fr` de
verdad esconda algo, pero mientras está puesto recorta todo lo que un hijo saque de la caja: el
`hover:scale` de las tarjetas quedaba rebanado en la primera y la última columna, y la insignia de
cantidad —que va en `-top-2 -right-2`— cortada por la mitad. Con la sección abierta y la animación
terminada, el desborde vuelve a ser visible. Va por estado y con temporizador, no con `transitionend`:
con `prefers-reduced-motion` no hay transición y ese evento no llega nunca, así que quedaría recortado
para siempre justo en el equipo de quien pidió menos movimiento.

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

### Impresión térmica: la cola vive en Postgres, Redis es el timbre

Hasta acá imprimir era abrir una pestaña y llamar a `window.print()`
(`app/imprimir/pedido/[id]`), y **la comanda de cocina no se imprimía nunca**: solo
existía en el KDS, así que una cocina sin pantalla no tenía cómo enterarse del
pedido.

**El servidor nunca le habla a la impresora.** Una térmica del bar vive detrás del
router del bar y desde internet no se llega. Lo hace `agente-impresion/`, un
binario en Go sin dependencias que corre en una PC del local: pide trabajo, escribe
los bytes en el puerto 9100 y confirma. **No decide nada de formato** —los bytes
llegan armados— para que cambiar el pie del recibo no obligue a actualizar el
programa en veinte locales.

**La cola es durable a propósito.** Redis Pub/Sub es fire-and-forget: lo que se
publica con el agente apagado se pierde y nadie se entera. Para un contador de
pantalla está bien; para una comanda no. Así que `PrintJob` vive en Postgres y
`publicarImpresion` solo toca el timbre, **después del commit** —antes, el agente
podría venir a buscar un trabajo que todavía no existe—. Es el mismo patrón de
`avisos/stream`: snapshot al conectar más reconciliación periódica, en vez de
confiar en haber estado escuchando.

**El reclamo es exclusivo y caduca** (`reclamarTrabajos`): un `updateMany`
condicionado, igual que la guarda anti-doble-emisión de la DIAN. Dos agentes
corriendo —una PC en la caja y otra en la cocina— no imprimen el mismo recibo; y
un agente que se muere con el trabajo en la mano no lo bloquea para siempre.

**Tres intentos y después se avisa.** Reintentar y callarse es peor que no
reintentar: nadie sabe que la comanda no llegó a la plancha hasta que el cliente
pregunta. Al agotarse salta un `Aviso` de tipo `IMPRESION_FALLIDA` —que hereda
toast, campana y sonido— y sale un correo al dueño y a `OPS_ALERT_EMAIL`.

**Nada de UTF-8.** Una térmica no lo entiende: trabaja con páginas de códigos de un
byte, y la de la región es CP858. Mandarle UTF-8 imprime "MenÃº" en vez de "Menú", y
además **corre las columnas**, porque un acento pasaría a ocupar dos caracteres de
un ancho que se calculó en uno. Eso vive en `lib/printing/escpos.ts`, puro y con
tests de bytes.

Los tres módulos de composición son puros y separados a propósito: `ticket.ts`
decide dónde cae cada columna, `recibo.ts` y `comanda.ts` qué dice cada línea, y
`escpos.ts` cómo se le manda a la máquina. **Una comanda no es un recibo con otro
título**: no lleva precios ni impuestos, y sí lleva grande el identificador, que es
lo único que se busca de lejos entre seis papeles colgados en la plancha.

`componerRecibo` lo usan los dos caminos —la pantalla de impresión y la cola—: si
cada uno compusiera lo suyo, reimprimir daría un tiquete distinto del que salió por
la caja.

**El KDS es opcional**: `BusinessSettings.comandaDestino` (`KDS` | `IMPRESA` |
`AMBAS`). Es un ajuste y no un `AppModule` porque aquel enum significa "qué
superficie usa el negocio", no "cómo sale el papel".

El agente se autentica como el webhook de MercadoPago: ruta pública en el
`middleware` que **verifica por su cuenta**, con un token del que se guarda **solo
el hash** (`PrintAgent`). SHA-256 y no argon2: son 32 bytes aleatorios, no una
contraseña que alguien repite en otro lado, y el hash se verifica varias veces por
minuto.

**A ese token no lo teclea nadie.** Antes había que copiarlo a un `agente.json` escrito
a mano al lado del binario, y eso no lo va a hacer un cajero: son 43 caracteres, una
coma de más rompe el archivo y el error no dice cuál. El archivo volvió —abajo—, pero
sale hecho del servidor y se pega entero; lo que no vuelve es escribirlo. El alta entrega
un **código de emparejamiento** —12 caracteres, alfabeto sin `0/O` ni `1/I/L`— que viaja
en el **nombre del archivo que se descarga** (`platlia-impresion__K7M2-9QXT-4B8N.exe`,
lo pone el `Content-Disposition` de `/api/impresion/descargar`). El programa se lee a
sí mismo con `os.Executable()`, canjea el código en `/api/impresion/emparejar` y
guarda el token solo.

El código puede ser corto porque **vale una hora y un solo uso**: `emparejar()` lo
quema en el mismo `updateMany` condicionado con el que lo canjea, así que no aguanta
fuerza bruta ni hace falta que aguante. Y las tres causas de rechazo —inexistente,
vencido, ya usado— contestan **el mismo mensaje**, por lo mismo que `ingresar`
contesta igual exista o no la cuenta: distinguirlas le diría a quien esté probando
cuál de sus intentos estuvo cerca.

**Ese camino supone que el programa se baja del servidor**, porque el código viaja en
el nombre del archivo. Cuando los binarios no están publicados —que es lo normal en el
VPS— hay un segundo camino: **Configurar a mano** emite el token y entrega el
`agente.json` armado, y el programa lo lee **del lado del ejecutable**
(`leerConfiguracionVecina`). Se dejan los dos archivos juntos, doble clic, y desde ahí
hace exactamente lo mismo que el otro camino —se copia a la carpeta de datos, se anota
para arrancar con la máquina, abre su página—: lo único que cambia es de dónde salió el
token.

Se lee del lado del ejecutable y no de la carpeta de datos porque esa carpeta es distinta
en cada sistema y lleva el usuario adentro de la ruta: hacer que alguien la encuentre
antes de poder copiar nada es volver al archivo de texto hecho a mano.

**`emitirToken` mata el código de emparejamiento** (y `regenerarCodigo` ya mataba el
token). Son dos llaves para la misma puerta: dejarlas convivir sería una segunda entrada
viva una hora sin que nadie sepa que quedó abierta. El JSON lo arma el **servidor**
(`archivoDeConfiguracion`, con `env.APP_URL`) y no la pantalla, porque una URL escrita a
mano en un componente cliente —un `localhost`, una barra final de más— es un agente que
no conecta y un error que solo se ve en la PC del local.

**La URL del servidor se hornea al compilar** (`-X main.servidorHorneado=$APP_URL`,
en `scripts/compilar-agente.sh`). Tiene que saber a quién hablarle antes de tener
ninguna configuración; el `agente.json` puede pisarla, pero solo si alguien lo puso.

El doble clic hace todo lo demás solo: se copia a la carpeta de datos del usuario
—Descargas es una carpeta que se vacía, y ahí el local dejaría de imprimir un día sin
que nadie hubiera tocado nada—, se anota para arrancar con la máquina **sin pedir
permisos de administrador** (`HKCU\…\Run`, `systemd --user`, LaunchAgent: pedir
elevación en la caja de un bar es la forma más rápida de que alguien cancele el cuadro
y nunca más lo abra) y abre el navegador en su página de estado.

**No puede haber dos agentes, y gana el último que se abrió.** Cada doble clic dejaba
un proceso más: el puerto base quedaba tomado, el programa se corría al 9778 y andaba
igual. En Windows no hay ventana que delate a los anteriores y en Linux quedan sueltos
en el fondo, así que la persona termina mirando la página del PRIMERO —vieja, sin
configurar y con la pantalla de la versión que tuviera— mientras el que acaba de abrir
escucha en otro puerto. Pasó tal cual, y se diagnostica mal: parece que el programa
"no toma" el `agente.json` cuando en realidad se está mirando otro proceso.
`pedirRelevo()` le pide el puesto al que esté en el 9777, pero **solo si contesta la
marca** en `/soy-el-agente`: si el puerto lo tiene cualquier otro programa, no es asunto
nuestro. El relevo va por POST y con una cabecera propia, que es lo que obliga a un
navegador a pedir permiso antes (preflight): sin eso, cualquier página abierta en esa
computadora podría apagarle la impresión al local con un formulario escondido.

**Donde hay gestor de servicios, el doble clic es un INSTALADOR que se retira.** En Linux
y macOS el proceso que abre una persona deja todo configurado, arranca el servicio y
**sale**; el que atiende de ahí en más es systemd o launchd. Si se quedara, en Linux
moriría con la terminal —y quedarían dos procesos peleándose el puerto—. En Windows no
hay a quién pasarle la posta (`HKCU\…\Run` solo dispara al iniciar sesión), así que ahí
el proceso sí es el agente y se queda. Por eso `registrarArranque` **solo anota** y nunca
arranca: el servicio se levanta desde `main`, y recién **después de soltar el puerto**,
o se encuentra el 9777 tomado por el proceso que está por irse.

**La página local acepta el archivo, no solo el código.** Pedía un código de 12
caracteres mientras el panel entregaba un `agente.json`: quien llegaba a esa pantalla
tenía lo que hacía falta en la mano y ninguna casilla donde ponerlo. Ahora el campo
principal es el archivo pegado y el código quedó plegado abajo. Los cuatro caminos
—archivo al lado del ejecutable, código en el nombre, código escrito, archivo pegado—
pasan por `adoptarConfiguracion`, el único lugar donde se guarda, se instala y se
registra el arranque.

**En Linux el arranque automático tiene tres trampas que los otros dos sistemas no
tienen.** (a) `systemctl --user enable` solo anota la unidad para el próximo reinicio, y
como acá el programa se abre desde una terminal, al cerrarla el local dejaba de imprimir
hasta que alguien reiniciara: hace falta `restart` además de `enable` —`restart` y no
`start`, para que una reinstalación levante el binario nuevo en vez de quedarse con el
viejo ya cargado—. (b) Para saber si hay que arrancarla se compara el **PID** contra el
`MainPID` de la unidad; **`INVOCATION_ID` no sirve**, porque systemd la pone en el
servicio pero los hijos la heredan y en un escritorio moderno la terminal misma cuelga de
`app-gnome-…service`, así que todo lo abierto a mano la trae puesta y la guarda daba "sí"
siempre. (c) Reinstalar sobre un servicio andando exige pararlo antes: el kernel rechaza
escribir sobre un ejecutable en ejecución (`ETXTBSY`), que es el mismo problema que en
Windows resuelve el `os.Rename` previo.

**El navegador guarda el archivo sin permiso de ejecución** y eso no se puede mandar por
HTTP: en Linux y macOS hay un `chmod +x` inevitable antes del primer arranque. En Windows
no hace falta nada.

**No hay ventana.** En Windows se compila con `-H windowsgui`: una consola negra
abierta todo el día es una ventana que alguien cierra sin querer. Lo que se mira es
`http://127.0.0.1:9777`, servida por el propio agente —`agente-impresion/estado.go`—,
que además tiene el campo para pegar el código a mano por si el navegador le cambió el
nombre al archivo. Dos detalles de ese archivo que ya costaron un `go vet`: `vistaEstado`
está separada de `estado` porque copiar una estructura con el mutex adentro es un candado
que ya no protege nada, y el CSS va **concatenado** y no dentro del `Sprintf`, porque su
`width: 100%` se lee como un verbo de formato desconocido.

### Configuración: un formulario que parece guardado y no lo está no es un formulario

Las ocho pantallas de Configuración son formularios largos —el del menú QR mide seiscientas
líneas— con el botón de guardar al final. Se tocaba algo, se veía cambiar, se salía, y no se había
guardado nada.

**En Permisos de roles era peor**: al marcar una casilla el contador del rol pasaba de 3/12 a 4/12,
aparecía la insignia "Personalizado" y el pie decía *"los cambios se aplican de inmediato en la
sesión de cada usuario"*. Tres confirmaciones para algo que no había pasado, en la única pantalla
del producto que decide quién entra a dónde: alguien le quita Configuración a un cajero, ve la
casilla apagarse, se va, y el cajero sigue entrando.

`BarraGuardar` (`app/(app)/administracion/configuracion/guardar.tsx`) es la respuesta y **está
siempre**, no solo cuando hay cambios: el defecto era que el botón quedaba fuera de pantalla, y una
barra que aparece y desaparece deja el mismo problema la mitad del tiempo. Dice `SIN CAMBIOS` con el
botón apagado, `SIN GUARDAR · SE PIERDE AL SALIR` en ámbar, o `GUARDADO`. El resultado se pinta ahí
y no arriba del formulario, que es donde estaba: con el botón abajo y la confirmación arriba, uno
guardaba y no veía nada.

Tres cosas que costaron una vuelta cada una:

1. **`<Card>` de shadcn trae `overflow-hidden`, y eso anula `position: sticky`** en todo
   descendiente: un ancestro con overflow oculto se vuelve el contenedor de desplazamiento y, como no
   scrollea, la barra no tiene de dónde despegarse. Las tarjetas de Configuración llevan
   `overflow-visible`.
2. **El `<form>` tiene que envolver la pantalla entera, no solo el pie.** Encerrado en tres renglones
   al final de la página, `sticky` no tiene recorrido y la barra no aparecía nunca.
3. **El estado sucio de Permisos se compara contra lo guardado**, no contra un booleano que se
   prende al primer clic: quien apaga una casilla y la vuelve a prender no dejó ningún cambio. Un
   "sin guardar" que aparece cuando no hay nada que guardar se vuelve ruido y deja de leerse.

**Las filas de permisos son `<button role="switch">`, no `<div onClick>`.** Eran divs con `onClick`
y adentro un `<input type=checkbox>` con `onChange={() => {}}`: no se podía cambiar **ningún permiso
con el teclado**, y la casilla real se desincronizaba al guardar —React resetea los campos del
formulario al terminar la acción, así que la fila quedaba pintada como activa con el cuadrito
apagado—. El cuadro es puro dibujo y el estado lo dice `aria-checked`.

**Nada de emoji en la interfaz.** Había 42 en estas pantallas —pestañas, botones, títulos— y no
aparecen en ningún otro módulo del producto: era el ruido más visible. Quedan los de los presets de
tema, los del simulador del teléfono (que es contenido de muestra) y el de la tarjeta QR impresa, que
es lo que el comensal lee en el papel.

Y había **quince tratamientos de encabezado** en un solo módulo, ocho de ellos el `font-semibold
text-lg` de shadcn que este manual manda rechazar. Uno solo, `EncabezadoPanel`, con la bajada en
`text-sm` —EL cuerpo— y no en `text-xs`, que es el tamaño del dato denso y por el que Configuración
se leía apretada al lado del resto.

### El loader es el isotipo imprimiéndose

Uno solo, en `components/marca/loader.tsx`, y es una **comanda saliendo de la impresora**: la hoja
se alimenta a pasos desde la ranura, se imprime la P, se traza la línea de acento, la comanda se
desprende y arranca la siguiente. Un bar mira salir ese papel decenas de veces por noche; la espera
del sistema se parece a la que ya conoce. Antes había una animación Lottie de 14 KB con resplandor
de gradiente y anillo de vidrio —la misma que trae cualquier producto— y arrastraba `lottie-react`
al bundle solo para dibujarla.

**Los colores no se escriben en el loader**: salen de `--papel`, `--tinta` y `--brasa`, así que
sigue la paleta sola.

**El velo deja ver la página.** `--tinta` al 52% con `blur(14px)`: quien espera no pierde el lugar
donde estaba, y el desenfoque dice "esto está inerte" sin borrar el contexto. El 52% está medido
contra el salón cargado —por encima del 60% las mesas dejan de distinguirse y el velo pasa a ser una
pantalla negra—. La comanda se despega con un `drop-shadow` que sigue su silueta, borde dentado
incluido: un `box-shadow` en un contenedor dibujaría el rectángulo del SVG y delataría que no es un
papel.

**Va en dos lugares y en los dos con la misma clase**, que es lo que hace que no parpadee entre
ellos —abrir una mesa encadena los dos y se ve como una sola espera—:

| Dónde | Qué |
|---|---|
| `loading.tsx` de `(app)` y de `superadmin` | `VeloDeCarga`, el cambio de módulo y la entrada al panel |
| `PantallaCargando` | la acción que termina en otra pantalla (abrir mesa, liberar, cerrar sin consumo) |

El **esqueleto sigue debajo** del velo de ruta (`EsqueletoPantalla`): le da al desenfoque algo que
desenfocar, deja adivinar la forma de lo que viene, y es la red si el navegador no soporta
`backdrop-filter`.

**Abajo de ~40px deja de ser el isotipo.** Medido: a 44px todavía se leen el borde dentado, la P y el
acento; a 20px es un rectángulo beige. Por eso **no va dentro de los botones** —ahí el texto ya dice
qué está pasando y alcanza con el spinner de siempre—, y el ciclo de 2400ms tampoco llegaría a
completarse en una acción de 400ms.

### Un aviso que no se puede atender no es un aviso

`avisos:{businessId}` es **un canal por negocio**, y el stream reenviaba todo lo que pasara por ahí a
cualquiera que estuviera conectado: solo pedía licencia vigente. Así, el mesero recibía "entró una
comanda a cocina" —la que él acababa de mandar— con un botón **Ver** que empujaba a `/cocina`, una
pantalla que su rol no tiene: el DAL respondía 404 y el toast terminaba en una pantalla de error.

Se arregla **en el origen y no escondiendo el botón**: si alguien no puede entrar a una pantalla,
tampoco tiene por qué enterarse de lo que pasa adentro. De paso deja de viajar al navegador de la
cocina el total de cada cuenta que llega a caja.

`SECCION_QUE_EXIGE` (`lib/avisos.ts`, puro y con tests) mapea cada tipo al permiso que hace falta, y
`leCorresponde()` lo decide. **El destino del aviso y el permiso que exige salen del mismo lugar**,
así que no pueden separarse; hay un test que lo fija comparando el `href` contra la sección.

| Aviso | Exige |
|---|---|
| `COCINA_NUEVA_COMANDA` | `cocina` |
| `CUENTA_EN_CAJA` | `caja` |
| `DOMICILIO_NUEVO` | `domicilios` |
| `IMPRESION_FALLIDA` | `configuracion` |

**Los permisos se leen una sola vez, al conectar.** Alcanza: esto decide qué avisos se muestran, no
qué pantallas se abren —de eso se encarga el DAL en cada `page.tsx`—, y un cambio llega en la
próxima reconexión. Releerlos por mensaje sería una consulta por cada comanda de la noche y por cada
pantalla conectada.

Medido con dos sesiones y publicando en el canal a mano: el MESERO recibe **cero**; la COCINA recibe
la comanda y **no** la cuenta de caja.

### La carta del comensal es la otra cara de la comanda

`app/m/[slug]` era el esqueleto de cualquier aplicación de delivery: logo redondo centrado, nombre
debajo, una fila de cuatro píldoras iguales, buscador y rejilla de tarjetas. Nada de eso sale del
mundo de un restaurante; sale de la tienda de aplicaciones. Y era la **única pantalla que ve un
cliente de verdad** sin una sola señal de lo que el producto es por dentro.

Ahora se encabeza como una tirilla: el nombre grande y **a la izquierda** —el texto centrado es la
marca del molde—, el logo al lado y no como medalla, una línea de datos en mono, y la **perforación
dentada** del isotipo cerrando la cabecera. El pie la cierra con el mismo gesto y ahí va la
atribución, que es donde una tirilla térmica pone el sistema que la imprimió.

**La perforación es una silueta, no un color, y eso es lo que la hace posible acá**: en esta pantalla
la paleta la elige el negocio, así que cualquier decisión cromática nuestra sería una imposición. La
estructura y la letra son el margen que sí tenemos.

Y el metáforo es vernáculo de restaurante, no marca nuestra: toda cocina tiene tirillas, así que un
borde dentado se lee "restaurante" y no "proveedor". Por eso puede vivir en el escaparate de otro.

**A dónde va el pedido es el titular, no una insignia.** `Mesa 4` es el dato que confirma que se
escaneó el código correcto y estaba perdido como la segunda de cuatro píldoras idénticas.

### La carta se voltea sola cuando el fondo es claro

Los tokens `--qr-*` de `globals.css` son **papel con alfa**, o sea que daban por sentado un fondo
oscuro. Los seis temas eran oscuros, así que nadie lo notó: el día que un local elegía un crema —una
panadería, un brunch, una heladería— el nombre del restaurante y todos los precios quedaban
invisibles.

Ahora la pantalla calcula con `textoSobre()` cuál de las dos tintas de la marca contrasta contra el
fondo y **deriva las seis variables de esa**. Tres cosas que no son obvias:

1. **El degradado se juzga por su PRIMER color** (`fondoEfectivo`), que es el que queda arriba, donde
   están el nombre y la línea de datos. Antes el modo degradado se daba por oscuro siempre.
2. **Las superficies no son el mismo velo en los dos casos.** Sobre un fondo oscuro una tarjeta se
   levanta oscureciendo; sobre uno claro se levanta **aclarando**. Usar el velo negro en los dos daba
   tarjetas sucias sobre el crema, que es lo que hace que un fondo claro se vea barato.
3. **Los tokens de la APLICACIÓN se reapuntan acá dentro.** `SeccionPlegable` y el selector de propina
   son compartidos y escriben con `text-muted-foreground` y `--linea-30`, pensados para el fondo
   oscuro fijo del producto: sobre crema eso es beige sobre crema y el rótulo de cada categoría
   desaparecía. Mapear `--muted-foreground`, `--foreground`, `--linea-30` y `--linea-16` en el `style`
   del contenedor los adapta a los tres modos sin tocar los componentes.

Hay tres temas claros de fábrica —Papel & Horno, Menta Fría, Lino Crudo— y cualquier color propio
también funciona: no hay que configurar nada más, la carta se da cuenta.

### Lo que el negocio puede cambiar de su carta

Había seis temas de color y la pantalla seguía viéndose igual que la de todos, porque **lo que hace
genérica a una pantalla no es la paleta sino la estructura y la letra**. Se agregaron tres ajustes
que sí cambian eso, y las cuatro letras son deliberadamente distintas entre sí: si dos opciones se
parecen, elegir no cambia nada.

| Ajuste | Opciones |
|---|---|
| `qrMenuFuente` | Condensada · Limpia · Serif · Máquina |
| `qrMenuCarta` | Lista · Rejilla |
| `qrMenuBordes` | Redondeados · Rectos |

Van en `_extra` —el escape dentro del JSON de `rolePermissions`, el mismo de los horarios—, así que
**no hicieron falta ni migración ni columnas**. Se validan con `z.enum`: estos valores eligen una
familia tipográfica y unas clases, así que lo que no esté en la lista no puede llegar a una página
pública.

**Cada opción lleva una pista de para qué local es**, no solo su nombre: "Serif" no le dice nada a
quien tiene un bar, "Mantel largo, trattoria" sí. Elegir la letra de tu carta no debería exigir saber
tipografía.

Las dos letras que no viven en la aplicación —Fraunces y Space Mono— se cargan **solo en esta ruta**
con `next/font`: son el escaparate de un local y no tienen por qué pesar en el turno de trabajo, y al
descargarse en compilación se sirven desde nuestro dominio (en la calle, con datos flojos, un pedido
a Google Fonts es un segundo de texto invisible).

**En un formulario con controles propios, el estado sucio se calcula comparando, no escuchando.** El
de la carta QR mueve casi todo con `<button>` —temas, acentos, modo de fondo— y el `onChange` del
formulario nunca se entera: atado a ese evento, elegir un tema dejaba el botón de guardar apagado y
el cambio no se podía guardar. Se compara una instantánea del estado contra la del momento de abrir.

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

## Aparecer en Google

El producto llegó a la búsqueda con **cinco URLs**, una sola comercial, y una portada que trata
"bares" y "restaurantes" como si fueran lo mismo. Lo técnico estaba bien —HTML renderizado en
servidor, canónica, sitemap, JSON-LD de `Organization`, `SoftwareApplication` y `FAQPage`— y aun
así no había nada que rankear.

**AMP no es la respuesta, y Search Console la sugiere igual.** Su propia documentación dice que
Google indexa las páginas AMP como cualquier otra y aplica el mismo estándar "independientemente de
la tecnología". No es factor de posicionamiento. El panel que lo ofrece es ayuda genérica, no un
diagnóstico.

**Cuatro de los seis resultados de "software para restaurantes Colombia" son listas y directorios**,
no portadas de productos. Ese término no lo gana una home compitiendo de frente: se llega estando
*dentro* de esas listas —el alta en Capterra, ComparaSoftware y similares es gratis y es la palanca
más rápida— y publicando las propias. Lo que sigue es la mitad que sí vive en el repo.

**Y el canal de asistentes no es el mismo que el buscador.** Quien contesta "¿qué software me
recomendás?" entra con `Claude-User` o `ChatGPT-User`, no con el crawler de entrenamiento; eso está
abierto y separado más abajo.

### Una página por término, y distintas por dentro

`/software-para-restaurantes` y `/software-para-bares` existen porque un `<h1>` que dice las dos
cosas es más débil, para cualquiera de las dos búsquedas, que uno que dice una sola. Cada una se
queda con su término entero en `<h1>`, `<title>`, canónica y primer párrafo.

**Y son distintas por dentro, no la misma con sinónimos cambiados.** Dos páginas que dicen lo mismo
son exactamente lo que Google llama contenido de puerta de entrada y se penaliza. Lo que las separa
es verdad del producto: un bar necesita que la jornada no corte a medianoche, un restaurante
necesita costeo por receta. Si el contenido no fuera de verdad distinto, correspondería una sola
página. `PaginaSegmento` es el molde; el contenido va por props.

`/precios` es página propia porque "software para restaurantes precio" no tenía dónde aterrizar: el
precio solo existía como `/#precios`. Todo lo que dice un número sale de la lista, con las mismas
funciones que cobra el checkout.

### El precio estaba congelado en el build, y nadie lo sabía

**Una consulta a la base NO alcanza para que Next considere dinámica a una página**: solo lo hacen
las APIs dinámicas (`cookies()`, `searchParams`). Así que la portada quedaba prerenderizada con el
precio horneado en el HTML —verificado: el `$69.900` estaba escrito dentro de
`.next/server/app/index.html`—, y la promesa de que "una promoción se refleja sola" era falsa:
hacía falta volver a desplegar.

Las cuatro pantallas con precio llevan `export const revalidate = 300`. Cinco minutos y no
`force-dynamic`, porque siguen sirviéndose de caché —que es lo que le conviene a un rastreador y a
quien abre con datos flojos—; y cinco y no una hora porque **detener una promoción es urgente por
definición**: existe una acción aparte justamente para eso.

### Las guías

`app/(marketing)/guias/`. El metadato vive en `guias.ts` y el contenido en `_contenidos/`, separados
porque el metadato lo consumen tres lugares que no pueden divergir: el índice,
`generateStaticParams` y el sitemap. **Esa misma separación permite declarar una guía sin
escribirla** —el índice la lista, el sitemap se la manda a Google, y el enlace da 404 sin que nada
falle—, así que `tests/unit/guias.test.ts` compara las dos listas en los dos sentidos.

**La regla de qué se publica:** cada guía trata algo que sabemos por haberlo construido y verificado
—la API de la DIAN, el texto de la ley, la aritmética del costeo—, no por resumir lo que ya escribió
otro. **La regla de exactitud:** toda afirmación legal o tributaria va con su fuente enlazada. El
que lee va a tomar una decisión de plata; equivocarse no es un problema de posicionamiento.

Dos cosas que salieron de escribirlas y valen para todo el sitio:

- **El umbral del no responsable se escribe en UVT, no en pesos.** La UVT se reajusta cada año, así
  que cualquier cifra en pesos queda mal en enero y nadie se acuerda de volver. Lo estable es el
  "3.500 UVT" del artículo.
- **Las descripciones no pasan de 160 caracteres.** Google corta ahí, y las cinco nacieron entre 172
  y 216: el resultado terminaba en puntos suspensivos justo donde estaba el argumento. Hay un test.

No hay `@tailwindcss/typography` en el proyecto: las clases `prose` de la página de habeas data no
hacen nada. Por eso las piezas de `components/articulo.tsx` (`P`, `H2`, `Norma`, `Tabla`, `Aparte`)
llevan sus clases escritas; repetirlas en cinco guías largas garantizaba que a la tercera los `h2`
dejaran de medir lo mismo.

### El sitemap mentía en cada `lastmod`

`const ahora = new Date()` se evaluaba **en cada petición**, así que las cinco URLs declaraban
"modificada ahora mismo" siempre. Google descarta los `lastmod` que detecta poco fiables, con lo
cual el campo dejaba de servir para lo único que sirve. Las fechas ahora son reales y se escriben a
mano en `app/(marketing)/rutas.ts`; las guías entran solas desde `GUIAS`, porque listarlas en los
dos lados es la forma de que un día aparezcan duplicadas.

### Cloudflare antepone su propio `robots.txt`, y bloquea entrenar pero no contestar

El archivo en vivo tiene 283 líneas: el bloque `# BEGIN Cloudflare Managed content` va **antes** del
que sirve la aplicación. Separa bien dos cosas que es fácil confundir:

| `Disallow: /` (entrenan modelos) | Sin nombrar → caen en `*` con `Allow: /` |
|---|---|
| ClaudeBot · GPTBot · CCBot | **Claude-User · ChatGPT-User** |
| Google-Extended · meta-externalagent | **OAI-SearchBot · PerplexityBot** |
| Applebot-Extended · Amazonbot · Bytespider | **Googlebot** |

O sea que **el canal que importa está abierto**: cuando alguien le pregunta a un asistente "¿qué
software uso para mi bar?", el que entra a la página es `Claude-User` o `ChatGPT-User`, y el índice
que ese asistente consulta lo arma `OAI-SearchBot`. Ninguno está bloqueado. Y `Google-Extended` solo
controla si el contenido alimenta a Gemini: **no tiene ningún efecto sobre el posicionamiento en la
Búsqueda**.

Lo que sí estaba mal era la **contradicción**: `app/robots.ts` nombraba a ClaudeBot, GPTBot,
Google-Extended, Applebot-Extended y meta-externalagent con `Allow: /` mientras Cloudflare les ponía
`Disallow: /`. Eso no los desbloquea —deja dos grupos `User-agent` con el mismo nombre diciendo lo
opuesto, y con grupos duplicados el comportamiento no está definido igual en todos los rastreadores;
los conservadores toman la primera coincidencia, que es la de Cloudflare—. No daba nada y volvía
impredecible el archivo entero.

**La decisión tomada es conservar el bloqueo de entrenamiento** y que nuestro archivo diga lo mismo:
`agentesDeIa` quedó con los cuatro que contestan en vivo y nada más. Lo que se resigna es entrar al
**corpus de entrenamiento** —que el modelo conozca el producto sin tener que buscarlo—, y es a
propósito. `tests/unit/robots.test.ts` fija las dos mitades: que no reaparezca ninguno de los
bloqueados y que no se caiga ninguno de los cuatro. Si algún día se apaga el robots.txt gestionado
—panel → **AI Crawl Control**, ya no está en Settings → Crawlers—, hay que actualizar esa prueba.

### `www` respondía 525

Cloudflare no alcanzaba el origen para ese hostname, así que cualquiera que escribiera `www.` no
entraba —y si la propiedad de Search Console se hubiera creado como `https://www.platlia.com`, no
habría mostrado nada nunca—. Se resolvió con una Redirect Rule (`www.platlia.com/*` → `301` a la
raíz); la propiedad correcta en Search Console es la de **dominio**, verificada por DNS, que cubre
los dos hostnames.

`GOOGLE_SITE_VERIFICATION` y `BING_SITE_VERIFICATION` están en `lib/env.ts` y se emiten desde el
`metadata` raíz. **Opcionales, y tienen que seguir siéndolo**: `next build` importa `lib/env.ts` al
recolectar las rutas, así que una variable de SEO obligatoria sería un despliegue que no arranca por
algo que no afecta a ningún usuario. Anclarla acá es lo que la hace sobrevivir a un cambio de
proveedor de DNS.

### El test de enlaces internos no entendía las rutas dinámicas

`enlaces-internos.test.ts` armaba la lista de rutas reales desde las carpetas, así que
`/guias/propina-en-colombia` figuraba como enlace roto: la ruta es `/guias/[slug]`. Enlazar una guía
desde otra se reportaba como defecto y la única salida era no enlazarlas, que es lo contrario de lo
que hay que hacer cuando los enlaces internos son los únicos que existen. Ahora compara segmento a
segmento y `[algo]` acepta cualquier valor.

## Estructura

```
middleware.ts            chequeo optimista de cookie, SIN tocar la base de datos
prisma.config.ts         configuración de la CLI de Prisma 7
prisma/schema.prisma     modelo de datos    prisma/migrations/    prisma/seed.ts
generated/prisma/        cliente generado (ignorado por git)
app/(auth|onboarding|app|superadmin|bootstrap|bloqueado)/   grupos de rutas
app/imprimir/            HTML limpio para @page 55mm/80mm
app/turnero/             el televisor del salón: fuera de (app), sin barra de navegación
app/(marketing)/         la portada, las dos páginas de segmento, /precios y /guias
app/(marketing)/rutas.ts        las páginas públicas con su fecha real de edición
app/(marketing)/guias/          metadato en guias.ts · contenido en _contenidos/ (privada)
lib/db/                  pool.ts · root.ts (rootDb) · tenant.ts (tenantDb) · tenant-models.ts
lib/{auth,actions,billing,printing,email}/      infraestructura
lib/mcp/                 token · herramientas · oauth (el servidor MCP por negocio)
app/authorize/           la pantalla donde el dueño aprueba el acceso de una IA
lib/printing/            ticket · recibo · comanda (puros) · escpos · cola · emitir · agente
agente-impresion/        el binario en Go que corre en la PC del local
lib/billing/factus*.ts   mapeador DIAN · habilitación · credenciales de plataforma
features/dian/           emitir factura y nota crédito
lib/{money,tax,time,turns}.ts                   lógica pura, con tests
features/cocina/reglas.ts   quién marca listo y los dos tramos de tiempo (puro)
features/informes/periodo.ts  día · semana · mes · año · rango a medida (puro)
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

Cinco trampas más, que ya costaron tiempo dos veces cada una:

- **Next inyecta un `role="alert"` vacío** (`#__next-route-announcer__`) para anunciar los
  cambios de ruta. Un `getByRole("alert")` suelto lo agarra a él y falla con `""`. Hay que
  acotar al formulario: `page.locator("form").filter({ has: … }).getByRole("alert")`.
- **Después de enviar un formulario o de hacer clic en un enlace hay que esperar la navegación**
  (`await expect(page).toHaveURL(...)`) antes de leer la página o de hacer otro `goto`. Sin eso
  se lee la página vieja, o el `goto` cancela el envío y la acción nunca corre.
- **Los selectores por texto son ambiguos más seguido de lo que parece**: "Salón" es el `h1` y
  también un área del seed; "Contraseña" coincide con los campos "Contraseña nueva" de cada
  miembro del equipo. Conviene acotar con `level`, `exact` o al formulario que corresponde.
- **`locator.getAttribute()` ESPERA a que el elemento aparezca**, y un `.catch(() => null)`
  encima se come el error pero no el tiempo. `cerrarPedidosAbiertos` buscaba así el primer
  `a[href^="/pedido/"]` y, sin pedidos abiertos —el caso normal al terminar un archivo—, se
  quedaba el presupuesto ENTERO de la prueba en una sola de sus veinticinco vueltas: 298
  segundos medidos. El síntoma era una suite lenta y un `afterEach` que vencía sin decir por
  qué. Para preguntar "¿hay alguno?" va `count()`, que no espera.
- **A una sección de un módulo se llega por la URL, no por una píldora.** Cuando el menú pasó a
  ser el único navegador, los ayudantes que clickeaban "Movimientos y cierre de turno" dejaron
  de encontrar nada: `dejarCajaCerrada` daba por cerrada una caja que seguía abierta y **toda**
  la suite fallaba en su `beforeEach`. El cierre vive en `/caja?vista=movimientos`. Y probar el
  estado con `isVisible()` no alcanza —no espera, así que sobre una pantalla a medio pintar
  contesta "no está"—: hay que esperar a que aparezca uno de los dos estados posibles, como
  hace `abrirMesa` con `boton.or(cuadro)`.

El gestor de paquetes es **pnpm**. No hay `package-lock.json`.
