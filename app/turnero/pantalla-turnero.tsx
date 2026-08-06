"use client";

import { useEffect, useState, useRef } from "react";
import { Logotipo } from "@/components/marca/logo";
import { formatTurno } from "@/lib/turns";
import { PantallaSiempreEncendida } from "./pantalla";

type TurnoItem = {
  orderId: string;
  turno: number;
  nombre: string | null;
  isMesa?: boolean;
  listoAt?: Date | null;
};

type TurneroProps = {
  businessName: string;
  turnNumberMax: number;
  listos: TurnoItem[];
  mediaMode: string;
  imagesRaw: string;
  imageIntervalSeconds: number;
  youtubeUrl: string | null;
  badgePosition: string; // "TOP_LEFT" | "TOP_RIGHT"
};

/** Extrae el ID de un video de YouTube desde cualquier formato de URL */
function extractYoutubeId(urlOrId: string | null): string | null {
  if (!urlOrId) return null;
  const trimmed = urlOrId.trim();
  if (trimmed.length === 11 && !trimmed.includes("/")) return trimmed;

  const match = trimmed.match(
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/
  );
  return match ? match[1] : null;
}

/** Parsea URLs de imágenes separadas por líneas o comas */
function parseImageUrls(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split(/[\n,]/)
    .map((url) => url.trim())
    .filter((url) => url.startsWith("http://") || url.startsWith("https://"));
}

/** Emite un tono de campana / chime usando Web Audio API sin requerir archivos mp3 */
function playChimeSound() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = "sine";
    osc2.type = "sine";

    // Frecuencia E5 -> A5 (tono alegre de campana)
    osc1.frequency.setValueAtTime(659.25, ctx.currentTime); // E5
    osc1.frequency.setValueAtTime(880, ctx.currentTime + 0.15); // A5

    osc2.frequency.setValueAtTime(1318.5, ctx.currentTime); // E6

    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start();
    osc2.start();

    osc1.stop(ctx.currentTime + 1.2);
    osc2.stop(ctx.currentTime + 1.2);
  } catch {
    // Si el navegador bloquea audio sin interacción del usuario, silencia.
  }
}

