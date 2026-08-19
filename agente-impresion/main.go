// Agente de impresión de Platlia.
//
// Corre en una computadora del local, en la misma red que las impresoras
// térmicas. Es el único que puede hablarles: una impresora del bar vive detrás
// del router del bar y desde internet no se llega.
//
// **No hay nada que configurar.** El archivo que se baja desde Platlia trae el
// código de emparejamiento en su propio nombre, así que el programa lo lee, lo
// canjea por su token, se copia a su lugar definitivo, se anota para arrancar con
// la máquina y abre una página en el navegador que dice si está funcionando.
// Doble clic y listo.
//
// Lo que hace después es simple a propósito: pide trabajos, escribe bytes en un
// socket y cuenta cómo le fue. TODA la decisión de formato —qué dice el tiquete,
// en qué página de códigos, dónde corta— la tomó el servidor, que es donde hay
// tests. Un agente tonto es un agente que no hay que actualizar en veinte locales
// cada vez que cambia el pie del recibo.
//
// Sin dependencias fuera de la biblioteca estándar: en una PC de un bar no hay con
// qué resolver un problema de módulos.
//
//	pnpm agente:build   (desde la raíz del proyecto)
package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"sync"
	"syscall"
	"time"
)

const (
	// Cada cuánto se busca trabajo aunque no haya llegado ningún aviso.
	//
	// El aviso llega por SSE y es casi instantáneo, pero un stream se cae, un
	// proxy lo corta y una notebook se suspende. Esta ronda es la red: peor que
	// imprimir tarde es no imprimir y que nadie se entere.
	intervaloDeRonda = 20 * time.Second

	// Cuánto se espera a que la impresora acepte la conexión y los bytes. Una
	// térmica sin papel puede aceptar el socket y no responder nunca.
	timeoutImpresora = 10 * time.Second

	// Antes de reintentar el stream caído. Sube hasta el tope.
	reintentoMinimo = 2 * time.Second
	reintentoMaximo = 60 * time.Second
)

type impresora struct {
	ID     string `json:"id"`
	Nombre string `json:"nombre"`
	Host   string `json:"host"`
	Port   int    `json:"port"`
}

type trabajo struct {
	ID        string    `json:"id"`
	Tipo      string    `json:"tipo"`
	Payload   string    `json:"payload"`
	Intentos  int       `json:"intentos"`
	Impresora impresora `json:"impresora"`
}

type respuestaTrabajos struct {
	Trabajos []trabajo `json:"trabajos"`
}

type resultado struct {
	JobID string `json:"jobId"`
	OK    bool   `json:"ok"`
	Error string `json:"error,omitempty"`
}

// La configuración viva. Puede aparecer a mitad de la ejecución, cuando alguien
// escribe el código en la página local, así que va detrás de un candado.
var (
	muCfg  sync.RWMutex
	laCfg  configuracion
	listo  = make(chan struct{})
	unaVez sync.Once
)

func configActual() configuracion {
	muCfg.RLock()
	defer muCfg.RUnlock()
	return laCfg
}

func main() {
	// El log va a un archivo, no a la pantalla: en Windows el programa se compila
	// sin consola a propósito, y en los otros sistemas corre como servicio. Lo que
	// mira una persona es la página local.
	abrirBitacora()

	log.Printf("Platlia · agente de impresión")

	ctx, cancelar := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancelar()

	// La página local se levanta SIEMPRE y primero: si algo sale mal —el código
	// venció, no hay internet— tiene que haber una pantalla que lo diga. Sin esto,
	// un fallo de emparejamiento sería un programa que se abre y se cierra sin
	// dejar rastro.
	direccion, err := levantarPagina(emparejarDesdeLaPagina)
	if err != nil {
		log.Fatalf("no pude abrir la página local: %v", err)
	}
	log.Printf("página local en %s", direccion)

	primeraVez := arrancar()

	// Solo se abre el navegador cuando hay algo que mostrar: la primera vez, o
	// cuando falta emparejar. En los arranques de todos los días el programa
	// aparece callado, que es lo que se espera de algo que corre en segundo plano.
	if primeraVez || configActual().Token == "" {
		abrirNavegador(direccion)
	}

	go func() {
		<-listo
		trabajar(ctx)
	}()

	<-ctx.Done()
	log.Printf("hasta luego")
}

