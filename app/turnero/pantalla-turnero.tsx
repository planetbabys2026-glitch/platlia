"use client";

import { useEffect, useState, useRef } from "react";
import { Logotipo } from "@/components/marca/logo";
import { formatTurno } from "@/lib/turns";
import { RefrescoDeTelevisor, PantallaSiempreEncendida } from "./pantalla";

type TurnoItem = {
  orderId: string;
  turno: number;
  nombre: string | null;
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
  listos,
  mediaMode,
  imagesRaw,
  imageIntervalSeconds,
  youtubeUrl,
  badgePosition,
}: TurneroProps) {
  const images = parseImageUrls(imagesRaw);
  const youtubeId = extractYoutubeId(youtubeUrl);

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

  // Alerta sonora y animación cuando aparece o cambia el turno listo más reciente
  useEffect(() => {
    if (listos.length === 0) {
      prevListosIdRef.current = "";
      return;
    }

    const masReciente = listos[0];
    const currentId = masReciente.orderId;

    if (prevListosIdRef.current !== currentId) {
      prevListosIdRef.current = currentId;
      playChimeSound();

      // Disparar Modal Central Destacado
      setNuevoTurnoDestacado(masReciente);
      setAnimandoHaciaEsquina(false);

      // Transición hacia la esquina a los 3.5 segundos
      const timerTransicion = setTimeout(() => {
        setAnimandoHaciaEsquina(true);
      }, 3500);

      // Finalizar animación central a los 4.2 segundos
      const timerFinal = setTimeout(() => {
        setNuevoTurnoDestacado(null);
        setAnimandoHaciaEsquina(false);
      }, 4200);

      return () => {
        clearTimeout(timerTransicion);
        clearTimeout(timerFinal);
      };
    }
  }, [listos]);

  // Determinar la clase de posicionamiento del recuadro sobrepuesto
  const isTopLeft = badgePosition === "TOP_LEFT";
  const posClass = isTopLeft ? "top-6 left-6" : "top-6 right-6";

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-neutral-950 text-white font-sans select-none">
      <RefrescoDeTelevisor segundos={8} />
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
        <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
          <iframe
            src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1&mute=1&loop=1&playlist=${youtubeId}&controls=0&showinfo=0&autohide=1&modestbranding=1&rel=0`}
            className="w-full h-full scale-125 object-cover opacity-80"
            allow="autoplay; encrypted-media"
            title="Fondo Turnero"
          />
          <div className="absolute inset-0 bg-black/35 backdrop-blur-[1px]" />
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md transition-all duration-700 ease-in-out">
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
                {formatTurno(nuevoTurnoDestacado.turno, turnNumberMax)}
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
      <div className={`fixed z-30 ${posClass} max-w-sm sm:max-w-md w-full`}>
        <div className="rounded-3xl border border-white/15 bg-neutral-950/85 backdrop-blur-xl p-5 shadow-2xl space-y-4">
          
          {/* Header con Logotipo y Nombre del Negocio */}
          <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
            <Logotipo className="h-6 opacity-90" />
            <span className="truncate text-sm font-semibold tracking-wider text-neutral-300 uppercase">
              {businessName}
            </span>
          </div>

          {/* Encabezado del Recuadro */}
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold tracking-[0.2em] text-emerald-400 uppercase flex items-center gap-2">
              <span className="size-2 rounded-full bg-emerald-500 animate-ping" />
              Órdenes Listas ({listos.length})
            </h2>
          </div>

          {/* Lista de Números Listos */}
          {listos.length === 0 ? (
            <div className="py-6 text-center text-neutral-500 font-medium text-sm">
              Esperando pedidos listos...
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 max-h-[70vh] overflow-y-auto pr-1">
              {listos.map((turno, idx) => (
                <div
                  key={turno.orderId}
                  className={`flex flex-col items-center justify-center rounded-2xl p-4 transition-all duration-300 ${
                    idx === 0
                      ? "bg-gradient-to-br from-emerald-600 to-emerald-800 text-white shadow-lg ring-2 ring-emerald-400 scale-[1.02]"
                      : "bg-neutral-900/90 text-neutral-200 border border-white/10"
                  }`}
                >
                  <span className="numeral text-4xl font-extrabold leading-none sm:text-5xl">
                    {formatTurno(turno.turno, turnNumberMax)}
                  </span>
                  {turno.nombre && (
                    <span className="mt-1 truncate max-w-full text-xs font-medium opacity-90">
                      {turno.nombre}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

        </div>
      </div>

    </div>
  );
}
