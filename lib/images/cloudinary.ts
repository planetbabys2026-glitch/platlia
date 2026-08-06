import "server-only";
import { v2 as cloudinary } from "cloudinary";
import { requireEnv } from "@/lib/env";

/**
 * Subida de imágenes a Cloudinary.
 *
 * A diferencia del correo, acá el fallo SÍ tiene que llegar a quien lo disparó:
 * si alguien toca "Subir foto" y no pasa nada, no sabe si reintentar o si ya
 * quedó guardada. Por eso esta función lanza en vez de devolver un resultado
 * silencioso — quien la llama (una Server Action) la envuelve en su propio
 * manejo de errores, como cualquier otra falla de negocio.
 */
export async function subirImagen(buffer: Buffer, carpeta: string): Promise<string> {
  cloudinary.config({
    cloud_name: requireEnv("CLOUDINARY_CLOUD_NAME", "subir imágenes"),
    api_key: requireEnv("CLOUDINARY_API_KEY", "subir imágenes"),
    api_secret: requireEnv("CLOUDINARY_API_SECRET", "subir imágenes"),
  });

  return new Promise<string>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: carpeta, resource_type: "image" },
      (error, resultado) => {
        if (error || !resultado) {
          reject(error instanceof Error ? error : new Error("Cloudinary no devolvió resultado."));
          return;
        }
        resolve(resultado.secure_url);
      },
    );
    stream.end(buffer);
  });
}
