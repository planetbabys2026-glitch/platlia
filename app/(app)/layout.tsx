import { AppModule } from "@/generated/prisma/enums";
import { contarCuentasPorCobrar } from "@/features/caja/queries";
import { usaKds } from "@/features/caja/reglas";
import { contarDeudores } from "@/features/cartera/queries";
import { contarComandasVivas } from "@/features/cocina/queries";
import { contarDomiciliosActivos } from "@/features/domicilios/queries";
import { getSettings } from "@/features/negocio/queries";
import { requireBusiness } from "@/lib/auth/dal";
import { cuentaDelPropietario } from "@/lib/billing/cuenta";
import { diasParaElCorte } from "@/lib/billing/suscripcion";
import { currentBusinessDate } from "@/lib/time";
import { AppShell } from "./app-shell";
import { AvisoCorreoSinVerificar } from "./aviso-correo";
import { AvisoLicencia } from "./aviso-licencia";

/**
 * Shell principal de la aplicación con barra lateral izquierda colapsable
 * y menú desplegable responsivo para celulares y tabletas.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireBusiness();
  const usaMesas = ctx.modules.has(AppModule.MESAS);
  let usaCocina = ctx.modules.has(AppModule.COCINA);
  let usaTurnero = true;

  let usaInventario = false;
  let usaRecetas = false;
  let usaDomicilios = true;
  let usaCredito = false;
  let deudoresInicial = 0;
  let rolePermissions: string | null = null;
  let cocinaInicial = 0;
  let domiciliosInicial = 0;
  let cajaInicial = 0;

  if (ctx.business.id) {
    try {
      const settings = await getSettings(ctx.business.id);
      usaInventario = settings.inventoryEnabled;
      // Recetas se apaga por empresa: sin esto el menú ofrecería una sección de
      // Inventario que la pantalla no dibuja.
      usaRecetas = settings.recipesEnabled;
      usaDomicilios = settings.deliveryEnabled;
      usaCredito = settings.creditoEnabled;

      /**
       * Con la comanda en "solo papel" no hay pantalla de cocina ni turnero.
       *
       * Las dos dependen de que alguien mueva el estado de los platos, y con
       * papel no hay quién: la comanda sale impresa y nadie vuelve a tocar el
       * sistema hasta el cobro. Dejarlas en el menú es ofrecer dos pantallas que
       * van a estar vacías toda la noche —y el turnero, un televisor que nunca
       * llama a nadie—.
       */
      const hayKds = usaKds(settings.comandaDestino);
      usaCocina = usaCocina && hayKds;
      usaTurnero = hayKds;
      rolePermissions = settings.rolePermissions ?? null;

      // Los contadores del menú se calculan acá para que la primera pintura ya
      // traiga el número: el stream los refresca después, pero sin esto la
      // insignia arranca en cero y salta a tres medio segundo más tarde.
      const businessDate = currentBusinessDate(settings);
      [cocinaInicial, domiciliosInicial, cajaInicial, deudoresInicial] = await Promise.all([
        usaCocina ? contarComandasVivas(ctx.business.id, businessDate) : Promise.resolve(0),
        usaDomicilios ? contarDomiciliosActivos(ctx.business.id) : Promise.resolve(0),
        // Sin condición: cualquier negocio puede mandar una cuenta a la caja,
        // también el de mostrador desde el POS.
        contarCuentasPorCobrar(ctx.business.id, businessDate),
        usaCredito ? contarDeudores(ctx.business.id) : Promise.resolve(0),
      ]);
    } catch {
      // Si la empresa aún no tiene settings cargados
    }
  }

  const puedeVerInventario = Boolean(
    usaInventario &&
      ctx.role &&
      ["PROPIETARIO", "ADMINISTRADOR", "CAJERO"].includes(ctx.role),
  );

  // La licencia la paga quien manda: `pagarSuscripcion` exige ADMINISTRADOR y
  // PROPIETARIO pasa siempre, así que el menú ofrece exactamente lo que la acción
  // va a aceptar. Un mesero no tiene por qué ver una pantalla de cobro.
  const puedeFacturar = ctx.role === "PROPIETARIO" || ctx.role === "ADMINISTRADOR";
  const esPropietario = ctx.role === "PROPIETARIO" || ctx.role === "ADMINISTRADOR";

  /**
   * El aviso de vencimiento dentro de la app.
   *
   * Aparece a tres días del corte —el mismo umbral con el que sale el correo— y
   * solo con cobro automático apagado: a quien ya autorizó el débito se le va a
   * cobrar solo, y avisarle sería asustarlo sin motivo.
   */
  const cuenta = await cuentaDelPropietario(ctx.user.id);
  const diasParaCorte = cuenta && !cuenta.cobroAutomatico ? diasParaElCorte(cuenta) : null;
  const mostrarAviso = diasParaCorte !== null && diasParaCorte <= 3;

  return (
    <AppShell
      user={ctx.user}
      businessName={ctx.business.name}
      role={ctx.role}
      rolePermissions={rolePermissions}
      usaMesas={usaMesas}
      usaCocina={usaCocina}
      usaTurnero={usaTurnero}
      usaDomicilios={usaDomicilios}
      usaCredito={usaCredito}
      deudores={deudoresInicial}
      puedeVerInventario={puedeVerInventario}
      puedeFacturar={puedeFacturar}
      esPropietario={esPropietario}
      usaRecetas={usaRecetas}
      usaInventario={usaInventario}
      cocinaInicial={cocinaInicial}
      domiciliosInicial={domiciliosInicial}
      cajaInicial={cajaInicial}
    >
      {mostrarAviso && (
        <AvisoLicencia diasRestantes={diasParaCorte} puedeFacturar={puedeFacturar} />
      )}
      {/* Vivía en el panel, que ya no se pinta. Acá se ve desde cualquier pantalla,
          que es lo que corresponde a algo que rompe la recuperación de la cuenta
          justo el día que hace falta. */}
      {!ctx.user.emailVerifiedAt && <AvisoCorreoSinVerificar email={ctx.user.email} />}
      {children}
    </AppShell>
  );
}
