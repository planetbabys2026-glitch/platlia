import type { Metadata } from "next";
import { getAuditLogs, getPagosEIntentos } from "@/features/superadmin/queries";
import { requireSuperAdmin } from "@/lib/auth/dal";
import { VistaAuditoria } from "./vista-auditoria";

export const metadata: Metadata = { title: "Auditoría y Pagos" };
export const dynamic = "force-dynamic";

export default async function AuditoriaSuperAdminPage() {
  await requireSuperAdmin();

  const [auditLogs, { pagos, webhooks }] = await Promise.all([
    getAuditLogs(),
    getPagosEIntentos(),
  ]);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-display font-black uppercase tracking-tight text-foreground leading-[0.95] text-3xl">Auditoría y Pagos</h1>
        <p className="text-muted-foreground text-sm">
          Bitácora completa de acciones de superadministradores, extensiones de licencia e historial de cobros con MercadoPago.
        </p>
      </div>

      <VistaAuditoria auditLogs={auditLogs} pagos={pagos} webhooks={webhooks} />
    </div>
  );
}
