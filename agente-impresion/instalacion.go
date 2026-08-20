package main

// Todo lo que pasa la primera vez que alguien hace doble clic.
//
// El objetivo es que no haya que escribir NADA. Antes esto pedía copiar un token
// de 43 caracteres a un archivo `agente.json` hecho a mano: un cajero no va a
// hacer eso, y quien lo intente va a poner una coma de más y no va a entender por
// qué no anda.
//
// Ahora el código de emparejamiento viaja en el NOMBRE del archivo que se
// descarga —`platlia-impresion__K7M2-9QXT-4B8N.exe`—, así que el programa se lee a
// sí mismo, canjea ese código por su token y guarda la configuración solo.

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"time"
)

// La URL del servidor se hornea al compilar (`-X main.servidorHorneado=…`).
//
// Tiene que saber a quién hablarle ANTES de tener ninguna configuración; si
// hubiera que escribirla, volveríamos al archivo de texto que nadie va a editar.
var servidorHorneado = "https://platlia.com"

type configuracion struct {
	URL      string `json:"url"`
	Token    string `json:"token"`
	Nombre   string `json:"nombre,omitempty"`
	Respaldo string `json:"respaldo,omitempty"`
}

// El código va después de un doble guion bajo, que no aparece en el código mismo
// —su alfabeto es solo letras y números— así que no hay forma de confundirlos.
// Se acepta lo que Windows le agrega al bajar dos veces: " (1)".
var patronCodigo = regexp.MustCompile(`__([0-9A-Za-z-]{10,20})`)

// carpetaDeDatos es donde vive la configuración y el respaldo de los trabajos.
//
// No al lado del ejecutable: el archivo se baja a Descargas y esa carpeta se
// vacía. `os.UserConfigDir` da el lugar que cada sistema tiene para esto —
// %AppData% en Windows, ~/.config en Linux, Application Support en macOS—.
func carpetaDeDatos() string {
	base, err := os.UserConfigDir()
	if err != nil {
		base = "."
	}
	return filepath.Join(base, "Platlia")
}

func rutaDeConfiguracion() string {
	return filepath.Join(carpetaDeDatos(), "agente.json")
}

// rutaInstalada es dónde queda el programa para siempre.
func rutaInstalada() string {
	nombre := "platlia-impresion"
	if runtime.GOOS == "windows" {
		nombre += ".exe"
	}
	return filepath.Join(carpetaDeDatos(), nombre)
}

// rutaVecina es el `agente.json` puesto AL LADO del ejecutable.
//
// Es el camino de la instalación asistida: quien instala llega al local con el
// programa ya compilado y el archivo que le dio Platlia, los deja juntos en una
// carpeta y hace doble clic. Sin esto habría que adivinar dónde vive
// `os.UserConfigDir()` en la máquina de ese cliente antes de poder copiar nada.
func rutaVecina() (string, error) {
	ejecutable, err := os.Executable()
	if err != nil {
		return "", err
	}
	return filepath.Join(filepath.Dir(ejecutable), "agente.json"), nil
}

func leerConfiguracion() (configuracion, error) {
	return leerConfiguracionDe(rutaDeConfiguracion())
}

// leerConfiguracionVecina lee el archivo que se dejó junto al ejecutable.
func leerConfiguracionVecina() (configuracion, error) {
	ruta, err := rutaVecina()
	if err != nil {
		return configuracion{}, err
	}
	return leerConfiguracionDe(ruta)
}

func leerConfiguracionDe(ruta string) (configuracion, error) {
	var cfg configuracion
	datos, err := os.ReadFile(ruta)
	if err != nil {
		return cfg, err
	}
	if err := json.Unmarshal(datos, &cfg); err != nil {
		return cfg, err
	}
	if cfg.URL == "" {
		cfg.URL = servidorHorneado
	}
	if cfg.Respaldo == "" {
		cfg.Respaldo = filepath.Join(carpetaDeDatos(), "respaldo")
	}
	return cfg, nil
}

func guardarConfiguracion(cfg configuracion) error {
	if err := os.MkdirAll(carpetaDeDatos(), 0o755); err != nil {
		return err
	}
	datos, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	// 0600: el token es la llave de la cola de impresión del local.
	return os.WriteFile(rutaDeConfiguracion(), datos, 0o600)
}