// arrancar resuelve la configuración: la que ya había, o la que sale del código
// que viene en el nombre del archivo. Devuelve si fue una instalación nueva.
func arrancar() bool {
	if cfg, err := leerConfiguracion(); err == nil && cfg.Token != "" {
		aplicarConfiguracion(cfg)
		// Se reanota el arranque automático en cada ejecución: es idempotente y
		// cubre el caso de que alguien haya limpiado el registro o el servicio.
		if err := instalarse(); err != nil {
			log.Printf("aviso: no pude registrar el arranque automático: %v", err)
		}
		return false
	}

	codigo := codigoDelNombre()
	if codigo == "" {
		log.Printf("sin configuración y sin código en el nombre: espero que lo escriban")
		elEstado.servidor(servidorHorneado)
		return true
	}

	log.Printf("emparejando con el código del nombre del archivo")
	if err := emparejarDesdeLaPagina(codigo); err != nil {
		log.Printf("no pude emparejar: %v", err)
		return true
	}
	return true
}

// emparejarDesdeLaPagina canjea un código, guarda todo y deja el programa listo.
//
// La usan los dos caminos —el código del nombre del archivo y el que alguien
// escribe en la página— para que no haya dos versiones de "quedar configurado".
func emparejarDesdeLaPagina(codigo string) error {
	cfg, err := emparejar(servidorHorneado, codigo)
	if err != nil {
		return err
	}

	if err := guardarConfiguracion(cfg); err != nil {
		return fmt.Errorf("no pude guardar la configuración: %w", err)
	}

	// Recién acá se copia a su lugar definitivo y se anota para arrancar solo: si
	// el emparejamiento falla, no queda nada instalado a medias.
	if err := instalarse(); err != nil {
		log.Printf("aviso: no pude instalarme del todo: %v", err)
	}

	aplicarConfiguracion(cfg)
	log.Printf("emparejado como %q", cfg.Nombre)
	return nil
}

func aplicarConfiguracion(cfg configuracion) {
	muCfg.Lock()
	laCfg = cfg
	muCfg.Unlock()

	elEstado.emparejado(cfg.Nombre, cfg.URL)

	_ = os.MkdirAll(cfg.Respaldo, 0o755)
	unaVez.Do(func() { close(listo) })
}

// trabajar es el bucle de siempre: escuchar, retirar, imprimir.
func trabajar(ctx context.Context) {
	// Un buffer de 1: si llegan tres avisos mientras se está imprimiendo, alcanza
	// con recordar que hay que volver a mirar una vez más.
	despertar := make(chan struct{}, 1)

	go escucharAvisos(ctx, despertar)

	// Una ronda al arrancar: puede haber quedado trabajo de cuando estuvo apagado.
	// Es la misma idea que el snapshot inicial de los streams del servidor.
	procesarPendientes(ctx)

	ticker := time.NewTicker(intervaloDeRonda)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-despertar:
			procesarPendientes(ctx)
		case <-ticker.C:
			procesarPendientes(ctx)
		}
	}
}

// abrirBitacora manda el log a un archivo al lado de la configuración.
func abrirBitacora() {
	log.SetFlags(log.Ldate | log.Ltime)
	if err := os.MkdirAll(carpetaDeDatos(), 0o755); err != nil {
		return
	}
	archivo, err := os.OpenFile(
		filepath.Join(carpetaDeDatos(), "impresion.log"),
		os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644,
	)
	if err == nil {
		log.SetOutput(archivo)
	}
}

// escucharAvisos mantiene abierto el stream del servidor y avisa cuando hay algo.
//
// Se reconecta sola con espera creciente: un corte de internet en un bar dura lo
// que dura, y martillar el servidor cada 100 ms no lo acorta.
func escucharAvisos(ctx context.Context, despertar chan<- struct{}) {
	espera := reintentoMinimo

	for ctx.Err() == nil {
		err := seguirStream(ctx, despertar)
		if ctx.Err() != nil {
			return
		}
		if err != nil {
			log.Printf("aviso: stream caído (%v). Reintento en %s", err, espera)
		}

		select {
		case <-ctx.Done():
			return
		case <-time.After(espera):
		}

		espera *= 2
		if espera > reintentoMaximo {
			espera = reintentoMaximo
		}
	}
}

func seguirStream(ctx context.Context, despertar chan<- struct{}) error {
	cfg := configActual()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, cfg.URL+"/api/impresion/stream", nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+cfg.Token)
	req.Header.Set("Accept", "text/event-stream")

	// Sin timeout: es un stream que dura horas a propósito.
	cliente := &http.Client{}
	res, err := cliente.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()

	if res.StatusCode == http.StatusUnauthorized {
		return errors.New("token rechazado: regeneralo en Configuración → Impresoras")
	}
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("el servidor respondió %d", res.StatusCode)
	}

	log.Printf("conectado, esperando trabajos")
	elEstado.conectado(true)
	defer elEstado.conectado(false)

	lector := bufio.NewScanner(res.Body)
	for lector.Scan() {
		linea := lector.Text()
		// Los `: ping` son latidos y no traen novedad.
		if len(linea) < 5 || linea[0] != 'd' {
			continue
		}
		select {
		case despertar <- struct{}{}:
		default:
			// Ya hay un aviso pendiente: uno alcanza.
		}
	}

	if err := lector.Err(); err != nil {
		return err
	}
	return errors.New("el servidor cerró la conexión")
}

