import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Role } from "@/generated/prisma/enums";
import { Logotipo } from "@/components/marca/logo";
import { Button } from "@/components/ui/button";
import { salir } from "@/features/auth/actions";
import { sedesDelPropietario } from "@/features/facturacion/queries";
import { requireBusiness } from "@/lib/auth/dal";
// eslint-disable-next-line no-restricted-imports -- Buscar las OTRAS sedes de la persona cruza negocios: no hay un businessId con el cual acotar.
import { rootDb } from "@/lib/db/root";
import { listaVigenteDeLaBase } from "@/lib/billing/lista";
import { cotizar } from "@/lib/billing/precios";
import { formatCop } from "@/lib/money";
import { enlaceWhatsapp } from "@/lib/soporte";

export const metadata: Metadata = { title: "Licencia vencida" };
export const dynamic = "force-dynamic";

/**
 * Pantalla de licencia vencida.
 *
 * Verifica por su cuenta, igual que cualquier otra: si la licencia SÍ está
 * vigente, no hay nada que mostrar acá y devuelve al panel. Sin ese chequeo, la
 * pantalla quedaría accesible para siempre y confundiría a quien ya pagó.
 *
 * Es la pantalla donde se pierde un cliente. Antes era un cartel con un precio
 * escrito a mano —que además le mentía a las sedes adicionales, que pagan otra
 * cosa—, sin ningún contacto humano y con dos únicas salidas: ir a otra pantalla
 * o cerrar sesión. Acá se dice cuánto cuesta de verdad, se puede escribirle a
 * alguien, y si la persona tiene otra sede al día puede irse a trabajar a esa.
 */
export default async function BloqueadoPage() {
  const ctx = await requireBusiness();
  if (ctx.licencia.vigente) redirect("/panel");

  const suscripcion = await rootDb.subscription.findUnique({
    where: { businessId: ctx.business.id },
    select: { status: true },
  });

  const sedes = await sedesDelPropietario(ctx.user.id);
  const lista = await listaVigenteDeLaBase();
  const mensual = cotizar({ lista, sedes, periodicidad: "MENSUAL" });

  // Las otras sedes de esta persona que sí estén al día: si tiene dónde trabajar
  // ahora mismo, dejarla encerrada acá no ayuda a nadie.
  const otrasSedes =
    sedes > 1
      ? await rootDb.membership.count({
          where: {
            userId: ctx.user.id,
            active: true,
            businessId: { not: ctx.business.id },
            business: {
              deletedAt: null,
              status: "ACTIVO",
              subscription: { graceUntil: { gt: new Date() } },
            },
          },
        })
      : 0;

  const cancelada = suscripcion?.status === "CANCELADA";
  const esPropietario = ctx.role === Role.PROPIETARIO || ctx.role === Role.ADMINISTRADOR;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-12 text-center">
      <Logotipo size="md" />

      <div className="max-w-md space-y-3">
        <h1 className="font-display text-3xl font-black uppercase leading-[0.95] tracking-tight text-foreground">
          La licencia de {ctx.business.name} está vencida
        </h1>
        <p className="text-pretty text-sm text-muted-foreground">
          Tus datos están intactos y no se borra nada. Renová la suscripción y el
          negocio vuelve a funcionar en el momento.
        </p>
        {!cancelada && (
          <p className="text-sm text-muted-foreground">
            <span className="numeral font-bold text-foreground">
              {formatCop(mensual.totalCop)}
            </span>{" "}
            al mes{sedes > 1 ? ` por tus ${sedes} sedes` : ""}. Pagando 6 o 12 meses hay
            {" "}meses de regalo.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        {/* Quien no puede facturar tampoco puede renovar: mandarlo a una pantalla
            que le va a decir que no es peor que no ofrecerle el botón. */}
        {esPropietario && !cancelada && (
          <Button asChild size="lg">
            <Link href="/facturacion">Renovar suscripción</Link>
          </Button>
        )}

        <Button asChild variant="outline" size="lg">
          <a
            href={enlaceWhatsapp(
              `Hola, soy de ${ctx.business.name} y la licencia de Platlia se me venció. ¿Me ayudan?`,
            )}
            target="_blank"
            rel="noopener"
          >
            Escribirle a soporte
          </a>
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-4 text-xs">
        {otrasSedes > 0 && (
          <Link href="/elegir-negocio" className="text-brand underline underline-offset-4">
            Ir a otra de mis sedes ({otrasSedes} al día)
          </Link>
        )}
        <form action={salir}>
          <button type="submit" className="text-muted-foreground underline underline-offset-4">
            Cerrar sesión
          </button>
        </form>
      </div>
    </div>
  );
}
