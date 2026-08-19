#!/usr/bin/env bash
#
# Compila el agente de impresión para los tres sistemas y lo deja donde Next lo
# sirve como archivo estático: `public/descargas/`.
#
# Se corre a mano cuando cambia `agente-impresion/main.go`, no en cada despliegue:
# el build de producción es nixpacks con `providers = ["node"]` y ahí no hay Go.
# Los ejecutables tampoco se versionan —son ~9 MB cada uno— así que en un clon
# nuevo hay que correr esto una vez antes de que el botón de descarga sirva.
#
#   pnpm agente:build
#
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ORIGEN="$RAIZ/agente-impresion"
DESTINO="$RAIZ/public/descargas"

if ! command -v go >/dev/null 2>&1; then
  echo "Falta Go. Instalalo desde https://go.dev/dl/ y volvé a intentar." >&2
  exit 1
fi

# La URL del servidor se HORNEA en el binario.
#
# El programa tiene que saber a quién hablarle antes de tener ninguna
# configuración: si hubiera que escribirla, volveríamos al archivo de texto que
# ningún cajero va a editar. Sale de APP_URL, que es la misma que usa el resto
# del proyecto.
URL="${APP_URL:-}"
if [ -z "$URL" ] && [ -f "$RAIZ/.env" ]; then
  URL="$(grep -E '^APP_URL=' "$RAIZ/.env" | head -1 | cut -d= -f2- | tr -d '"'"'"'' | sed 's:/*$::')"
fi
if [ -z "$URL" ]; then
  echo "Falta APP_URL (ni en el entorno ni en .env): el programa no sabría a qué servidor conectarse." >&2
  exit 1
fi

echo "Compilando el agente de impresión…"
echo "  servidor horneado: $URL"

mkdir -p "$DESTINO"
cd "$ORIGEN"

# CGO apagado: sin él el binario es estático y corre en cualquier máquina del
# mismo sistema, sin depender de las bibliotecas que tenga instaladas.
export CGO_ENABLED=0

compilar() {
  local so="$1" arch="$2" salida="$3" extra="${4:-}"
  echo "  → $salida"
  GOOS="$so" GOARCH="$arch" go build -trimpath \
    -ldflags="-s -w $extra -X main.servidorHorneado=$URL" \
    -o "$DESTINO/$salida" .
}

# -H windowsgui: sin ventana negra. El programa vive en segundo plano y lo que se
# mira es su página de estado en el navegador, no una consola que alguien cierra
# sin querer y deja al local sin imprimir.
compilar windows amd64 platlia-impresion-windows.exe "-H windowsgui"
compilar linux   amd64 platlia-impresion-linux
compilar darwin  arm64 platlia-impresion-mac

echo
echo "Listos en public/descargas/:"
ls -lh "$DESTINO" | tail -n +2 | awk '{printf "  %-38s %s\n", $9, $5}'
echo
echo "Ya aparecen para descargar en Configuración → Impresoras."
