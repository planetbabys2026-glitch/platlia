"use client";

import { useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { subirImagenProducto } from "@/features/carta/actions";
import { ESTADO_INICIAL } from "@/lib/actions/estado";
import { cn } from "@/lib/utils";

/**
 * Un solo control: en el celular, `accept="image/*"` sin `capture` alcanza para
 * que el navegador ofrezca cámara Y galería en el mismo selector nativo —no
 * hacen falta dos botones para "tomar la foto o buscar una".
 *
 * La imagen se comprime en el navegador antes de subirla: una foto de cámara
 * sin tocar pesa varios MB, y la conexión de un bar no siempre perdona. 1600px
 * de lado más largo alcanza de sobra para una tarjeta de producto.
 */
async function comprimir(archivo: File, ladoMax = 1600, calidad = 0.82): Promise<Blob> {
  const bitmap = await createImageBitmap(archivo);
  const escala = Math.min(1, ladoMax / Math.max(bitmap.width, bitmap.height));
  const ancho = Math.round(bitmap.width * escala);
  const alto = Math.round(bitmap.height * escala);

  const canvas = document.createElement("canvas");
  canvas.width = ancho;
  canvas.height = alto;
  const contexto = canvas.getContext("2d");
  if (!contexto) throw new Error("El navegador no puede procesar la imagen.");
  contexto.drawImage(bitmap, 0, 0, ancho, alto);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("No se pudo comprimir la imagen."))),
      "image/jpeg",
      calidad,
    );
  });
}

type Estado =
  | { fase: "vacio" }
  | { fase: "subiendo"; previewUrl: string }
  | { fase: "lista"; previewUrl: string; url: string }
  | { fase: "error"; mensaje: string };

export function SubirImagen({ valorInicial }: { valorInicial?: string | null }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [estado, setEstado] = useState<Estado>(
    valorInicial ? { fase: "lista", previewUrl: valorInicial, url: valorInicial } : { fase: "vacio" },
  );

  async function manejarArchivo(archivo: File) {
    const previewUrl = URL.createObjectURL(archivo);
    setEstado({ fase: "subiendo", previewUrl });

    try {
      const comprimida = await comprimir(archivo);
      const formData = new FormData();
      formData.append("file", comprimida, "producto.jpg");
      const resultado = await subirImagenProducto(ESTADO_INICIAL, formData);

      if (!resultado.ok) {
        setEstado({ fase: "error", mensaje: resultado.error });
        return;
      }
      setEstado({ fase: "lista", previewUrl, url: resultado.data.url });
    } catch {
      setEstado({
        fase: "error",
        mensaje: "No pudimos procesar esa imagen. Probá con otra.",
      });
    }
  }

  const subiendo = estado.fase === "subiendo";
  const tieneImagen = estado.fase === "lista" || estado.fase === "subiendo";

  return (
    <div className="space-y-1.5">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-label="Tomar foto o elegir imagen del producto"
        onChange={(e) => {
          const archivo = e.target.files?.[0];
          // Se limpia el valor para poder elegir el mismo archivo otra vez si la
          // primera subida falló.
          e.target.value = "";
          if (archivo) void manejarArchivo(archivo);
        }}
      />

      {estado.fase === "lista" && <input type="hidden" name="imageUrl" value={estado.url} />}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={subiendo}
          className={cn(
            "border-input bg-card flex flex-1 items-center gap-3 rounded-lg border border-dashed p-2.5 text-left transition-colors",
            "hover:border-primary hover:bg-accent focus-visible:ring-ring focus-visible:ring-3 focus-visible:outline-none",
            subiendo && "pointer-events-none opacity-60",
          )}
        >
          {tieneImagen ? (
            <img
              src={estado.previewUrl}
              alt=""
              className="size-12 shrink-0 rounded-md object-cover"
            />
          ) : (
            <span className="bg-secondary text-muted-foreground flex size-12 shrink-0 items-center justify-center rounded-md">
              <Camera className="size-5" />
            </span>
          )}
          <span className="text-sm font-medium">
            {subiendo && "Subiendo…"}
            {estado.fase === "lista" && "Cambiar imagen"}
            {(estado.fase === "vacio" || estado.fase === "error") &&
              "Tomar foto o elegir imagen"}
          </span>
        </button>

        {estado.fase === "lista" && (
          <button
            type="button"
            onClick={() => setEstado({ fase: "vacio" })}
            aria-label="Quitar imagen"
            className="text-muted-foreground hover:text-destructive hover:bg-accent rounded-lg p-2 transition-colors"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {estado.fase === "error" && <p className="text-destructive text-xs">{estado.mensaje}</p>}

      <p className="text-muted-foreground text-xs">
        Opcional. Sin imagen, el POS muestra la inicial del producto.
      </p>
    </div>
  );
}