// codigoDelNombre saca el código de emparejamiento del nombre del propio archivo.
func codigoDelNombre() string {
	ejecutable, err := os.Executable()
	if err != nil {
		return ""
	}
	coincidencia := patronCodigo.FindStringSubmatch(filepath.Base(ejecutable))
	if len(coincidencia) < 2 {
		return ""
	}
	return coincidencia[1]
}

// emparejar canjea el código por el token definitivo.
func emparejar(url, codigo string) (configuracion, error) {
	cfg := configuracion{URL: url}

	cuerpo, _ := json.Marshal(map[string]string{"codigo": codigo})
	req, err := http.NewRequest(http.MethodPost, url+"/api/impresion/emparejar", bytes.NewReader(cuerpo))
	if err != nil {
		return cfg, err
	}
	req.Header.Set("Content-Type", "application/json")

	cliente := &http.Client{Timeout: 30 * time.Second}
	res, err := cliente.Do(req)
	if err != nil {
		return cfg, fmt.Errorf("no pude comunicarme con %s: %w", url, err)
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		var detalle struct {
			Error string `json:"error"`
		}
		crudo, _ := io.ReadAll(io.LimitReader(res.Body, 1000))
		_ = json.Unmarshal(crudo, &detalle)
		if detalle.Error != "" {
			return cfg, errors.New(detalle.Error)
		}
		return cfg, fmt.Errorf("el servidor respondió %d", res.StatusCode)
	}

	var respuesta struct {
		Token  string `json:"token"`
		Nombre string `json:"nombre"`
	}
	if err := json.NewDecoder(res.Body).Decode(&respuesta); err != nil {
		return cfg, err
	}

	cfg.Token = respuesta.Token
	cfg.Nombre = respuesta.Nombre
	cfg.Respaldo = filepath.Join(carpetaDeDatos(), "respaldo")
	return cfg, nil
}

// instalarse se copia a su lugar definitivo y se anota para arrancar con la máquina.
//
// El archivo se bajó a Descargas y esa carpeta se vacía; si el programa viviera
// ahí, un día el local dejaría de imprimir sin que nadie hubiera tocado nada.
func instalarse() error {
	origen, err := os.Executable()
	if err != nil {
		return err
	}
	destino := rutaInstalada()

	// Ya está donde tiene que estar: es un arranque normal, no una instalación.
	if rutasIguales(origen, destino) {
		return registrarArranque(destino)
	}

	if err := os.MkdirAll(carpetaDeDatos(), 0o755); err != nil {
		return err
	}

	datos, err := os.ReadFile(origen)
	if err != nil {
		return err
	}
	// Ningún sistema deja reemplazar un ejecutable que está corriendo, así que si
	// ya había una versión viva hay que apartarla antes. Windows lo resuelve
	// renombrando; en Linux el kernel devuelve ETXTBSY y hay que parar el servicio
	// —salvo que el servicio seamos nosotros, en cuyo caso nos estaríamos matando
	// en mitad de la instalación—. `registrarArranque` lo vuelve a levantar al final.
	if runtime.GOOS == "windows" {
		_ = os.Rename(destino, destino+".viejo")
	}
	if runtime.GOOS == "linux" && !soyElServicio() {
		_ = exec.Command("systemctl", "--user", "stop", unidadLinux).Run()
	}
	if err := os.WriteFile(destino, datos, 0o755); err != nil {
		return err
	}

	return registrarArranque(destino)
}

func rutasIguales(a, b string) bool {
	ra, err1 := filepath.Abs(a)
	rb, err2 := filepath.Abs(b)
	if err1 != nil || err2 != nil {
		return false
	}
	if runtime.GOOS == "windows" {
		return strings.EqualFold(ra, rb)
	}
	return ra == rb
}

// registrarArranque hace que el programa vuelva solo cada vez que se prende la PC.
//
// Sin privilegios de administrador en los tres sistemas: se registra para el
// usuario, no para la máquina. Pedir permisos de administrador en la caja de un
// bar es la forma más rápida de que alguien cancele el cuadro y nunca más lo abra.
func registrarArranque(ruta string) error {
	switch runtime.GOOS {
	case "windows":
		return arranqueWindows(ruta)
	case "linux":
		return arranqueLinux(ruta)
	case "darwin":
		return arranqueMac(ruta)
	}
	return nil
}

