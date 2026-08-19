# Agente de impresión

El programa que corre en una PC del local y le habla a las impresoras térmicas.
Existe porque una impresora del bar vive detrás del router del bar: desde el
servidor no se llega, por más que el servidor sepa perfectamente qué hay que
imprimir.

## Qué hace

1. Se conecta al servidor y espera aviso (`/api/impresion/stream`).
2. Cuando hay trabajo, lo retira (`GET /api/impresion/trabajos`) — y el reclamo es
   exclusivo, así que dos agentes corriendo no imprimen el mismo recibo.
3. Le escribe los bytes a la impresora por el puerto 9100.
4. Cuenta cómo le fue (`POST /api/impresion/trabajos`).

**No decide nada de formato.** Los bytes ESC/POS llegan armados desde el servidor,
que es donde hay tests. Así, cambiar el pie del recibo no obliga a actualizar el
programa en veinte locales.

## Para quien lo instala en el local: no hay nada que escribir

En **Configuración → Impresoras → Registrar equipo**, Platlia entrega el archivo
ya listo. Se baja, se hace doble clic, y termina. En ese doble clic el programa:

1. **Se lee su propio nombre** —`platlia-impresion__K7M2-9QXT-4B8N.exe`— y saca de
   ahí el código de emparejamiento.
2. **Canjea ese código por su token** (`POST /api/impresion/emparejar`) y lo guarda
   él solo, con permisos 0600.
3. **Se copia a su lugar definitivo**: `%AppData%\Platlia` en Windows,
   `~/.config/Platlia` en Linux, `Application Support` en macOS. No se queda en
   Descargas, que es una carpeta que la gente vacía.
4. **Se anota para arrancar con la máquina**, sin pedir permisos de administrador:
   `HKCU\…\Run` en Windows, una unidad `systemd --user` en Linux, un LaunchAgent en
   macOS.
5. **Abre el navegador en su página de estado** (`http://127.0.0.1:9777`) para que
   se vea que quedó andando.

Después no se ve más: **no hay ventana**. En Windows se compila con `-H windowsgui`
justamente para que no quede una consola negra abierta todo el día, que es una
ventana que alguien cierra sin querer y ahí el local deja de imprimir sin que nadie
sepa por qué. Para mirar cómo va se entra a `http://127.0.0.1:9777` desde esa misma
computadora.

El código **vale una hora y un solo uso**. Es corto (12 caracteres, sin `0/O` ni
`1/I/L`) porque no tiene que aguantar días de fuerza bruta: se quema apenas se
canjea. El token que sí es largo no lo escribe nadie nunca.

Si el navegador le cambió el nombre al archivo, o si se bajó desde otra
computadora, la página local muestra un campo para escribir el código a mano. Es el
plan B, no el camino.

## El otro camino: instalación asistida con `agente.json`

El de arriba supone que el programa se baja **desde el servidor**, porque el código
viaja en el nombre del archivo. Eso pide que los ejecutables estén publicados ahí, y
el despliegue no compila Go: no los tiene y no los va a tener.

Cuando la instalación la hace nuestro propio equipo —que llega al local con el
ejecutable ya compilado— lo único que tiene que viajar del servidor a esa
computadora es el archivo de configuración:

1. En **Configuración → Impresoras**, botón **Configurar a mano** del equipo. Sale
   el `agente.json` con su token, para copiar o bajar.
2. Se deja ese `agente.json` **en la misma carpeta que el ejecutable**.
3. Doble clic en el ejecutable.

De ahí en adelante hace exactamente lo mismo que el otro camino: guarda la
configuración en la carpeta de datos, se copia a su lugar definitivo, se anota para
arrancar con la máquina y abre su página de estado. **Lo único que cambia es de
dónde sale el token**; no hay ningún paso manual después de pegar el archivo.

Se lee del lado del ejecutable y no de la carpeta de datos porque esa carpeta es
distinta en cada sistema —`%AppData%`, `~/.config`, `Application Support`— y con el
usuario adentro de la ruta: pedirle a alguien que la encuentre antes de poder copiar
nada es el archivo de texto hecho a mano que este diseño evita.

El token **se muestra una sola vez** —de la base solo queda su hash— y pedirlo
**quema el código de emparejamiento** de ese equipo: son dos llaves para la misma
puerta y no tiene sentido que convivan. Conviene borrar el `agente.json` de la
carpeta desde donde se abrió el programa: ya quedó guardado con permisos 0600 en la
carpeta de datos, y en Descargas es un secreto de larga vida a la vista.

## Compilar

Sin dependencias fuera de la biblioteca estándar: en una PC de un bar no hay con
qué resolver un problema de módulos.

```bash
pnpm agente:build
```

Eso compila los tres sistemas y los deja en `public/descargas/`, que es de donde
los sirve el botón de Configuración. **La URL del servidor se hornea en el binario**
(`-X main.servidorHorneado=$APP_URL`): el programa tiene que saber a quién hablarle
antes de tener ninguna configuración, y si hubiera que escribirla volveríamos al
archivo de texto que ningún cajero va a editar.

Los ejecutables no se versionan —son ~7 MB cada uno— y el despliegue es nixpacks
con `providers = ["node"]`, donde no hay Go. En un clon nuevo hay que correrlo una
vez antes de que el botón de descarga sirva.

A mano, si hace falta:

```bash
cd agente-impresion
CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build \
  -ldflags="-s -w -H windowsgui -X main.servidorHorneado=https://platlia.com" \
  -o platlia-impresion.exe .
```

## Dónde deja sus cosas

Todo en la carpeta de datos del usuario (`os.UserConfigDir()` + `Platlia`):

| Archivo | Qué es |
|---|---|
| `agente.json` | url, token, nombre del equipo. Lo escribe el programa; en la instalación asistida se copia del que se dejó junto al ejecutable |
| `platlia-impresion[.exe]` | la copia instalada, que es la que arranca con la máquina |
| `respaldo/` | cada trabajo antes de intentarlo; se borra al confirmarse |
| `impresion.log` | la bitácora, que es la única salida: no hay consola |

## Cuando algo no sale

- **"ese código no sirve"**: vale una hora y un solo uso. Se pide otro con **Volver
  a instalar** en Configuración → Impresoras.
- **"token rechazado"**: alguien apretó "Volver a instalar" o "Configurar a mano",
  y las dos cosas invalidan el token viejo. Hay que traer el archivo nuevo.
- **"no responde en 192.168.x.x:9100"**: la impresora está apagada, tiene otra IP,
  o la PC no está en la misma red. Probá `ping` a esa IP desde la PC del agente.
- El trabajo se reintenta **tres veces**. Si no sale, salta un aviso en las
  pantallas del local y va un correo al dueño: un papel que no salió en silencio
  es un cliente esperando.
- Cada trabajo se respalda en disco antes de intentarlo y se borra al confirmarse.
  Si se corta la luz a mitad de una impresión, queda el rastro de qué se estaba
  haciendo.
