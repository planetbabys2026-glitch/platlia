"use client"; // Los límites de error deben ser Client Components.

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

// En Next 15 la prop es `reset`. (`retry` recién aparece en Next 16.)
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md space-y-4 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Algo salió mal</h1>
        <p className="text-muted-foreground text-sm">
          Tuvimos un problema al cargar esta pantalla. Podés reintentar; si sigue
          fallando, avisale al administrador del negocio.
        </p>
        {error.digest ? (
          <p className="text-muted-foreground font-mono text-xs">
            Código de referencia: {error.digest}
          </p>
        ) : null}
        <Button onClick={() => reset()}>Reintentar</Button>
      </div>
    </main>
  );
}