func arranqueWindows(ruta string) error {
	// Por `reg.exe` y no por la API del registro: esa vive en golang.org/x/sys y
	// sumar una dependencia externa a un programa que se compila para veinte
	// locales no vale la pena por una línea.
	cmd := exec.Command(
		"reg", "add",
		`HKCU\Software\Microsoft\Windows\CurrentVersion\Run`,
		"/v", "PlatliaImpresion",
		"/t", "REG_SZ",
		"/d", `"`+ruta+`"`,
		"/f",
	)
	return cmd.Run()
}

const unidadLinux = "platlia-impresion.service"

// soyElServicio dice si a ESTE proceso lo lanzó systemd como la unidad del agente.
//
// Hace falta antes de pararla o reiniciarla: si la unidad somos nosotros, esas dos
// cosas son matarnos a nosotros mismos a mitad de la instalación.
//
// No sirve mirar `INVOCATION_ID`. systemd la pone en el servicio, pero **los hijos
// la heredan**, y en un escritorio moderno la propia terminal cuelga de una unidad
// (`app-gnome-…service`): todo lo que alguien abre a mano la trae puesta, así que
// da "sí" siempre. Lo único que no miente es el PID.
func soyElServicio() bool {
	salida, err := exec.Command(
		"systemctl", "--user", "show", unidadLinux, "-p", "MainPID", "--value",
	).Output()
	if err != nil {
		return false
	}
	return strings.TrimSpace(string(salida)) == strconv.Itoa(os.Getpid())
}

func arranqueLinux(ruta string) error {
	carpeta := filepath.Join(os.Getenv("HOME"), ".config", "systemd", "user")
	if err := os.MkdirAll(carpeta, 0o755); err != nil {
		return err
	}

	unidad := fmt.Sprintf(`[Unit]
Description=Platlia · agente de impresión
After=network-online.target

[Service]
ExecStart=%s
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
`, ruta)

	destino := filepath.Join(carpeta, "platlia-impresion.service")
	if err := os.WriteFile(destino, []byte(unidad), 0o644); err != nil {
		return err
	}

	_ = exec.Command("systemctl", "--user", "daemon-reload").Run()
	if err := exec.Command("systemctl", "--user", "enable", unidadLinux).Run(); err != nil {
		return err
	}

	// `enable` solo lo deja anotado para el próximo arranque, y en Linux eso deja un
	// hueco que no existe en los otros dos sistemas: acá el programa se abre desde
	// una terminal, así que al cerrarla se muere y el local deja de imprimir hasta
	// que alguien reinicie la máquina. En Windows el proceso ya quedó suelto y sin
	// ventana, y en macOS `launchctl load -w` arranca la copia instalada en el acto.
	//
	// `restart` y no `start` para que una reinstalación levante el binario nuevo:
	// con `start`, una unidad que ya estaba corriendo la versión vieja se quedaba
	// con ella y la actualización no se aplicaba hasta el próximo reinicio.
	if !soyElServicio() {
		_ = exec.Command("systemctl", "--user", "restart", unidadLinux).Run()
	}
	return nil
}

func arranqueMac(ruta string) error {
	carpeta := filepath.Join(os.Getenv("HOME"), "Library", "LaunchAgents")
	if err := os.MkdirAll(carpeta, 0o755); err != nil {
		return err
	}

	plist := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.platlia.impresion</string>
  <key>ProgramArguments</key><array><string>%s</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
</dict>
</plist>
`, ruta)

	destino := filepath.Join(carpeta, "com.platlia.impresion.plist")
	if err := os.WriteFile(destino, []byte(plist), 0o644); err != nil {
		return err
	}
	return exec.Command("launchctl", "load", "-w", destino).Run()
}

// abrirNavegador muestra la página de estado sin que nadie tenga que escribir una URL.
func abrirNavegador(url string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	case "darwin":
		cmd = exec.Command("open", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	_ = cmd.Start()
}
