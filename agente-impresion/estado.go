package main

// La ventanita del programa.
//
// No hay ventana: un binario de Go sin dependencias no dibuja interfaces, y sumar
// una biblioteca gráfica para mostrar cuatro líneas sería cambiar "se compila con
// go build y se copia" por un problema de dependencias en la PC de un bar.
//
// Lo que sí hay es una página local. El programa levanta un servidor en
// 127.0.0.1 y abre el navegador ahí: la persona ve una pantalla de verdad, con
// letras grandes y en español, en vez de una consola negra. Y esa misma página es
// después el lugar donde mirar si está andando.
//
// La consola además se apagó a propósito en Windows (`-H windowsgui`): una ventana
// negra abierta todo el día es una ventana que alguien cierra sin querer, y ahí el
// local deja de imprimir sin que nadie sepa por qué.

import (
	"fmt"
	"html"
	"net"
	"net/http"
	"sync"
	"time"
)

// El puerto es fijo para que la dirección se pueda anotar y volver a visitar.
// Si está ocupado se prueba el siguiente.
const puertoBase = 9777

// vistaEstado son los datos sueltos, sin el candado: es lo que se copia para
// pintar la página. Copiar la estructura con el mutex adentro es un error que
// `go vet` marca —el candado copiado ya no protege nada—.
type vistaEstado struct {
	Emparejado  bool
	Nombre      string
	Servidor    string
	Conectado   bool
	UltimoError string
	Impresos    int
	Fallidos    int
	UltimoPapel time.Time
	Iniciado    time.Time
}

type estado struct {
	mu sync.Mutex
	v  vistaEstado
}

var elEstado = &estado{v: vistaEstado{Iniciado: time.Now()}}

func (e *estado) conectado(valor bool) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.v.Conectado = valor
}

func (e *estado) papelOK() {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.v.Impresos++
	e.v.UltimoPapel = time.Now()
	e.v.UltimoError = ""
}

func (e *estado) papelFallo(motivo string) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.v.Fallidos++
	e.v.UltimoError = motivo
}

func (e *estado) emparejado(nombre, servidor string) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.v.Emparejado = true
	e.v.Nombre = nombre
	e.v.Servidor = servidor
}

func (e *estado) servidor(url string) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.v.Servidor = url
}

func (e *estado) instantanea() vistaEstado {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.v
}

// levantarPagina abre el servidor local y devuelve su dirección.
func levantarPagina(
	alEmparejar func(codigo string) error,
	alConfigurar func(archivo string) error,
) (string, error) {
	var escucha net.Listener
	var err error
	puerto := puertoBase

	for i := 0; i < 20; i++ {
		escucha, err = net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", puerto))
		if err == nil {
			break
		}
		puerto++
	}
	if escucha == nil {
		return "", err
	}

	mux := http.NewServeMux()

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprint(w, paginaHTML(elEstado.instantanea()))
	})

	// Pegar el `agente.json`. Es el camino normal cuando el programa no se bajó
	// desde el propio Platlia, que es lo que pasa cuando lo instala nuestro equipo.
	mux.HandleFunc("/configurar", func(w http.ResponseWriter, r *http.Request) {
		responder(w, r, func() error { return alConfigurar(r.FormValue("configuracion")) })
	})

	// El código de 12 caracteres: solo sirve si el archivo se bajó desde Platlia
	// en esta misma computadora y el navegador le cambió el nombre.
	mux.HandleFunc("/emparejar", func(w http.ResponseWriter, r *http.Request) {
		responder(w, r, func() error { return alEmparejar(r.FormValue("codigo")) })
	})

	go func() {
		_ = http.Serve(escucha, mux)
	}()

	return fmt.Sprintf("http://127.0.0.1:%d", puerto), nil
}

// responder corre lo que se pidió y pinta el resultado. Los dos formularios hacen
// lo mismo con el error y con el éxito; escribirlo dos veces era la forma de que
// uno de los dos se olvidara de redirigir.
func responder(w http.ResponseWriter, r *http.Request, hacer func() error) {
	if r.Method != http.MethodPost {
		http.Redirect(w, r, "/", http.StatusSeeOther)
		return
	}
	if err := hacer(); err != nil {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprint(w, paginaError(err.Error()))
		return
	}
	http.Redirect(w, r, "/", http.StatusSeeOther)
}

