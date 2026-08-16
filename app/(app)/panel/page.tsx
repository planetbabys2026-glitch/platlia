import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppModule, Role } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { requireActiveLicense } from "@/lib/auth/dal";
import { tenantDb } from "@/lib/db/tenant";
import { formatBusinessDate, currentBusinessDate } from "@/lib/time";
import { AvisoCorreoSinVerificar } from "./verificar-correo";

export const metadata: Metadata = { title: "Panel" };

// El panel refleja el estado de ahora: nunca se prerenderiza.
export const dynamic = "force-dynamic";

export default async function PanelPage() {
  // La página verifica por su cuenta, como todas: sesión + empresa + licencia.
  const ctx = await requireActiveLicense();
  const usaMesas = ctx.modules.has(AppModule.MESAS);

  // Cajero y administrador entran a trabajar, no a mirar indicadores: sin mesas
  // no hay salón que atender, y el panel —pensado para quien mira la salud del
  // negocio— no es la pantalla que necesitan al entrar. El propietario sí sigue
  // viendo el panel: es quien de verdad usa esos números.
  if (!usaMesas && (ctx.role === Role.CAJERO || ctx.role === Role.ADMINISTRADOR)) {
    redirect("/pos");
  }

  const db = tenantDb(ctx.business.id);

  const [mesas, productos, cajaAbierta] = await Promise.all([
    // Sin mesas no hace falta contarlas: nadie va a ver ese número.
    usaMesas ? db.table.count({ where: { deletedAt: null } }) : Promise.resolve(0),
    db.product.count({ where: { deletedAt: null, active: true } }),
    db.cashSession.findFirst({
      where: { status: "ABIERTA" },
      select: { id: true, openedAt: true },
    }),
  ]);

  const jornada = currentBusinessDate({
    timeZone: ctx.business.timeZone,
    businessDayStartMinutes: ctx.business.businessDayStartMinutes,
  });

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="font-display font-black uppercase tracking-tight text-foreground leading-[0.95] text-[clamp(1.875rem,3vw,2.5rem)]">{ctx.business.name}</h1>
        <p className="text-muted-foreground text-sm">
          Jornada del {formatBusinessDate(jornada)} · {ctx.user.name} ({ctx.role.toLowerCase()})
        </p>
      </div>

      {!ctx.user.emailVerifiedAt && <AvisoCorreoSinVerificar email={ctx.user.email} />}

      {ctx.licencia.enGracia && (
        <Card className="border-warning">
          <CardContent>
            <CardTitle className="text-warning text-base">
              Tu licencia venció
            </CardTitle>
            <CardDescription>
              Seguís trabajando por unos días de gracia. Renovala para no quedarte sin
              acceso.
            </CardDescription>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {usaMesas && <Indicador titulo="Mesas" valor={mesas} />}
        <Indicador titulo="Productos en carta" valor={productos} />
        <Indicador
          titulo="Caja"
          valor={cajaAbierta ? "Abierta" : "Cerrada"}
          detalle={cajaAbierta ? "Hay un turno en curso" : "Sin turno abierto"}
        />
      </div>

      <div className="flex flex-wrap gap-3">
        <Button asChild size="lg">
          <Link href={usaMesas ? "/salon" : "/pos"}>{usaMesas ? "Ir al salón" : "Ir al POS"}</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/caja">{cajaAbierta ? "Ver la caja" : "Abrir la caja"}</Link>
        </Button>
      </div>
    </div>
  );
}

function Indicador({
  titulo,
  valor,
  detalle,
}: {
  titulo: string;
  valor: string | number;
  detalle?: string;
}) {
  return (
    <Card>
      <CardContent className="space-y-1">
        <p className="text-muted-foreground text-sm">{titulo}</p>
        <p className="numeral text-3xl font-semibold">{valor}</p>
        {detalle && <p className="text-muted-foreground text-xs">{detalle}</p>}
      </CardContent>
    </Card>
  );
}
