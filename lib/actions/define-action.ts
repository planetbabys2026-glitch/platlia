import "server-only";
import { z } from "zod";
import type { AppModule, Role } from "@/generated/prisma/enums";
import {
  CAMPO_TRAMPA,
  ESTADO_INICIAL,
  ErrorDeUsuario,
  type EstadoAccion,
} from "@/lib/actions/estado";
import { getContext, licenciaVigente, tieneRol, type Contexto } from "@/lib/auth/dal";
import { tenantDb, type TenantDb } from "@/lib/db/tenant";
import { contarIntento, olvidarIntentos } from "@/lib/seguridad/limite";
import type { Cupo } from "@/lib/seguridad/reglas-limite";
import { CAMPO_TURNSTILE, verificarTurnstile } from "@/lib/seguridad/turnstile";

/**
 * Envoltorio obligatorio de toda Server Action.
 *
 * Una Server Action es un endpoint POST público: cualquiera puede invocarla con
 * curl sin pasar nunca por la interfaz que la esconde. Que el botón esté detrás
 * de un `if (rol === "CAJERO")` no protege nada. Por eso acá se hornea, en este
 * orden, todo lo que la acción da por sentado:
 *
 *   sesión → empresa → licencia → rol → módulo → validación → cliente acotado
 *
 * El handler recibe el input ya validado y `db` ya limitado a su empresa, así que
 * no tiene forma de escribir en otra ni de confiar en un dato sin parsear.
 */

// La forma del estado vive en un módulo sin "server-only" porque también la lee
// el formulario en el navegador. Se reexporta por comodidad del servidor; los
// componentes cliente tienen que importarla de @/lib/actions/estado.
export { CAMPO_TRAMPA, ESTADO_INICIAL, ErrorDeUsuario, type EstadoAccion };

type Handler<TInput, TOut> = (args: {
  input: TInput;
  ctx: Contexto & { business: NonNullable<Contexto["business"]>; role: Role };
  db: TenantDb;
}) => Promise<TOut>;

type Config<TSchema extends z.ZodType, TOut> = {
  schema: TSchema;
  /** Roles habilitados. El propietario siempre pasa. Vacío = cualquier rol. */
  roles?: readonly Role[];
  /** Módulo que tiene que estar encendido en la empresa. */
  modulo?: AppModule;
  /** Solo para acciones que deben andar con la licencia vencida (pagar, cerrar caja). */
  permitirSinLicencia?: boolean;
  handler: Handler<z.output<TSchema>, TOut>;
};

/** Convierte un FormData en objeto plano, agrupando los campos repetidos. */
function desdeFormData(formData: FormData): Record<string, unknown> {
  const objeto: Record<string, unknown> = {};
  for (const [clave, valor] of formData.entries()) {
    if (clave.startsWith("$ACTION_")) continue; // ruido interno de React
    const anterior = objeto[clave];
    if (anterior === undefined) objeto[clave] = valor;
    else if (Array.isArray(anterior)) anterior.push(valor);
    else objeto[clave] = [anterior, valor];
  }
  return objeto;
}

/**
 * El mensaje que se muestra arriba del formulario cuando zod rechaza el envío.
 *
 * Si hay un error de nivel formulario manda ese. Si no, manda **el primer error
 * de campo** en vez de un "revisá los datos" que no dice nada: un campo que el
 * esquema exige y el formulario no dibuja deja su error colgado de un input que
 * no existe, y entonces la pantalla repite "revisá los datos" sin que haya nada
 * visible que revisar. Pasó con el registro —el esquema pedía confirmar la
 * contraseña y el formulario había perdido ese campo— y no se podía crear una
 * empresa sin leer el código para enterarse.
 */
function primerMensaje(
  formErrors: readonly string[],
  fieldErrors: Record<string, string[] | undefined>,
): string {
  if (formErrors[0]) return formErrors[0];
  for (const mensajes of Object.values(fieldErrors)) {
    if (mensajes?.[0]) return mensajes[0];
  }
  return "Revisá los datos del formulario.";
}

