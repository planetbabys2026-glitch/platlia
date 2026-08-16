import type { Metadata } from "next";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FormularioRestablecer } from "./formulario";

export const metadata: Metadata = { title: "Restablecer contraseña" };

// En Next 15 searchParams es una Promise y hay que esperarla.
export default async function RestablecerContrasenaPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertDescription>
            Ese enlace no es válido. Pedí uno nuevo desde{" "}
            <Link href="/recuperar" className="font-medium hover:underline">
              recuperar contraseña
            </Link>
            .
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="font-display font-black uppercase tracking-tight text-foreground leading-[0.95] text-3xl">Elegí una contraseña nueva</h1>
      </div>

      <FormularioRestablecer token={token} />
    </div>
  );
}
