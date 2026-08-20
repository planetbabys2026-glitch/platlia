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

**Caja tiene tres secciones y su vista de entrada depende del negocio.** `seccionesDeCaja(usaMesas)` y
`vistaInicialDeCaja(usaMesas)` viven juntas en `navegacion.ts` porque el menú y la pantalla tienen
que coincidir: un negocio de mostrador no tiene cuentas de mesa que cobrar, así que no se le ofrece
"Cobrar cuentas" y entra por el historial. Depende de configuración del negocio, no de datos del
momento, así que el enlace sigue llevando siempre al mismo lado.

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

**Se decide en el momento en que se le pregunta al cliente, no en la caja.** Son tres puertas:

| Dónde | Quién elige | Con qué acción |
|---|---|---|
| `/pedido/[id]`, al **Pedir la cuenta** | el mesero, en la mesa | `pedirCuenta` |
| Menú QR, al confirmar el pedido | el propio comensal | `crearPedidoClienteQR` |
| POS, en el modal de cobro | el cajero de mostrador | `procesarVentaPosCompleta` |

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
lib/printing/            ticket · recibo · comanda (puros) · escpos · cola · emitir · agente
agente-impresion/        el binario en Go que corre en la PC del local
lib/billing/factus*.ts   mapeador DIAN · habilitación · credenciales de plataforma
features/dian/           emitir factura y nota crédito
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