// procesarPendientes retira lo que haya y lo imprime.
func procesarPendientes(ctx context.Context) {
	cfg := configActual()
	trabajos, err := reclamar(ctx, cfg)
	if err != nil {
		log.Printf("no pude pedir trabajo: %v", err)
		return
	}
	if len(trabajos) == 0 {
		return
	}

	resultados := make([]resultado, 0, len(trabajos))

	for _, t := range trabajos {
		bytesDelTrabajo, err := base64.StdEncoding.DecodeString(t.Payload)
		if err != nil {
			resultados = append(resultados, resultado{JobID: t.ID, OK: false, Error: "payload ilegible"})
			continue
		}

		// Se respalda ANTES de intentar. Si se corta la luz a mitad de una
		// impresión, al volver queda el rastro de qué se estaba haciendo; sin
		// esto, el trabajo desaparece del mundo entre el reclamo y el papel.
		ruta := filepath.Join(cfg.Respaldo, t.ID+".bin")
		if err := os.WriteFile(ruta, bytesDelTrabajo, 0o644); err != nil {
			log.Printf("aviso: no pude respaldar %s: %v", t.ID, err)
		}

		if err := imprimir(t.Impresora, bytesDelTrabajo); err != nil {
			log.Printf("✗ %s en %s: %v", t.Tipo, t.Impresora.Nombre, err)
			elEstado.papelFallo(err.Error())
			resultados = append(resultados, resultado{JobID: t.ID, OK: false, Error: err.Error()})
			continue
		}

		log.Printf("✓ %s en %s", t.Tipo, t.Impresora.Nombre)
		elEstado.papelOK()
		resultados = append(resultados, resultado{JobID: t.ID, OK: true})
		// Salió: el respaldo ya no hace falta.
		_ = os.Remove(ruta)
	}

	if err := confirmar(ctx, cfg, resultados); err != nil {
		// El servidor no se enteró. No se borra nada: el reclamo caduca solo y
		// los trabajos vuelven a la cola.
		log.Printf("no pude confirmar: %v", err)
	}
}

func reclamar(ctx context.Context, cfg configuracion) ([]trabajo, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, cfg.URL+"/api/impresion/trabajos", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+cfg.Token)

	cliente := &http.Client{Timeout: 30 * time.Second}
	res, err := cliente.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()

	if res.StatusCode == http.StatusUnauthorized {
		return nil, errors.New("token rechazado")
	}
	if res.StatusCode != http.StatusOK {
		cuerpo, _ := io.ReadAll(io.LimitReader(res.Body, 500))
		return nil, fmt.Errorf("HTTP %d: %s", res.StatusCode, cuerpo)
	}

	var respuesta respuestaTrabajos
	if err := json.NewDecoder(res.Body).Decode(&respuesta); err != nil {
		return nil, err
	}
	return respuesta.Trabajos, nil
}

func confirmar(ctx context.Context, cfg configuracion, resultados []resultado) error {
	if len(resultados) == 0 {
		return nil
	}

	cuerpo, err := json.Marshal(map[string]any{"resultados": resultados})
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(
		ctx, http.MethodPost, cfg.URL+"/api/impresion/trabajos", bytes.NewReader(cuerpo),
	)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+cfg.Token)
	req.Header.Set("Content-Type", "application/json")

	cliente := &http.Client{Timeout: 30 * time.Second}
	res, err := cliente.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	io.Copy(io.Discard, io.LimitReader(res.Body, 1024))

	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("HTTP %d", res.StatusCode)
	}
	return nil
}

// imprimir abre el socket de la impresora y le escribe los bytes tal cual.
//
// El puerto 9100 crudo es lo que entiende casi toda térmica de red: no hay
// protocolo, se escriben los bytes y la máquina los interpreta.
func imprimir(imp impresora, datos []byte) error {
	direccion := net.JoinHostPort(imp.Host, fmt.Sprint(imp.Port))

	conexion, err := net.DialTimeout("tcp", direccion, timeoutImpresora)
	if err != nil {
		return fmt.Errorf("no responde en %s: %w", direccion, err)
	}
	defer conexion.Close()

	// Una impresora sin papel puede aceptar la conexión y quedarse muda: sin este
	// plazo, el agente se cuelga esperando para siempre y deja de imprimir todo
	// lo demás.
	if err := conexion.SetWriteDeadline(time.Now().Add(timeoutImpresora)); err != nil {
		return err
	}

	if _, err := conexion.Write(datos); err != nil {
		return fmt.Errorf("falló al escribir: %w", err)
	}
	return nil
}
