import type { Metadata } from "next";
import {
  getBolsaDocumentosDian,
  getComprasDocumentosDian,
  getNegociosConFacturacion,
} from "@/features/superadmin/queries";
import { requireSuperAdmin } from "@/lib/auth/dal";
import { plataformaFacturaConfigurada } from "@/lib/billing/factus-plataforma";
import { VistaFacturacion } from "./vista-facturacion";

export const metadata: Metadata = { title: "Facturación electrónica · Superadmin" };
export const dynamic = "force-dynamic";

export default async function FacturacionDianPage() {
  // Cada página verifica por su cuenta: el layout no es frontera de seguridad.
  await requireSuperAdmin();

  const [bolsa, compras, negocios] = await Promise.all([
    getBolsaDocumentosDian(),
    getComprasDocumentosDian(),
    getNegociosConFacturacion(),
  ]);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-display text-3xl font-black uppercase leading-[0.95] tracking-tight text-foreground">
          Facturación electrónica
        </h1>
        <p className="text-sm text-muted-foreground">
          La bolsa de documentos que Platlia le compra a Factus y cómo se reparte. La cuenta de
          Factus es una sola, de la plataforma: cada negocio solo tiene lo que la DIAN le autorizó a
          su NIT.
        </p>
      </div>

      <VistaFacturacion
        bolsa={bolsa}
        compras={compras.map((c) => ({
          id: c.id,
          cantidad: c.cantidad,
          costoCop: c.costoCop,
          nota: c.nota,
          compradoEn: c.compradoEn.toISOString().slice(0, 10),
        }))}
        negocios={negocios}
        plataformaConfigurada={plataformaFacturaConfigurada()}
      />
    </div>
  );
}
