/**
 * Plantillas de correo.
 *
 * HTML de 2005 a propósito: tablas, estilos en línea y nada de CSS moderno. Los
 * clientes de correo —Outlook sobre todo— no entienden flexbox ni grid, y un
 * correo que se ve roto en Gmail es peor que no mandarlo.
 *
 * Los colores son los de la marca, escritos a mano: acá no llegan las variables
 * CSS del producto.
 *
 * Módulo puro: arma cadenas, no envía nada.
 */

const VERDE = "#1d4e51";
const TERRACOTA = "#a75f39";
const TEXTO = "#12171a";
const SUAVE = "#59656d";
const BORDE = "#dde3e6";

function escapar(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function marco(contenido: string): string {
  return `<!doctype html>
<html lang="es">
<body style="margin:0;padding:24px;background:#f4f6f7;font-family:Helvetica,Arial,sans-serif;color:${TEXTO}">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid ${BORDE};border-radius:12px">
    <tr>
      <td style="padding:24px 28px">
        <p style="margin:0 0 20px;font-size:18px;font-weight:bold;color:${VERDE}">Platlia</p>
        ${contenido}
      </td>
    </tr>
  </table>
  <p style="max-width:520px;margin:16px auto 0;font-size:12px;color:${SUAVE};text-align:center">
    Platlia · Gestión de restaurantes y bares
  </p>
</body>
</html>`;
}

function boton(url: string, texto: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0">
    <tr><td style="background:${VERDE};border-radius:8px">
      <a href="${escapar(url)}" style="display:inline-block;padding:12px 20px;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px">${escapar(texto)}</a>
    </td></tr>
  </table>`;
}

export type Correo = { asunto: string; html: string; texto: string };

/**
 * Bienvenida a alguien que acaba de ser sumado a un negocio.
 *
 * NO lleva la contraseña. Se la entrega el dueño en persona: mandarla por correo
 * la deja escrita para siempre en un buzón que no controlamos.
 */
export function correoDeBienvenida(args: {
  nombre: string;
  negocio: string;
  rol: string;
  urlDeIngreso: string;
}): Correo {
  const asunto = `Te sumaron a ${args.negocio} en Platlia`;

  const html = marco(`
    <p style="margin:0 0 12px;font-size:15px">Hola ${escapar(args.nombre)},</p>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.5">
      Te agregaron a <strong>${escapar(args.negocio)}</strong> como
      <strong style="color:${TERRACOTA}">${escapar(args.rol.toLowerCase())}</strong>.
      Ya podés entrar con este correo.
    </p>
    ${boton(args.urlDeIngreso, "Entrar a Platlia")}
    <p style="margin:12px 0 0;font-size:13px;color:${SUAVE};line-height:1.5">
      La contraseña te la da quien te agregó: por seguridad no viaja por correo.
      Si no esperabas este mensaje, ignoralo.
    </p>
  `);

  const texto = [
    `Hola ${args.nombre},`,
    "",
    `Te agregaron a ${args.negocio} en Platlia como ${args.rol.toLowerCase()}.`,
    `Entrá acá: ${args.urlDeIngreso}`,
    "",
    "La contraseña te la da quien te agregó: por seguridad no viaja por correo.",
    "Si no esperabas este mensaje, ignoralo.",
  ].join("\n");

  return { asunto, html, texto };
}

/** Aviso de que la licencia está por vencerse. */
export function correoDeVencimiento(args: {
  negocio: string;
  diasRestantes: number;
  urlDeFacturacion: string;
}): Correo {
  const urgente = args.diasRestantes <= 0;
  const asunto = urgente
    ? `El servicio de ${args.negocio} está cortado`
    : `A ${args.negocio} le quedan ${args.diasRestantes} días de servicio`;

  const html = marco(`
    <p style="margin:0 0 12px;font-size:15px;line-height:1.5">
      ${
        urgente
          ? `La licencia de <strong>${escapar(args.negocio)}</strong> venció y el servicio está cortado.`
          : `A <strong>${escapar(args.negocio)}</strong> le quedan <strong>${args.diasRestantes}</strong> días de servicio.`
      }
    </p>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.5">
      Tus datos están intactos: no se borra nada. Renovás y el negocio vuelve a funcionar en el momento.
    </p>
    ${boton(args.urlDeFacturacion, "Renovar la suscripción")}
  `);

  const texto = [
    urgente
      ? `La licencia de ${args.negocio} venció y el servicio está cortado.`
      : `A ${args.negocio} le quedan ${args.diasRestantes} días de servicio.`,
    "",
    "Tus datos están intactos: no se borra nada.",
    `Renová acá: ${args.urlDeFacturacion}`,
  ].join("\n");

  return { asunto, html, texto };
}
