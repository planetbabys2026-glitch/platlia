import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { getPedidoParaTiquete } from "@/features/pedidos/queries";
import { requireBusiness } from "@/lib/auth/dal";
import { anchoEnCaracteres } from "@/lib/printing/ticket";
import { componerRecibo } from "@/lib/printing/recibo";
import { BotonImprimir, ImprimirAlAbrir } from "../../imprimir-al-abrir";

export const dynamic = "force-dynamic";

export default async function TiquetePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ auto?: string }>;
}) {
  const [{ id }, { auto }] = await Promise.all([params, searchParams]);
  // `?auto=0` muestra el tiquete sin mandarlo a la impresora: sirve para
  // revisarlo antes de gastar papel, y para que las pruebas no queden colgadas
  // esperando el cuadro de impresión del navegador.
  const imprimirSolo = auto !== "0";

  // Verifica por su cuenta, como toda página. No exige licencia vigente a
  // propósito: reimprimir un tiquete viejo tiene que funcionar aunque la
  // suscripción se haya vencido.
  const ctx = await requireBusiness();

  const pedido = await getPedidoParaTiquete(ctx.business.id, id);
  if (!pedido) notFound();

  const negocio = pedido.business;
  const settings = negocio.settings;
  const ancho = anchoEnCaracteres(settings?.receiptWidth ?? "MM80");
  const milimetros = (settings?.receiptWidth ?? "MM80") === "MM55" ? 55 : 80;
  /**
   * Lo que el cabezal puede marcar, que NO es el ancho del papel.
   *
   * Un rollo de 80 mm imprime 72; uno de 55, 48. El resto es el margen mecánico
   * que la máquina no alcanza, y todo lo que caiga ahí sencillamente no sale.
   */
  const imprimibleMm = milimetros === 55 ? 48 : 72;
  const zona = settings?.timeZone ?? "America/Bogota";

  /**
   * Las líneas salen del MISMO módulo que usa la cola de impresión térmica.
   *
   * Estaban escritas acá, que era el único lugar que las necesitaba mientras
   * imprimir significaba abrir una pestaña. Con la impresora del local en el
   * medio hay dos caminos hacia el mismo papel, y si cada uno compusiera lo suyo
   * reimprimir desde la pantalla daría un tiquete distinto del que salió por la
   * caja.
   */
  const lineas = componerRecibo(pedido, negocio, {
    ancho,
    zona,
    receiptHeader: settings?.receiptHeader,
    receiptFooter: settings?.receiptFooter,
    turnNumberMax: settings?.turnNumberMax ?? 99,
  });

  /**
   * El QR de la DIAN, dibujado acá y no pedido a un servicio de imágenes.
   *
   * El resto de la aplicación arma sus QR con `api.qrserver.com`, que para una
   * pantalla está bien. Para la tirilla no: la estación de impresión de un bar
   * suele estar en una red sin salida, y un QR que no carga es un papel que no
   * sirve. Se genera como SVG en el servidor, sin pedirle nada a nadie.
   */
  const qrDian = pedido.facturaElectronicaUrlQr
    ? await QRCode.toString(pedido.facturaElectronicaUrlQr, {
        type: "svg",
        margin: 0,
        errorCorrectionLevel: "M",
      })
    : null;

  return (
    <>
      {/* El tamaño de página depende del rollo configurado: 55 y 80 mm no son el
          mismo documento, así que el CSS se arma acá y no en una hoja global. */}
      <style>{`
        @page { size: ${milimetros}mm auto; margin: ${(milimetros - imprimibleMm) / 2}mm; }
        @media print { .no-imprimir { display: none !important; } }
        /* ESTA es la unica pantalla del producto que necesita una
           monoespaciada DE VERDAD, y por eso no usa la variable --font-mono.
           componerRecibo arma cada renglon rellenando con espacios hasta un
           ancho en CARACTERES, y el width de abajo esta en ch: las dos cosas
           suponen que toda letra mide lo mismo. Desde que --font-mono es Space
           Grotesk (proporcional), apuntar aca habria torcido cada columna de
           cada recibo impreso, y es un defecto que no se ve en pantalla: se
           descubre en el papel que se le entrega al cliente.

           COURIER NEW Y NADA MAS. Antes habia una pila —ui-monospace, SF Mono,
           Menlo, Consolas...— y cada sistema elegia una distinta: todas son
           monoespaciadas, pero su AVANCE no es el mismo (Consolas mide 0.55em
           por caracter, SF Mono 0.6em). Con el ancho fijado en ch y el cuerpo
           clavado en 9.5px, las 48 columnas del rollo de 80 mm caian justo en el
           borde del papel, y en el sistema que tocara una letra un poco mas
           ancha la ULTIMA COLUMNA —la de los importes, pegada a la derecha— se
           salia del rollo y no se imprimia. Courier New esta en todos los
           sistemas, su avance es exactamente 0.6em en todos, y es la letra con
           la que se imprimen los recibos desde siempre.

           Y el cuerpo se DERIVA del ancho IMPRIMIBLE, que no es el del papel:
           un rollo de 80 mm tiene un cabezal de 72, y uno de 55 imprime 48. Con
           el margen de 3 mm que habia, el contenido pedia 74 mm de los 72 que la
           maquina puede marcar, asi que el borde derecho —la columna de los
           importes— caia fuera del cabezal y salia cortado. Era la segunda causa
           del mismo sintoma, y la unica que no se arregla cambiando de letra.
           El 0.98 es holgura: sin ella el renglon mas largo termina exactamente
           en el filo. */
        .tiquete {
          font-family: "Courier New", Courier, monospace;
          font-size: calc(${imprimibleMm}mm * 0.98 / ${ancho} / 0.6);
          line-height: 1.35;
          white-space: pre;
          color: #000;
          /* En negrita porque una termica no imprime grises: convierte cada pixel
             a punto o no-punto. Los trazos finos de Courier a este cuerpo salian
             medio quemados, que es lo que se ve como borroso. */
          font-weight: 700;
          /* Y sin suavizado, por lo mismo: el antialiasing rodea cada letra de
             pixeles grises que la impresora tiene que decidir si quema o no, y el
             resultado es un borde sucio. Apagado, cada letra es negro puro. */
          -webkit-font-smoothing: none;
          -moz-osx-font-smoothing: grayscale;
          text-rendering: geometricPrecision;
          print-color-adjust: exact;
          -webkit-print-color-adjust: exact;
          /* Las mayusculas NO van aca: las pone componerRecibo, que es de donde
             salen tambien las lineas de la cola termica. Con text-transform
             puesto solo en esta pantalla, el mismo pedido salia en caja alta por
             el navegador y en texto mixto por la impresora del local. */
          margin: 0 auto;
          width: ${ancho}ch;
        }
        /* El logo, en escala de grises y contenido dentro del cabezal.
           En blanco y negro porque una termica no imprime color: mandarle un
           logo saturado deja que el driver decida el gris de cada punto, y lo
           que sale es una mancha. Con grayscale y contraste alto, cada trazo
           cae de un lado o del otro.
           El alto va topeado en 22 mm: cada milimetro de logo es papel que se
           gasta en CADA venta de cada noche, y un logo cuadrado sin tope se
           comeria 7 cm de rollo por tiquete. */
        .logo-negocio {
          display: block;
          margin: 0 auto 2mm;
          max-width: ${imprimibleMm}mm;
          max-height: 22mm;
          width: auto;
          filter: grayscale(1) contrast(1.6);
          print-color-adjust: exact;
          -webkit-print-color-adjust: exact;
        }
        /* El QR no puede quedar más ancho que el rollo ni más chico que lo que
           un teléfono alcanza a leer de un papel térmico. */
        .qr-dian { width: ${milimetros === 55 ? 30 : 38}mm; margin: 2mm auto 0; }
        .qr-dian svg { width: 100%; height: auto; shape-rendering: crispEdges; }
      `}</style>

      {imprimirSolo && <ImprimirAlAbrir />}
      {/* El logo va arriba de todo y NO reemplaza al encabezado: el nombre, el
          NIT y la dirección se siguen imprimiendo en texto. Un logo es una marca,
          no un dato fiscal, y quien reclame una garantía necesita el NIT legible
          aunque el dibujo salga flojo.
          eslint-disable-next-line @next/next/no-img-element — next/image sirve
          una imagen optimizada por una ruta propia y acá se imprime: hace falta
          el archivo tal cual, y el ancho lo manda el rollo, no el viewport. */}
      {negocio.logoUrl && (
         
        <img className="logo-negocio" src={negocio.logoUrl} alt="" />
      )}
      <pre className="tiquete">{lineas.join("\n")}</pre>
      {qrDian && (
        <div
          className="qr-dian"
          aria-label="Código QR de la factura electrónica"
          dangerouslySetInnerHTML={{ __html: qrDian }}
        />
      )}
      <BotonImprimir />
    </>
  );
}
