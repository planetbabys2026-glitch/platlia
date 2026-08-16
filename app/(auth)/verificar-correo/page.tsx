import type { Metadata } from "next";
import Link from "next/link";
import { consumirToken } from "@/features/auth/tokens";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
// Auth: marca el correo verificado antes de que exista sesión con la que
// acotar. Una de las tres excepciones previstas por la regla (auth, billing,
// superadmin).
// eslint-disable-next-line no-restricted-imports
import { rootDb } from "@/lib/db/root";

export const metadata: Metadata = { title: "Confirmar correo" };

/**
 * Página que un enlace de correo abre por GET, sin sesión propia: la prueba de
 * identidad es el token, no una cookie. Por eso no pasa por el DAL como el
 * resto de las páginas —no hay nada que el DAL pudiera verificar acá.
 */
export default async function VerificarCorreoPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  const resultado = token
    ? await consumirToken(token, "EMAIL_VERIFICATION")
    : ({ ok: false, motivo: "invalido" } as const);

  if (resultado.ok) {
    await rootDb.user.update({
      where: { id: resultado.userId },
      data: { emailVerifiedAt: new Date() },
    });
  }

  return (
    <div className="space-y-6 text-center">
      <h1 className="font-display font-black uppercase tracking-tight text-foreground leading-[0.95] text-3xl">Confirmar correo</h1>

      {resultado.ok ? (
        <Alert>
          <AlertDescription>Tu correo quedó confirmado.</AlertDescription>
        </Alert>
      ) : (
        <Alert variant="destructive">
          <AlertDescription>
            {resultado.motivo === "usado"
              ? "Ese enlace ya se usó."
              : resultado.motivo === "vencido"
                ? "Ese enlace venció."
                : "Ese enlace no es válido."}{" "}
            Entrá a tu cuenta y pedí uno nuevo desde el panel.
          </AlertDescription>
        </Alert>
      )}

      <Button asChild className="w-full">
        <Link href="/panel">Ir a mi panel</Link>
      </Button>
    </div>
  );
}
