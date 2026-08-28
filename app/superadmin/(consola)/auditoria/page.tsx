import type { Metadata } from "next";
import { EncabezadoPantalla } from "@/components/marca/pantalla";
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
      <EncabezadoPantalla
        titulo="Auditoría y Pagos"
        descripcion="Bitácora completa de acciones de superadministradores, extensiones de licencia e historial de cobros con MercadoPago."
      />

      <VistaAuditoria auditLogs={auditLogs} pagos={pagos} webhooks={webhooks} />
    </div>
  );
}
