"use server";

import { definePublicAction, ErrorDeUsuario } from "@/lib/actions/define-action";
import { CUPOS } from "@/lib/seguridad/limite";
import { enviarCorreo } from "@/lib/email/enviar";
import { CORREO_SOPORTE } from "@/lib/soporte";
import { mensajeComercialSchema } from "./schemas";

/**
 * El formulario de contacto de la portada.
 *
 * **Antes no mandaba nada.** Era un `setTimeout` de 1200 ms que mostraba
 * "¡Mensaje enviado con éxito! Un asesor comercial se comunicará contigo" —el
 * comentario del código decía `// Simular envío`—. Cada persona que lo llenaba
 * se perdía, y encima se iba creyendo que la iban a llamar: de todos los lugares
 * donde puede haber un defecto, el que descarta clientes en silencio es el peor.
 *
 * Dos decisiones que no son las de siempre en este proyecto:
 *
 * · **Acá el correo SÍ tumba la operación.** La regla de `lib/email/enviar.ts`
 *   es que un correo nunca frena nada, porque suele ser un efecto secundario:
 *   que no salga el aviso de bienvenida no puede impedir crear al empleado. Pero
 *   en este formulario el correo ES la operación. Si falla y contestamos que
 *   todo bien, volvemos exactamente al defecto que vinimos a arreglar.
 * · **El "Responder" le contesta a la persona**, no a nosotros mismos: sin eso,
 *   atender un interesado empieza por copiar su correo a mano del cuerpo.
 */
export const enviarMensajeComercial = definePublicAction({
  schema: mensajeComercialSchema,
  // La trampa que este formulario estrenó ahora la aplica el envoltorio, así
  // que el `if` que estaba acá adentro se fue: era la misma decisión escrita en
  // dos lados el día que otra puerta pública la necesitara. Se le suma el freno
  // por procedencia, que la trampa sola no cubre —un robot que la esquiva una
  // vez la esquiva mil—.
  protecciones: { limite: CUPOS.contacto, turnstile: true, trampa: true },
  respuestaParaTrampa: () => ({ enviado: true }),
  async handler({ input }) {
    const linea = (etiqueta: string, valor: string) =>
      valor.trim() ? `${etiqueta}: ${valor.trim()}` : null;

    const datos = [
      linea("Nombre", input.nombre),
      linea("Negocio", input.negocio),
      linea("Correo", input.correo),
      linea("Teléfono", input.telefono),
      linea("Ciudad", input.ciudad),
    ].filter((l): l is string => l !== null);

    const cuerpo = input.mensaje.trim();

    const resultado = await enviarCorreo({
      para: CORREO_SOPORTE,
      // El asunto trae el nombre del negocio: en una bandeja con veinte
      // consultas, "Platlia — consulta" veinte veces no distingue ninguna.
      asunto: `Consulta comercial · ${input.negocio.trim() || input.nombre.trim()}`,
      responderA: input.correo,
      texto: [...datos, "", cuerpo || "(Sin mensaje)"].join("\n"),
      html: `
        <h2 style="font-family:sans-serif">Consulta desde la página</h2>
        <ul style="font-family:sans-serif;line-height:1.6">
          ${datos.map((d) => `<li>${escapar(d)}</li>`).join("")}
        </ul>
        <p style="font-family:sans-serif;white-space:pre-wrap">${escapar(cuerpo || "(Sin mensaje)")}</p>
      `,
    });

    if (!resultado.enviado) {
      // El motivo técnico va al log, no a la pantalla: al interesado no le sirve
      // saber que Resend devolvió 429, le sirve saber por dónde escribirnos.
      console.error(`[contacto] no se pudo enviar: ${resultado.motivo}`);
      throw new ErrorDeUsuario(
        "No pudimos enviar tu mensaje en este momento. Escribinos por WhatsApp y te atendemos ya.",
      );
    }

    return { enviado: true };
  },
});

/** El correo se arma con datos que escribe cualquiera desde internet. */
function escapar(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
