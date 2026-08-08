/**
 * Plantillas de correo.
 *
 * HTML de 2005 a propósito: tablas, estilos en línea y nada de CSS moderno. Los
 * clientes de correo —Outlook sobre todo— no entienden flexbox ni grid, y un
 * correo que se ve roto en Gmail es peor que no mandarlo.
 *
 * Los colores son los de la marca (Dark Kitchen-Fire):
 * Brasa #ff4e1f, Tinta #171512, Papel #ede7da, Línea #c9c2af.
 *
 * Módulo puro: arma cadenas, no envía nada.
 */

const BRASA = "#ff4e1f";
const TINTA = "#171512";
const PAPEL = "#ede7da";
const SUAVE = "#5a554c";
const BORDE = "#e5e0d3";

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
<body style="margin:0;padding:24px;background:#f5f2eb;font-family:Helvetica,Arial,sans-serif;color:${TINTA}">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid ${BORDE};border-radius:12px">
    <tr>
      <td style="padding:24px 28px">
        <p style="margin:0 0 20px;font-size:20px;font-weight:900;letter-spacing:-0.5px;color:${BRASA}">PLATLIA</p>
        ${contenido}
      </td>
    </tr>
  </table>
  <p style="max-width:520px;margin:16px auto 0;font-size:12px;color:${SUAVE};text-align:center">
    Platlia · Sistema gastronómico para bares y restaurantes en Colombia
  </p>
</body>
</html>`;
}

function boton(url: string, texto: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0">
    <tr><td style="background:${BRASA};border-radius:8px">
      <a href="${escapar(url)}" style="display:inline-block;padding:12px 22px;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px">${escapar(texto)}</a>
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
      <strong style="color:${BRASA}">${escapar(args.rol.toLowerCase())}</strong>.
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

/**
 * Bienvenida a alguien que acaba de sumarse al equipo de superadministración.
 *
 * Copia aparte de `correoDeBienvenida`: acá no hay negocio ni rol de producto,
 * es acceso a toda la plataforma. Tampoco lleva la contraseña, por la misma
 * razón de siempre: se la entrega quien lo agregó, no un correo.
 */
export function correoDeAltaSuperAdmin(args: { nombre: string; urlDeIngreso: string }): Correo {
  const asunto = "Te sumaron al equipo de superadministración de Platlia";

  const html = marco(`
    <p style="margin:0 0 12px;font-size:15px">Hola ${escapar(args.nombre)},</p>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.5">
      Te agregaron a la consola de <strong>superadministración</strong> de Platlia:
      desde ahí se da soporte a todos los negocios de la plataforma.
    </p>
    ${boton(args.urlDeIngreso, "Entrar a la consola")}
    <p style="margin:12px 0 0;font-size:13px;color:${SUAVE};line-height:1.5">
      La contraseña te la da quien te agregó: por seguridad no viaja por correo.
      Si no esperabas este mensaje, ignoralo.
    </p>
  `);

  const texto = [
    `Hola ${args.nombre},`,
    "",
    "Te agregaron a la consola de superadministración de Platlia: desde ahí se da",
    "soporte a todos los negocios de la plataforma.",
    `Entrá acá: ${args.urlDeIngreso}`,
    "",
    "La contraseña te la da quien te agregó: por seguridad no viaja por correo.",
    "Si no esperabas este mensaje, ignoralo.",
  ].join("\n");

  return { asunto, html, texto };
}

/**
 * Confirmación de correo, al registrarse.
 *
 * Sin esto el dueño puede haber escrito mal su propio correo el día que más
 * apurado estaba, y no lo sabría hasta el día que lo necesite para recuperar la
 * contraseña —que es justo el día en que ya no puede entrar a corregirlo.
 */
export function correoDeVerificacion(args: { nombre: string; urlDeVerificacion: string }): Correo {
  const asunto = "Confirmá tu correo en Platlia";

  const html = marco(`
    <p style="margin:0 0 12px;font-size:15px">Hola ${escapar(args.nombre)},</p>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.5">
      Confirmá que este es tu correo. Es el que vas a usar para entrar y, si algún
      día olvidás la contraseña, el único lugar donde te podemos mandar cómo
      recuperarla.
    </p>
    ${boton(args.urlDeVerificacion, "Confirmar mi correo")}
    <p style="margin:12px 0 0;font-size:13px;color:${SUAVE};line-height:1.5">
      El enlace vale por 7 días. Si no creaste esta cuenta, ignorá este mensaje.
    </p>
  `);

  const texto = [
    `Hola ${args.nombre},`,
    "",
    "Confirmá que este es tu correo: es el único lugar donde te podemos mandar cómo",
    "recuperar tu contraseña si algún día la olvidás.",
    `Confirmalo acá: ${args.urlDeVerificacion}`,
    "",
    "El enlace vale por 7 días. Si no creaste esta cuenta, ignorá este mensaje.",
  ].join("\n");

  return { asunto, html, texto };
}

/**
 * Enlace para restablecer la contraseña.
 *
 * NO dice si el correo tiene cuenta o no —eso se decide antes de mandar el
 * correo, nunca en su contenido— porque este texto es lo único que ve alguien
 * que escribió un correo ajeno por error o a propósito.
 */
export function correoDeRecuperacion(args: { urlDeRestablecer: string }): Correo {
  const asunto = "Restablecé tu contraseña en Platlia";

  const html = marco(`
    <p style="margin:0 0 12px;font-size:15px;line-height:1.5">
      Pediste restablecer la contraseña de tu cuenta en Platlia.
    </p>
    ${boton(args.urlDeRestablecer, "Elegir una contraseña nueva")}
    <p style="margin:12px 0 0;font-size:13px;color:${SUAVE};line-height:1.5">
      El enlace vale por una hora y sirve una sola vez. Si no lo pediste vos,
      ignorá este mensaje: tu contraseña sigue siendo la misma.
    </p>
  `);

  const texto = [
    "Pediste restablecer la contraseña de tu cuenta en Platlia.",
    `Elegí una nueva acá: ${args.urlDeRestablecer}`,
    "",
    "El enlace vale por una hora y sirve una sola vez.",
    "Si no lo pediste vos, ignorá este mensaje: tu contraseña sigue siendo la misma.",
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
