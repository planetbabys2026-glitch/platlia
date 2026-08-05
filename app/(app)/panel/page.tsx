import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { requireActiveLicense } from "@/lib/auth/dal";
import { tenantDb } from "@/lib/db/tenant";
import { formatBusinessDate, currentBusinessDate } from "@/lib/time";

export const metadata: Metadata = { title: "Panel" };

// El panel refleja el estado de ahora: nunca se prerenderiza.
export const dynamic = "force-dynamic";

export default async function PanelPage() {
  // La página verifica por su cuenta, como todas: sesión + empresa + licencia.
  const ctx = await requireActiveLicense();
  const db = tenantDb(ctx.business.id);

  const [mesas, productos, cajaAbierta] = await Promise.all([
    db.table.count({ where: { deletedAt: null } }),
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
        <h1 className="text-3xl font-semibold tracking-tight">{ctx.business.name}</h1>
        <p className="text-muted-foreground text-sm">
          Jornada del {formatBusinessDate(jornada)} · {ctx.user.name} ({ctx.role.toLowerCase()})
        </p>
      </div>

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
        <Indicador titulo="Mesas" valor={mesas} />
        <Indicador titulo="Productos en carta" valor={productos} />
        <Indicador
          titulo="Caja"
          valor={cajaAbierta ? "Abierta" : "Cerrada"}
          detalle={cajaAbierta ? "Hay un turno en curso" : "Sin turno abierto"}
        />
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
