import { z } from "zod";

/**
 * Vive aparte del archivo de la acción porque en un `"use server"` toda función
 * de módulo se compila como Server Action y el build falla con "Server Actions
 * must be async functions", que no menciona a zod por ningún lado.
 */

const texto = (max: number) => z.string().trim().max(max);

export const mensajeComercialSchema = z.object({
  nombre: texto(120).min(2, "Escribí tu nombre."),
  negocio: texto(120).optional().default(""),
  correo: z.string().trim().toLowerCase().email("Revisá el correo: no parece válido."),
  telefono: texto(40).min(7, "Escribí un teléfono donde podamos ubicarte."),
  ciudad: texto(80).optional().default(""),
  mensaje: texto(2000).optional().default(""),

  /**
   * Trampa para robots.
   *
   * Este formulario es público y manda un correo, o sea que es una puerta
   * abierta para que alguien nos inunde el buzón. El campo va escondido y sin
   * etiqueta: una persona no lo ve y nunca lo llena; un robot que completa todo
   * lo que encuentra, sí. Si viene con algo, se contesta que todo salió bien y
   * no se manda nada —decirle "sos un robot" solo le enseña a esquivarlo—.
   */
  sitio: texto(200).optional().default(""),
});
