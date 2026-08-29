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
import {
  hostDeRetorno,
  nombreMostrable,
  redirectPermitido,
  revisarPeticion,
  urlDeRetorno,
} from "@/lib/mcp/oauth";
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
   * Una aplicación que no se dio de alta NO es motivo para cortar.
   *
   * El alta automática está y funciona, pero no todos los clientes la usan: hay
   * quien manda el nombre del conector como `client_id` y nunca pasa por ahí. Con
   * eso cortado, conectar era imposible y el mensaje mandaba a borrar y volver a
   * agregar la conexión, que muchas veces no cambia nada.
   *
   * Se acepta y la primera vez queda ATADA a esta dirección de retorno (lo escribe
   * la acción, al aprobar, no este GET). Desde entonces ese `client_id` no puede
   * apuntar a ningún otro lado, que es lo que impide reusar un nombre conocido
   * para desviar el código.
   *
   * Y lo que de verdad protege acá abajo no es el registro sino que **el dueño vea
   * a dónde va el código**: quien quiera robarlo puede registrar una aplicación
   * llamada "Claude" apuntando a su propio servidor. Lo único que separa eso de lo
   * legítimo es que en pantalla diga otra cosa que `claude.ai`.
   */
  const yaRegistrada = cliente !== null;
  if (cliente && !redirectPermitido(peticion.redirectUri!, cliente.redirectUris)) {
    // Registrada y pidiendo volver a otro lado: acá sí se corta, y sin redirigir
    // —mandar un `error=` a una dirección no verificada sería usar a Platlia de
    // trampolín hacia donde quiera el que armó el enlace.
    return (
      <Marco titulo="Esa dirección no es la de esta aplicación">
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">{nombreMostrable(cliente.clientName)}</strong> ya está
          registrada, pero quiere volver a{" "}
          <strong className="text-foreground">{hostDeRetorno(peticion.redirectUri!)}</strong>, que no
          es la dirección con la que se dio de alta. No vamos a mandarte ahí.
        </p>
        <p className="text-sm text-muted-foreground">
          Si sos vos quien está conectando su asistente y cambiaste algo, escribinos y lo
          resolvemos.
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
        aplicacion={nombreMostrable(cliente?.clientName ?? peticion.clientId!)}
        destino={hostDeRetorno(peticion.redirectUri!)}
        yaRegistrada={yaRegistrada}
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
