import { Resend } from "resend";
import { env, requireEnv } from "@/lib/env";

// OJO: este módulo NO importa "server-only", por la misma razón que `lib/env.ts`.
// El paquete lanza cuando se resuelve fuera de la condición `react-server`, y el
// barrido diario de suscripciones —que es Node plano— necesita mandar los avisos
// de vencimiento. La protección equivalente es la guarda de abajo, que es lo que
// de verdad importa: que la clave de Resend nunca llegue al navegador.
if (typeof window !== "undefined") {
  throw new Error("lib/email/enviar.ts es solo de servidor y nunca debe llegar al cliente.");
}

/**
 * Envío de correo con Resend.
 *
 * Regla que gobierna este módulo: **un correo nunca tumba una operación**. Que
 * el aviso de bienvenida no salga no puede impedir que el empleado quede creado,
 * ni que un cobro se registre. Por eso `enviarCorreo` no lanza: informa si pudo o
 * no, y quien llama decide —casi siempre, seguir adelante.
 *
 * El cliente se construye bajo demanda: un Platlia sin Resend configurado tiene
 * que funcionar entero salvo los avisos.
 */

export type ResultadoEnvio =
  | { enviado: true; id: string }
  | { enviado: false; motivo: string };

export async function enviarCorreo(args: {
  para: string | string[];
  asunto: string;
  html: string;
  /** Alternativa en texto plano. Sin ella, varios clientes marcan el correo como spam. */
  texto: string;
  /**
   * A quién le contesta el botón "Responder".
   *
   * Para un aviso del sistema no aplica —nadie le responde a una notificación—,
   * pero para un mensaje del formulario comercial es todo: sin esto, contestarle
   * a un interesado obliga a copiar su correo a mano del cuerpo del mensaje.
   */
  responderA?: string;
}): Promise<ResultadoEnvio> {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    return {
      enviado: false,
      motivo: "Falta RESEND_API_KEY o EMAIL_FROM: no se envió el correo.",
    };
  }

  try {
    const resend = new Resend(requireEnv("RESEND_API_KEY", "enviar correos"));
    const { data, error } = await resend.emails.send({
      from: requireEnv("EMAIL_FROM", "enviar correos"),
      to: args.para,
      subject: args.asunto,
      html: args.html,
      text: args.texto,
      ...(args.responderA ? { replyTo: args.responderA } : {}),
    });

    if (error) return { enviado: false, motivo: error.message };
    if (!data?.id) return { enviado: false, motivo: "Resend no devolvió un identificador." };

    return { enviado: true, id: data.id };
  } catch (error) {
    return {
      enviado: false,
      motivo: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Envía y deja constancia en el log si falla, sin propagar.
 *
 * Es la forma en que se llama desde una Server Action: el correo es un efecto
 * secundario, no parte de la transacción.
 */
export async function enviarCorreoSinBloquear(
  args: Parameters<typeof enviarCorreo>[0] & { contexto: string },
): Promise<void> {
  const resultado = await enviarCorreo(args);
  if (!resultado.enviado) {
    console.warn(`[correo] ${args.contexto}: ${resultado.motivo}`);
  }
}
