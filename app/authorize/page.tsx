import type { Metadata } from "next";
import { Role } from "@/generated/prisma/enums";
import { Logotipo } from "@/components/marca/logo";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/dal";
import { readSession } from "@/lib/auth/session";
import { licenciaVigente } from "@/lib/auth/reglas";
// Se está decidiendo A QUÉ SEDE se le da acceso: todavía no hay businessId con el
// cual acotar, igual que en /elegir-negocio.
// eslint-disable-next-line no-restricted-imports
import { rootDb } from "@/lib/db/root";
import { revisarPeticion, urlDeRetorno } from "@/lib/mcp/oauth";
import { FormularioAutorizar } from "./formulario";

export const metadata: Metadata = { title: "Autorizar acceso · Platlia" };
export const dynamic = "force-dynamic";

/** Los nombres con los que cada parámetro vuelve a la URL al reconstruirla. */
const EN_LA_URL = {
  responseType: "response_type",
  clientId: "client_id",
  redirectUri: "redirect_uri",
  codeChallenge: "code_challenge",
  codeChallengeMethod: "code_challenge_method",
  state: "state",
} as const;

/**
 * Donde el dueño decide.
 *
 * Todo el flujo de OAuth existe para llegar acá: el resto son rutas que hablan
 * entre máquinas. Esta es la única pantalla, y es la que convierte "una aplicación
 * pidió acceso" en "el dueño se lo dio, a esta sede y no a otra".
 *
 * Dice tres cosas y ninguna sobra: **quién** pide, **a qué sede**, y **qué va a
 * poder ver** —con el límite escrito, no insinuado—. Una pantalla de permisos que
 * no dice qué se está entregando entrena a la gente a aprobar sin leer, y después
 * el clic no significa nada.
 */
export default async function AutorizarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const uno = (k: string) => {
    const v = sp[k];
    return typeof v === "string" ? v : null;
  };

  const peticion = {
    responseType: uno("response_type"),
    clientId: uno("client_id"),
    redirectUri: uno("redirect_uri"),
    codeChallenge: uno("code_challenge"),
    codeChallengeMethod: uno("code_challenge_method"),
    state: uno("state"),
  };

  /**
   * La sesión, y se vuelve ACÁ con todo puesto.
   *
   * A quien llega sin cookie lo atrapa antes el `middleware`, que ya manda el
   * `desde` con la URL entera. Esto cubre el otro caso, que el middleware no
   * puede ver: cookie con firma válida pero sesión revocada en la base —el
   * middleware corre en edge y no toca la base a propósito—. Sin este camino, esa
   * persona vería la pantalla de permisos y recién fallaría al aprobar.
   *
   * Que el flujo sobreviva al ingreso no es un detalle: sin el `desde`, se
   * aterriza en el panel y hay que empezar de nuevo desde el asistente, con un
   * error que del otro lado no explica nada.
   */
  const sesion = await readSession("APP");
  if (!sesion) {
    const query = new URLSearchParams();
    for (const [clave, valor] of Object.entries(EN_LA_URL)) {
      const v = peticion[clave as keyof typeof peticion];
      if (typeof v === "string") query.set(valor, v);
    }
    redirect(`/ingresar?desde=${encodeURIComponent(`/authorize?${query.toString()}`)}`);
  }
  const ctx = await requireUser();

  const problema = revisarPeticion(peticion);
  if (problema) {
    return (
      <Marco titulo="No se puede autorizar">
        <p className="text-sm text-muted-foreground">
          La aplicación mandó una petición incompleta o que no cumple el protocolo
          {problema === "code_challenge_method" ? " (falta la protección PKCE con S256)" : ""}. No
          es algo que puedas resolver desde acá: volvé a intentar la conexión desde tu asistente.
        </p>
        <p className="font-mono text-rotulo uppercase tracking-[0.14em] text-muted-foreground">
          Parámetro: {problema}
        </p>
      </Marco>
    );
  }

  const cliente = await rootDb.oAuthClient.findUnique({
    where: { clientId: peticion.clientId! },
    select: { clientName: true, redirectUris: true },
  });

  /**
   * Si la aplicación no se registró, o la dirección de retorno no es una de las
   * suyas, el error se muestra ACÁ y no se redirige.
   *
   * Redirigir con un `error=` a una dirección que no verificamos sería usar a
   * Platlia de trampolín hacia donde quiera el que armó el enlace. Cuando la
   * dirección todavía no está probada, la única salida segura es la pantalla.
   */
  if (!cliente || !cliente.redirectUris.includes(peticion.redirectUri!)) {
    return (
      <Marco titulo="Esta aplicación no está registrada">
        <p className="text-sm text-muted-foreground">
          No reconocemos a quien está pidiendo el acceso, o la dirección a la que quiere volver no
          es la que registró. No vamos a mandarte ahí.
        </p>
        <p className="text-sm text-muted-foreground">
          Si estás conectando tu asistente, borrá la conexión y volvé a agregarla: el registro se
          hace solo.
        </p>
      </Marco>
    );
  }

  // Solo el propietario, y solo sedes suyas: la misma regla que para crear una
  // llave a mano en Configuración. Un administrador configura impresoras; sacar la
  // contabilidad para afuera es del dueño.
  const membresias = await rootDb.membership.findMany({
    where: {
      userId: ctx.user.id,
      active: true,
      role: Role.PROPIETARIO,
      business: { deletedAt: null },
    },
    select: {
      business: {
        select: {
          id: true,
          name: true,
          status: true,
          subscription: {
            select: { status: true, currentPeriodEnd: true, trialEndsAt: true, graceUntil: true },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const sedes = membresias
    .filter((m) => m.business.status === "ACTIVO" && licenciaVigente(m.business.subscription).vigente)
    .map((m) => ({ id: m.business.id, nombre: m.business.name }));

  if (sedes.length === 0) {
    return (
      <Marco titulo="No hay ninguna sede que puedas conectar">
        <p className="text-sm text-muted-foreground">
          Esto lo autoriza el propietario de un negocio con la licencia al día. Si sos el dueño y la
          licencia venció, se reactiva al ponerte al día y podés volver a intentarlo.
        </p>
      </Marco>
    );
  }

  return (
    <Marco titulo="Autorizar acceso">
      <FormularioAutorizar
        aplicacion={cliente.clientName}
        sedes={sedes}
        clientId={peticion.clientId!}
        redirectUri={peticion.redirectUri!}
        codeChallenge={peticion.codeChallenge!}
        state={peticion.state}
        urlDeCancelacion={urlDeRetorno(peticion.redirectUri!, {
          error: "access_denied",
          error_description: "El dueño no autorizó el acceso.",
          state: peticion.state,
        })}
      />
    </Marco>
  );
}

function Marco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-12 min-h-screen bg-[radial-gradient(640px_480px_at_50%_35%,color-mix(in_oklch,var(--brasa)_7%,transparent),transparent_70%)]">
      <Logotipo size="lg" eyebrow="CONEXIÓN CON IA" />
      <div className="w-full max-w-md space-y-6">
        <h1 className="font-display font-black text-3xl sm:text-4xl uppercase tracking-tight text-foreground leading-[0.95] text-center">
          {titulo}
        </h1>
        {children}
      </div>
    </div>
  );
}