const estilos = `
<style>
  :root { color-scheme: dark; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    background: #171512; color: #EDE7DA;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  .caja { width: min(520px, 90vw); padding: 32px; }
  h1 { font-size: 28px; margin: 0 0 4px; }
  p { color: #C9C2AF; line-height: 1.5; margin: 6px 0; }
  .chip {
    display: inline-block; padding: 6px 14px; border-radius: 999px;
    font-weight: 700; font-size: 14px; margin-bottom: 16px;
  }
  .ok { background: rgba(52,199,89,.15); color: #7BE495; }
  .mal { background: rgba(255,78,31,.15); color: #FF8A5F; }
  .esperando { background: rgba(255,193,7,.15); color: #FFD479; }
  .datos { margin-top: 24px; border-top: 1px dashed #3A3733; padding-top: 16px; font-size: 14px; }
  .datos div { display: flex; justify-content: space-between; padding: 4px 0; }
  input {
    width: 100%; box-sizing: border-box; padding: 14px; font-size: 20px;
    text-align: center; letter-spacing: 3px; text-transform: uppercase;
    background: #0F0E0C; color: #EDE7DA; border: 1px solid #3A3733; border-radius: 10px;
  }
  button {
    width: 100%; margin-top: 12px; padding: 14px; font-size: 16px; font-weight: 700;
    background: #FF4E1F; color: #171512; border: 0; border-radius: 10px; cursor: pointer;
  }
  textarea {
    width: 100%; box-sizing: border-box; padding: 12px; font-size: 13px;
    font-family: ui-monospace, Menlo, Consolas, monospace; line-height: 1.5;
    background: #0F0E0C; color: #EDE7DA; border: 1px solid #3A3733; border-radius: 10px;
    resize: vertical;
  }
  details { margin-top: 24px; border-top: 1px dashed #3A3733; padding-top: 16px; }
  summary { cursor: pointer; color: #C9C2AF; font-size: 14px; }
  code { background: #0F0E0C; padding: 2px 6px; border-radius: 4px; }
</style>`

func paginaHTML(e vistaEstado) string {
	if !e.Emparejado {
		return `<!doctype html><meta charset="utf-8"><title>Platlia · impresión</title>` + estilos + `
<div class="caja">
  <span class="chip esperando">Falta un paso</span>
  <h1>Conectá esta computadora</h1>
  <p>En Platlia entrá a <b>Configuración → Impresoras</b>, registrá este equipo y
     tocá <b>Ver el archivo de configuración</b>. Pegá acá abajo lo que te muestre.</p>
  <form method="post" action="/configurar">
    <textarea name="configuracion" rows="7" autofocus
      placeholder='{&#10;  "url": "https://platlia.com",&#10;  "token": "...",&#10;  "nombre": "PC de la caja"&#10;}'></textarea>
    <button type="submit">Conectar</button>
  </form>
  <p style="margin-top:12px;font-size:13px">
    Si preferís no pegarlo, guardá ese archivo como <code>agente.json</code> en esta
    misma carpeta y volvé a abrir el programa: hace exactamente lo mismo.
  </p>
  <details>
    <summary>Tengo un código de 12 caracteres</summary>
    <form method="post" action="/emparejar">
      <input name="codigo" placeholder="XXXX-XXXX-XXXX" autocomplete="off">
      <button type="submit">Conectar con el código</button>
    </form>
    <p style="font-size:13px">
      Es el que trae adentro el archivo cuando se baja desde Platlia en esta misma
      computadora. Vence en una hora y sirve una sola vez.
    </p>
  </details>
</div>`
	}

	chip, titulo := `<span class="chip ok">Todo listo</span>`, "Imprimiendo"
	if !e.Conectado {
		chip, titulo = `<span class="chip mal">Sin conexión</span>`, "No llego a Platlia"
	}

	ultimo := "todavía ninguno"
	if !e.UltimoPapel.IsZero() {
		ultimo = e.UltimoPapel.Format("15:04:05")
	}

	problema := ""
	if e.UltimoError != "" {
		problema = fmt.Sprintf(
			`<p style="color:#FF8A5F">Último problema: %s</p>`, html.EscapeString(e.UltimoError),
		)
	}

	// El CSS va concatenado y NO dentro del formato: tiene un `100%` que
	// `fmt.Sprintf` lee como un verbo desconocido.
	return `<!doctype html><meta charset="utf-8"><title>Platlia · impresión</title>
<meta http-equiv="refresh" content="10">` + estilos + fmt.Sprintf(`
<div class="caja">
  %s
  <h1>%s</h1>
  <p>Esta computadora está atendiendo las impresoras del local.
     Podés cerrar esta pestaña: el programa sigue trabajando solo, y vuelve a
     arrancar cada vez que prendas la computadora.</p>
  %s
  <div class="datos">
    <div><span>Equipo</span><b>%s</b></div>
    <div><span>Servidor</span><b>%s</b></div>
    <div><span>Papeles impresos</span><b>%d</b></div>
    <div><span>Fallidos</span><b>%d</b></div>
    <div><span>Último papel</span><b>%s</b></div>
  </div>
</div>`,
		chip, titulo, problema,
		html.EscapeString(e.Nombre), html.EscapeString(e.Servidor),
		e.Impresos, e.Fallidos, ultimo,
	)
}

func paginaError(motivo string) string {
	return `<!doctype html><meta charset="utf-8"><title>Platlia · impresión</title>` + estilos + `
<div class="caja">
  <span class="chip mal">No funcionó</span>
  <h1>No pude conectar</h1>
  <p>` + html.EscapeString(motivo) + `</p>
  <p>En Platlia: <b>Configuración → Impresoras</b>. Con <b>Ver el archivo de
     configuración</b> sale uno nuevo; el código de 12 caracteres se pide con
     <b>Volver a instalar</b> y vence en una hora.</p>
  <form method="get" action="/"><button type="submit">Probar de nuevo</button></form>
</div>`
}
