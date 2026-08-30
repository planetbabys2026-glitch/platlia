import Link from "next/link";
import { Navbar } from "../components/navbar";
import { Footer } from "../components/footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Lock, Eye, RefreshCw, ArrowLeft } from "lucide-react";

export const metadata = {
  title: "Política de Habeas Data y Tratamiento de Datos Personales · Platlia",
  description: "Política de protección de datos personales de PLATLIA S.A.S. de acuerdo con la Ley 1581 de 2012 y el Decreto 1377 de 2013 de Colombia.",
};

export default function HabeasDataPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground selection:bg-brand selection:text-brand-foreground">
      <Navbar />

      <main className="flex-1 py-12 lg:py-20">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 space-y-10">
          
          {/* Volver */}
          <div>
            <Button asChild variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
              <Link href="/">
                <ArrowLeft className="size-4" />
                Volver al inicio
              </Link>
            </Button>
          </div>

          {/* Encabezado */}
          <div className="space-y-4 pb-8 border-b border-border">
            <Badge variant="outline" className="border-brand/40 bg-brand/10 text-brand px-3.5 py-1 text-xs font-medium">
              Protección de Datos Personales · Colombia 🇨🇴
            </Badge>
            <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-foreground">
              Política de Habeas Data y Privacidad
            </h1>
            <p className="text-muted-foreground text-base sm:text-lg leading-relaxed">
              Cumplimiento riguroso de la Ley Estatutaria 1581 de 2012 y Decreto 1377 de 2013 de la República de Colombia.
            </p>
            <p className="text-xs text-muted-foreground">
              Última actualización: Enero 2026 · Responsable: PLATLIA S.A.S.
            </p>
          </div>

          {/* Pilares de Privacidad */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-5 rounded-2xl bg-muted/40 border border-border flex items-start gap-3.5">
              <Lock className="size-6 text-brand shrink-0 mt-0.5" />
              <div>
                <h2 className="font-bold text-sm text-foreground">Seguridad de la Información</h2>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Infraestructura protegida con cifrado en tránsito (TLS 1.3) y en reposo (AES-256) en servidores de alta disponibilidad.
                </p>
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-muted/40 border border-border flex items-start gap-3.5">
              <Eye className="size-6 text-brand shrink-0 mt-0.5" />
              <div>
                <h2 className="font-bold text-sm text-foreground">Uso Estrictamente Operativo</h2>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Tus datos de facturación, clientes y recetas se procesan exclusivamente para la prestación del servicio SaaS asignado.
                </p>
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-muted/40 border border-border flex items-start gap-3.5">
              <RefreshCw className="size-6 text-brand shrink-0 mt-0.5" />
              <div>
                <h2 className="font-bold text-sm text-foreground">Derechos ARCO</h2>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Acceso, Rectificación, Cancelación y Oposición garantizados de forma gratuita para el titular de los datos.
                </p>
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-muted/40 border border-border flex items-start gap-3.5">
              <ShieldCheck className="size-6 text-brand shrink-0 mt-0.5" />
              <div>
                <h2 className="font-bold text-sm text-foreground">Canal de Protección</h2>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Correo oficial exclusivo: <span className="font-mono text-foreground font-semibold">protecciondatos@platlia.com</span>.
                </p>
              </div>
            </div>
          </div>

          {/* Documento Legal Completo */}
          <article className="prose prose-slate dark:prose-invert max-w-none space-y-8 text-sm leading-relaxed text-muted-foreground">
            
            <section className="space-y-3">
              <h2 className="text-xl font-bold text-foreground">1. Identificación del Responsable del Tratamiento</h2>
              <p>
                <strong>PLATLIA S.A.S.</strong>, sociedad comercial constituida conforme a las leyes de la República de Colombia, es la entidad responsable del tratamiento de los datos personales recopilados a través de la plataforma web, aplicaciones móviles y canales de atención de Platlia.
              </p>
              <div className="p-4 rounded-xl bg-card border border-border text-xs space-y-1 font-mono text-foreground">
                <p><strong>Entidad:</strong> PLATLIA S.A.S.</p>
                <p><strong>País:</strong> República de Colombia</p>
                <p><strong>Correo Electrónico de Habeas Data:</strong> protecciondatos@platlia.com</p>
                <p><strong>Sitio Web Oficial:</strong> https://platlia.com</p>
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-bold text-foreground">2. Datos Personales Recolectados</h2>
              <p>
                Para la prestación de los servicios de gestión gastronómica SaaS, Platlia recolecta los siguientes datos:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>Datos de Identificación del Establecimiento:</strong> Nombre comercial, Razón Social, NIT, dirección del local y teléfono.</li>
                <li><strong>Datos del Administrador/Propietario:</strong> Nombre completo, correo electrónico, cédula de ciudadanía o extranjería y cargo.</li>
                <li><strong>Datos de Uso y Operación:</strong> Transacciones de venta, productos, registros de inventario, turnos de caja y usuarios del equipo asignados por la empresa cliente.</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-bold text-foreground">3. Finalidad del Tratamiento de los Datos</h2>
              <p>
                Los datos personales autorizados por el Titular serán utilizados con las siguientes finalidades explícitas:
              </p>
              <ol className="list-decimal pl-5 space-y-1.5">
                <li>Crear y gestionar las cuentas de usuario y credenciales de acceso al software Platlia.</li>
                <li>Procesar la facturación periódica y cobro de la licencia de uso a través de pasarelas de pago autorizadas (MercadoPago).</li>
                <li>Brindar soporte técnico operativo, resolver incidencias y notificar actualizaciones críticas del sistema.</li>
                <li>Cumplir con las obligaciones legales, tributarias y contables vigentes en Colombia.</li>
                <li>Enviar comunicaciones de servicio y mejoras operativas (el usuario puede desactivar notificaciones no esenciales en cualquier momento).</li>
              </ol>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-bold text-foreground">4. Derechos de los Titulares de los Datos</h2>
              <p>
                De acuerdo con el Artículo 8 de la Ley 1581 de 2012, el Titular de los datos personales tiene los siguientes derechos:
              </p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>Conocer, actualizar y rectificar sus datos personales frente a PLATLIA S.A.S.</li>
                <li>Solicitar prueba de la autorización otorgada para el tratamiento.</li>
                <li>Ser informado por PLATLIA S.A.S., previa solicitud, respecto del uso que le ha dado a sus datos.</li>
                <li>Presentar ante la Superintendencia de Industria y Comercio (SIC) quejas por infracciones a lo dispuesto en la ley.</li>
                <li>Revocar la autorización y/o solicitar la supresión del dato cuando en el Tratamiento no se respeten los principios, derechos y garantías constitucionales y legales.</li>
                <li>Acceder en forma gratuita a sus datos personales que hayan sido objeto de Tratamiento.</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-bold text-foreground">5. Procedimiento para Consultas, Reclamos y Solicitudes ARCO</h2>
              <p>
                Los titulares de los datos pueden ejercer sus derechos enviando una solicitud por escrito al correo electrónico oficial:
              </p>
              <div className="p-4 rounded-xl bg-brand/10 border border-brand/20 text-brand flex items-center justify-between">
                <span className="font-semibold">protecciondatos@platlia.com</span>
                <span className="text-xs bg-brand text-brand-foreground px-2.5 py-1 rounded-md font-sans">Canal Oficial</span>
              </div>
              <p className="text-xs">
                <strong>Plazos de Respuesta Legal:</strong> Las consultas serán atendidas en un término máximo de <strong>diez (10) días hábiles</strong> contados a partir de la fecha de recibo. Los reclamos para corrección, actualización o supresión de datos serán atendidos en un término máximo de <strong>quince (15) días hábiles</strong>.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-bold text-foreground">6. Vigencia de la Política</h2>
              <p>
                La presente Política de Tratamiento de Datos Personales rige a partir de su publicación y permanecerá vigente mientras PLATLIA S.A.S. desarrolle su objeto social o hasta que las leyes colombianas dispongan lo contrario.
              </p>
            </section>

          </article>

          {/* CTA de consulta */}
          <div className="pt-6 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-xs text-muted-foreground">
              ¿Tienes alguna duda sobre tus datos personales? Escríbenos directamente.
            </div>
            <Button asChild className="bg-brand text-brand-foreground hover:bg-brand/90">
              <a href="mailto:protecciondatos@platlia.com">Escribir a Habeas Data</a>
            </Button>
          </div>

        </div>
      </main>

      <Footer />
    </div>
  );
}
