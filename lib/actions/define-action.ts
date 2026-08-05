import "server-only";
import { z } from "zod";
import type { AppModule, Role } from "@/generated/prisma/enums";
import { ESTADO_INICIAL, type EstadoAccion } from "@/lib/actions/estado";
import { getContext, licenciaVigente, tieneRol, type Contexto } from "@/lib/auth/dal";
import { tenantDb, type TenantDb } from "@/lib/db/tenant";

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
export { ESTADO_INICIAL, type EstadoAccion };

/**
 * Error cuyo mensaje SÍ se le muestra al usuario tal cual.
 *
 * Existe porque el catch de abajo convierte cualquier otra excepción en un
 * mensaje genérico —para no filtrar nombres de tabla ni consultas—, y hace falta
 * una forma explícita de decir "este texto lo escribí yo para que lo lea una
 * persona": "ese correo ya tiene cuenta", "no hay caja abierta".
 */
export class ErrorDeUsuario extends Error {
  readonly campos?: Record<string, string[]>;

  constructor(mensaje: string, campos?: Record<string, string[]>) {
    super(mensaje);
    this.name = "ErrorDeUsuario";
    this.campos = campos;
  }
}

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
          error: formErrors[0] ?? "Revisá los datos del formulario.",
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

/**
 * Para lo que ocurre antes de existir una sesión: ingresar, registrarse,
 * recuperar la contraseña. No hay ctx ni db acotado, y por eso mismo cada una
 * tiene que cuidarse sola: acá no hay red de contención.
 */
export function definePublicAction<TSchema extends z.ZodType, TOut>(config: {
  schema: TSchema;
  handler: (args: { input: z.output<TSchema> }) => Promise<TOut>;
}) {
  return async function accion(
    _estadoPrevio: EstadoAccion<TOut> | typeof ESTADO_INICIAL | undefined,
    entrada: FormData | z.input<TSchema>,
  ): Promise<EstadoAccion<TOut>> {
    try {
      const crudo = entrada instanceof FormData ? desdeFormData(entrada) : entrada;
      const parseado = config.schema.safeParse(crudo);
      if (!parseado.success) {
        const { fieldErrors, formErrors } = z.flattenError(parseado.error);
        return {
          ok: false,
          error: formErrors[0] ?? "Revisá los datos del formulario.",
          campos: fieldErrors as Record<string, string[]>,
        };
      }

      return { ok: true, data: await config.handler({ input: parseado.data }) };
    } catch (error) {
      if (esControlDeFlujoDeNext(error)) throw error;
      if (error instanceof ErrorDeUsuario) {
        return { ok: false, error: error.message, campos: error.campos };
      }
      console.error("[accion pública] falló", error);
      return { ok: false, error: "No pudimos completar la operación. Intentá de nuevo." };
    }
  };
}

export { licenciaVigente };