export function PantallaTurnero({
  businessName,
  turnNumberMax,
  listos: initialListos,
  mediaMode,
  imagesRaw,
  imageIntervalSeconds,
  youtubeUrl,
  badgePosition,
}: TurneroProps) {
  const images = parseImageUrls(imagesRaw);
  const youtubeId = extractYoutubeId(youtubeUrl);

  // Estado local de turnos listos (se actualiza vía SSE Redis Pub/Sub sin polling)
  const [listos, setListos] = useState<TurnoItem[]>(initialListos);

  // Sincronizar estado inicial
  useEffect(() => {
    setListos(initialListos);
  }, [initialListos]);

  // Conexión SSE en tiempo real usando Redis Pub/Sub
  useEffect(() => {
    let es: EventSource | null = null;
    try {
      es = new EventSource("/api/turnero/stream");

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (
            (data.type === "init" || data.type === "update") &&
            Array.isArray(data.listos)
          ) {
            setListos(data.listos);
          }
        } catch {
          // Ignorar errores de sintaxis en el stream
        }
      };
    } catch {
      // Si el navegador no soporta EventSource
    }

    return () => {
      if (es) es.close();
    };
  }, []);

  // Estado del carrusel de imágenes
  const [currentImgIndex, setCurrentImgIndex] = useState(0);

  // Estado para detectar nuevos turnos listos y disparar la alerta central
  const [nuevoTurnoDestacado, setNuevoTurnoDestacado] = useState<TurnoItem | null>(null);
  const [animandoHaciaEsquina, setAnimandoHaciaEsquina] = useState(false);
  const prevListosIdRef = useRef<string>("");

  // Rotación del carrusel
  useEffect(() => {
    if (mediaMode !== "IMAGES" || images.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentImgIndex((prev) => (prev + 1) % images.length);
    }, Math.max(3, imageIntervalSeconds) * 1000);
    return () => clearInterval(interval);
  }, [mediaMode, images, imageIntervalSeconds]);

  // Refs de temporizadores que persisten a través de re-renders
  const timerTransicionRef = useRef<NodeJS.Timeout | null>(null);
  const timerFinalRef = useRef<NodeJS.Timeout | null>(null);

  // Alerta sonora y animación cuando aparece un pedido verdaderamente NUEVO
  useEffect(() => {
    if (listos.length === 0) {
      prevListosIdRef.current = "";
      if (timerTransicionRef.current) clearTimeout(timerTransicionRef.current);
      if (timerFinalRef.current) clearTimeout(timerFinalRef.current);
      setNuevoTurnoDestacado(null);
      setAnimandoHaciaEsquina(false);
      return;
    }

    const masReciente = listos[0];
    const currentId = masReciente.orderId;

    // Solo se dispara si cambia el ID del pedido listo en el tope de la lista
    if (prevListosIdRef.current !== currentId) {
      prevListosIdRef.current = currentId;
      playChimeSound();

      if (timerTransicionRef.current) clearTimeout(timerTransicionRef.current);
      if (timerFinalRef.current) clearTimeout(timerFinalRef.current);

      setNuevoTurnoDestacado(masReciente);
      setAnimandoHaciaEsquina(false);

      // A los 4.0s inicia transición de encogimiento hacia esquina
      timerTransicionRef.current = setTimeout(() => {
        setAnimandoHaciaEsquina(true);
      }, 4000);

      // A los 5.0s desactiva completamente el modal y remueve el blur
      timerFinalRef.current = setTimeout(() => {
        setNuevoTurnoDestacado(null);
        setAnimandoHaciaEsquina(false);
      }, 5000);
    }
  }, [listos]);

  // Desbloquear audio en el primer clic o toque de la pantalla si el navegador bloquea autoplay
  useEffect(() => {
    const unlockAudio = () => {
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          const dummyCtx = new AudioCtx();
          if (dummyCtx.state === "suspended") void dummyCtx.resume();
        }
      } catch {}
    };
    window.addEventListener("click", unlockAudio, { once: true });
    window.addEventListener("touchstart", unlockAudio, { once: true });
    return () => {
      window.removeEventListener("click", unlockAudio);
      window.removeEventListener("touchstart", unlockAudio);
    };
  }, []);

  // Determinar la clase de posicionamiento del recuadro sobrepuesto
  const isTopLeft = badgePosition === "TOP_LEFT";
  const posClass = isTopLeft ? "top-6 left-6" : "top-6 right-6";

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-neutral-950 text-white font-sans select-none">
      <PantallaSiempreEncendida />
      <PantallaSiempreEncendida />

      {/* ─────────────────────────────────────────────────────────────
          capa 1: MULTIMEDIA DE FONDO (Carrusel / YouTube / Estándar)
          ───────────────────────────────────────────────────────────── */}

      {/* A: Carrusel de Imágenes */}
      {mediaMode === "IMAGES" && images.length > 0 && (
        <div className="absolute inset-0 z-0">
          {images.map((url, idx) => (
            <div
              key={url + idx}
              className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
                idx === currentImgIndex ? "opacity-100 scale-100" : "opacity-0 scale-105"
              }`}
              style={{
                backgroundImage: `url(${url})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            />
          ))}
          {/* Overlay oscuro sutil para dar legibilidad */}
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
        </div>
      )}

      {/* B: Video Embed de YouTube */}
      {mediaMode === "YOUTUBE" && youtubeId && (
        <div className="absolute inset-0 z-0 flex items-center justify-center bg-black pointer-events-none overflow-hidden">
          <iframe
            src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1&mute=1&loop=1&playlist=${youtubeId}&controls=0&showinfo=0&autohide=1&modestbranding=1&rel=0`}
            className="w-full h-full border-0 pointer-events-none opacity-95"
            allow="autoplay; encrypted-media"
            title="Fondo Turnero"
          />
          <div className="absolute inset-0 bg-black/15 pointer-events-none" />
        </div>
      )}

      {/* C: Fondo Oscuro por Defecto (Platlia Standard) */}
      {(mediaMode === "NONE" || (mediaMode === "IMAGES" && images.length === 0) || (mediaMode === "YOUTUBE" && !youtubeId)) && (
        <div className="absolute inset-0 z-0 bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950">
          <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#1D4E51_1px,transparent_1px)] [background-size:24px_24px]" />
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          capa 2: MODAL SOBREPUESTO CENTRAL (Alerta de Nuevo Turno Listo)
          ───────────────────────────────────────────────────────────── */}
      {nuevoTurnoDestacado && (
        <div
          onClick={() => {
            setNuevoTurnoDestacado(null);
            setAnimandoHaciaEsquina(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md cursor-pointer transition-all duration-700 ease-in-out"
        >
          <div
            className={`flex flex-col items-center justify-center rounded-3xl border-4 border-emerald-500 bg-gradient-to-b from-neutral-900 to-neutral-950 p-10 text-center shadow-2xl shadow-emerald-500/30 transition-all duration-700 ease-in-out ${
              animandoHaciaEsquina
                ? `scale-30 opacity-0 translate-y-[-200px] ${isTopLeft ? "-translate-x-[400px]" : "translate-x-[400px]"}`
                : "scale-100 opacity-100 animate-pulse"
            }`}
          >
            <span className="text-xl font-bold uppercase tracking-[0.3em] text-emerald-400 sm:text-3xl">
              ¡Orden Lista para Entregar!
            </span>

            <div className="my-4 flex items-center justify-center rounded-2xl bg-emerald-500 px-8 py-4 text-white shadow-lg">
              <span className="numeral text-8xl font-black leading-none tracking-tight sm:text-9xl">
                {formatTurno(nuevoTurnoDestacado.turno, turnNumberMax, nuevoTurnoDestacado.isMesa)}
              </span>
            </div>

            {nuevoTurnoDestacado.nombre && (
              <span className="max-w-md truncate text-2xl font-semibold text-white/90 sm:text-4xl">
                {nuevoTurnoDestacado.nombre}
              </span>
            )}

            <p className="mt-4 text-base font-medium text-neutral-400 sm:text-xl">
              Por favor acérquese a retirar su pedido
            </p>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          capa 3: RECUADRO SOBREPUESTO EN ESQUINA (Turnos Listos)
          ───────────────────────────────────────────────────────────── */}
      <div className={`fixed z-30 ${posClass} max-w-md sm:max-w-lg w-full`}>
        <div className="rounded-3xl border border-white/15 bg-neutral-950/90 backdrop-blur-2xl p-6 shadow-2xl space-y-4">
          
          {/* Header con Logotipo y Nombre del Negocio */}
          <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
            <Logotipo className="h-7 opacity-90" />
            <span className="truncate text-sm font-semibold tracking-wider text-neutral-300 uppercase">
              {businessName}
            </span>
          </div>

          {/* Encabezado del Recuadro */}
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold tracking-[0.2em] text-emerald-400 uppercase flex items-center gap-2">
              <span className="size-2.5 rounded-full bg-emerald-500 animate-ping" />
              Órdenes Listas ({listos.length})
            </h2>
          </div>

          {/* Lista de Números Listos (Hasta 4 pedidos perfectamente ajustados sin scrollbar) */}
          {listos.length === 0 ? (
            <div className="py-8 text-center text-neutral-500 font-medium text-sm">
              Esperando pedidos listos...
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3.5 p-1">
                {listos.slice(0, 4).map((turno, idx) => (
                  <div
                    key={turno.orderId}
                    className={`flex flex-col items-center justify-center rounded-2xl p-4 sm:p-5 transition-all duration-300 ${
                      idx === 0
                        ? "bg-gradient-to-br from-emerald-600 via-emerald-700 to-emerald-800 text-white shadow-xl shadow-emerald-950/50 ring-2 ring-emerald-400"
                        : "bg-neutral-900/95 text-neutral-200 border border-white/10"
                    }`}
                  >
                    <span className="numeral text-4xl font-black leading-none tracking-tight sm:text-5xl">
                      {formatTurno(turno.turno, turnNumberMax, turno.isMesa)}
                    </span>
                    {turno.nombre && (
                      <span className="mt-1.5 truncate max-w-full text-xs font-medium opacity-90">
                        {turno.nombre}
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {listos.length > 4 && (
                <div className="text-center text-xs font-semibold text-emerald-400/90 pt-1">
                  + {listos.length - 4} {listos.length - 4 === 1 ? "pedido más listo" : "pedidos más listos"}
                </div>
              )}
            </div>
          )}

        </div>
      </div>

    </div>
  );
}