/**
 * `redirect()` y `notFound()` funcionan lanzando una excepción con `digest`, que
 * Next necesita ver. Si se la tragara el catch de abajo, un redirect adentro de
 * una acción se convertiría en un mensaje de error genérico.
 */
function esControlDeFlujoDeNext(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest: unknown }).digest === "string"
  );
}

export function defineAction<TSchema extends z.ZodType, TOut>(config: Config<TSchema, TOut>) {
  return async function accion(
    _estadoPrevio: EstadoAccion<TOut> | typeof ESTADO_INICIAL | undefined,
    entrada: FormData | z.input<TSchema>,
  ): Promise<EstadoAccion<TOut>> {
    try {
      const ctx = await getContext();
      if (!ctx) {
        return { ok: false, error: "Tu sesión venció. Volvé a ingresar." };
      }
      if (!ctx.business || !ctx.role) {
        return { ok: false, error: "No tenés un negocio activo en esta sesión." };
      }
      if (!config.permitirSinLicencia && !ctx.licencia.vigente) {
        return {
          ok: false,
          error: "La licencia de este negocio está vencida. Renovala para seguir trabajando.",
        };
      }
      if (config.roles && !tieneRol(ctx.role, config.roles)) {
        return { ok: false, error: "Tu rol no permite hacer esto." };
      }
      if (config.modulo && !ctx.modules.has(config.modulo)) {
        return { ok: false, error: "Este módulo está desactivado para tu negocio." };
      }

      const crudo = entrada instanceof FormData ? desdeFormData(entrada) : entrada;
      const parseado = config.schema.safeParse(crudo);
      if (!parseado.success) {
        const { fieldErrors, formErrors } = z.flattenError(parseado.error);
        return {
          ok: false,
          error: primerMensaje(formErrors, fieldErrors),
          campos: fieldErrors as Record<string, string[]>,
        };
      }

      const data = await config.handler({
        input: parseado.data,
        ctx: ctx as Contexto & {
          business: NonNullable<Contexto["business"]>;
          role: Role;
        },
        db: tenantDb(ctx.business.id),
      });

      return { ok: true, data };
    } catch (error) {
      if (esControlDeFlujoDeNext(error)) throw error;
      if (error instanceof ErrorDeUsuario) {
        return { ok: false, error: error.message, campos: error.campos };
      }

      // El detalle va al log del servidor; al usuario se le devuelve algo que no
      // filtre nombres de tabla ni consultas.
      console.error("[accion] falló", error);
      return {
        ok: false,
        error: "No pudimos completar la operación. Intentá de nuevo.",
      };
    }
  };
}

export type Protecciones = {
  /** Cuántos intentos por procedencia y en cuánto tiempo. */
  limite?: Cupo;
  /** Exigir el token del widget, cuando Turnstile esté configurado. */
  turnstile?: boolean;
  /** Rechazar en silencio si vino lleno el campo escondido. */
  trampa?: boolean;
};

/** Lo que se contesta a quien se pasó del cupo. */
const DEMASIADOS_INTENTOS = (minutos: number) =>
  `Demasiados intentos. Probá de nuevo en ${minutos} ${minutos === 1 ? "minuto" : "minutos"}.`;

/**
 * Para lo que ocurre antes de existir una sesión: ingresar, registrarse,
 * recuperar la contraseña.
 *
 * No hay ctx ni db acotado. Lo que sí hay ahora es `protecciones`, y está acá y
 * no adentro de cada acción por la misma razón que existe `defineAction`: lo que
 * se deja a criterio de cada una, alguna se lo olvida —y las que se olvidan son
 * justamente las que nadie mira—. Antes este comentario decía "acá no hay red de
 * contención"; ahora la red se declara.
 *
 * El orden importa: **trampa → freno → Turnstile → zod → handler**. La trampa y
 * el freno se resuelven acá adentro y son baratos; Turnstile es un pedido de red
 * a un tercero y no se paga si algo más ya rechazó.
 */
