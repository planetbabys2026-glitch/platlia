"use client"; // Los límites de error deben ser Client Components.

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { esVersionVieja } from "@/lib/errores";

/** Para no quedar en un bucle de recargas si el problema no era la versión. */
const CLAVE_RECARGA = "platlia_recarga_por_version";

// En Next 15 la prop es `reset`. (`retry` recién aparece en Next 16.)
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [recargando, setRecargando] = useState(false);

  useEffect(() => {
    console.error(error);

    if (!esVersionVieja(error)) return;

    // `reset()` no sirve acá: vuelve a montar el mismo árbol, que vuelve a pedir
    // el mismo archivo que ya no existe, y falla igual. Lo único que arregla una
    // versión vieja es traer el HTML nuevo, y eso es recargar.
    let yaSeIntento = false;
    try {
      yaSeIntento = sessionStorage.getItem(CLAVE_RECARGA) === "1";
      sessionStorage.setItem(CLAVE_RECARGA, "1");
    } catch {
      // En modo privado no se puede recordar: se recarga una vez igual.
    }

    if (yaSeIntento) return;

    setRecargando(true);
    window.location.reload();
  }, [error]);

  // Al montar sin error de versión, se limpia la marca: la próxima vez que pase
  // de verdad tiene que poder recargar otra vez.
  useEffect(() => {
    if (esVersionVieja(error)) return;
    try {
      sessionStorage.removeItem(CLAVE_RECARGA);
    } catch {}
  }, [error]);

  if (recargando) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <p className="text-muted-foreground text-sm">Hay una versión nueva. Actualizando…</p>
      </main>
    );
  }

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md space-y-4 text-center">
        <h1 className="font-display font-black uppercase tracking-tight text-foreground leading-[0.95] text-3xl">Algo salió mal</h1>
        <p className="text-muted-foreground text-sm">
          Tuvimos un problema al cargar esta pantalla. Podés reintentar; si sigue
          fallando, avisale al administrador del negocio.
        </p>
        {error.digest ? (
          <p className="text-muted-foreground font-mono text-xs">
            Código de referencia: {error.digest}
          </p>
        ) : null}
        <div className="flex items-center justify-center gap-2">
          <Button onClick={() => reset()}>Reintentar</Button>
          {/* Reintentar re-arma el mismo árbol y a veces falla igual. Recargar
              pide todo de nuevo al servidor, que es lo que destraba el caso en
              que la pantalla quedó vieja. */}
          <Button variant="outline" onClick={() => window.location.reload()}>
            Recargar la página
          </Button>
        </div>
      </div>
    </main>
  );
}
