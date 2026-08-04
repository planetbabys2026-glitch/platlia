import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md space-y-4 text-center">
        <p className="text-muted-foreground font-mono text-sm">404</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          No encontramos esta página
        </h1>
        <p className="text-muted-foreground text-sm">
          Puede que el enlace esté mal escrito o que la página ya no exista.
        </p>
        <Button asChild>
          <Link href="/">Volver al inicio</Link>
        </Button>
      </div>
    </main>
  );
}