/**
 * La configuración, partida en dos para que el compilador exija lo que hace
 * falta.
 *
 * Con la trampa encendida, `respuestaParaTrampa` es **obligatoria**. No es
 * ceremonia: la acción tiene que contestarle al robot algo con la misma forma
 * que una respuesta buena, porque el formulario va a leerla. La pantalla de
 * recuperación hace `estado.data.mensaje`, así que devolverle `undefined`
 * —que es lo que pasaba— no la engaña: la rompe con un TypeError y la persona ve
 * la pantalla de error en vez del mensaje de siempre. Un fallo de trampa tiene
 * que ser indistinguible del éxito, y una pantalla rota se distingue bastante.
 *
 * Escrito como unión, el olvido es un error de compilación y no una excepción en
 * producción que solo aparece cuando un robot llena el campo.
 */
type ConfigPublica<TSchema extends z.ZodType, TOut> = {
  schema: TSchema;
  handler: (args: { input: z.output<TSchema> }) => Promise<TOut>;
} & (
  | { protecciones?: Protecciones & { trampa?: false }; respuestaParaTrampa?: never }
  | {
      protecciones: Protecciones & { trampa: true };
      /** Qué devolverle a un robot que cayó en la trampa: la misma forma que
       *  devuelve el handler, para que no se note. */
      respuestaParaTrampa: () => TOut;
    }
);

export function definePublicAction<TSchema extends z.ZodType, TOut>(
  config: ConfigPublica<TSchema, TOut>,
) {
  return async function accion(
    _estadoPrevio: EstadoAccion<TOut> | typeof ESTADO_INICIAL | undefined,
    entrada: FormData | z.input<TSchema>,
  ): Promise<EstadoAccion<TOut>> {
    // Fuera del try: el catch también lo necesita, para limpiar el cupo cuando
    // la acción termina en un redirect.
    const proteger = config.protecciones;

    try {
      const crudo = entrada instanceof FormData ? desdeFormData(entrada) : entrada;

      if (proteger?.trampa) {
        const trampa = (crudo as Record<string, unknown>)[CAMPO_TRAMPA];
        if (typeof trampa === "string" && trampa.trim() !== "") {
          return { ok: true, data: config.respuestaParaTrampa!() };
        }
      }

      if (proteger?.limite) {
        const veredicto = await contarIntento(proteger.limite);
        if (!veredicto.permitido) {
          return { ok: false, error: DEMASIADOS_INTENTOS(veredicto.minutos) };
        }
      }

      if (proteger?.turnstile) {
        const token = (crudo as Record<string, unknown>)[CAMPO_TURNSTILE];
        const vale = await verificarTurnstile(typeof token === "string" ? token : undefined);
        if (!vale) {
          return {
            ok: false,
            error: "No pudimos verificar que no seas un robot. Recargá la página y probá otra vez.",
          };
        }
      }

      const parseado = config.schema.safeParse(crudo);
      if (!parseado.success) {
        const { fieldErrors, formErrors } = z.flattenError(parseado.error);
        return {
          ok: false,
          error: primerMensaje(formErrors, fieldErrors),
          campos: fieldErrors as Record<string, string[]>,
        };
      }

      const data = await config.handler({ input: parseado.data });
      if (proteger?.limite) await olvidarIntentos(proteger.limite);

      return { ok: true, data };
    } catch (error) {
      // Un `redirect()` sale por acá, no por el `return` de arriba: lanza una
      // excepción con `digest` que Next necesita ver. Y como las dos acciones
      // que más importan —ingresar y registrarse— terminan justamente en un
      // redirect, olvidar los intentos solo en el camino del `return` no habría
      // limpiado nunca el caso que interesa: quien se equivoca tres veces y
      // entra a la cuarta. Sin esto se queda con el cupo casi gastado y el
      // próximo despiste lo deja afuera sabiendo su contraseña.
      if (esControlDeFlujoDeNext(error)) {
        if (proteger?.limite) await olvidarIntentos(proteger.limite);
        throw error;
      }
      if (error instanceof ErrorDeUsuario) {
        return { ok: false, error: error.message, campos: error.campos };
      }
      console.error("[accion pública] falló", error);
      return { ok: false, error: "No pudimos completar la operación. Intentá de nuevo." };
    }
  };
}

export { licenciaVigente };
