/**
 * El pitido que acompaña a un aviso.
 *
 * Se sintetiza con WebAudio en vez de reproducir un archivo: son dos tonos de
 * 120 ms, no vale bajar un mp3 ni servirlo, y así no hay un recurso más que
 * pueda faltar en la tablet de la cocina.
 *
 * Contra la política de autoplay no se puede hacer nada más que esto: el
 * `AudioContext` se crea recién con el primer toque o tecla de la persona, y si
 * llega un aviso antes de que alguien haya tocado la pantalla, no suena. Es
 * preferible a insistir: un navegador que bloquea el audio lo bloquea y punto.
 */

const CLAVE = "platlia_avisos_sonido";

let contexto: AudioContext | null = null;
let enganchado = false;

type ConstructorAudio = typeof AudioContext;

function crearContexto(): AudioContext | null {
  const Ctor: ConstructorAudio | undefined =
    typeof window === "undefined"
      ? undefined
      : window.AudioContext ??
        (window as unknown as { webkitAudioContext?: ConstructorAudio }).webkitAudioContext;

  if (!Ctor) return null;
  try {
    return new Ctor();
  } catch {
    return null;
  }
}

/**
 * Deja el audio listo en cuanto la persona toque algo.
 *
 * Se llama una vez desde el proveedor. Los oyentes son `once`, así que después
 * del primer gesto no queda nada colgado del documento.
 */
export function engancharSonido(): void {
  if (enganchado || typeof document === "undefined") return;
  enganchado = true;

  const despertar = () => {
    contexto ??= crearContexto();
    if (contexto?.state === "suspended") void contexto.resume().catch(() => {});
  };

  document.addEventListener("pointerdown", despertar, { once: true });
  document.addEventListener("keydown", despertar, { once: true });
}

/** El sonido está encendido salvo que alguien lo haya apagado en este equipo. */
export function leerPreferenciaSonido(): boolean {
  try {
    return localStorage.getItem(CLAVE) !== "false";
  } catch {
    // En modo privado el acceso puede tirar: se asume encendido.
    return true;
  }
}

export function guardarPreferenciaSonido(activo: boolean): void {
  try {
    localStorage.setItem(CLAVE, String(activo));
  } catch {
    // Que no se recuerde entre recargas no es motivo para romper nada.
  }
}

/**
 * Dos notas cortas, la segunda más aguda: se distingue de una notificación de
 * WhatsApp y no se confunde con el ruido de la cocina.
 */
export function pitar(): void {
  contexto ??= crearContexto();
  if (!contexto || contexto.state !== "running") return;

  try {
    const ahora = contexto.currentTime;
    for (const [indice, frecuencia] of [880, 1320].entries()) {
      const desde = ahora + indice * 0.11;
      const oscilador = contexto.createOscillator();
      const volumen = contexto.createGain();

      oscilador.type = "sine";
      oscilador.frequency.value = frecuencia;

      // Sin la rampa el corte suena como un chasquido en un parlante barato,
      // que es exactamente el parlante que hay en un bar.
      volumen.gain.setValueAtTime(0.0001, desde);
      volumen.gain.exponentialRampToValueAtTime(0.12, desde + 0.01);
      volumen.gain.exponentialRampToValueAtTime(0.0001, desde + 0.1);

      oscilador.connect(volumen).connect(contexto.destination);
      oscilador.start(desde);
      oscilador.stop(desde + 0.12);
    }
  } catch {
    // Un audio que no suena no puede tumbar la pantalla.
  }
}
