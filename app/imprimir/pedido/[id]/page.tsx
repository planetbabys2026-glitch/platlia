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
        @page { size: ${milimetros}mm auto; margin: 3mm; }
        @media print { .no-imprimir { display: none !important; } }
        /* ESTA es la unica pantalla del producto que necesita una
           monoespaciada DE VERDAD, y por eso no usa la variable --font-mono.
           componerRecibo arma cada renglon rellenando con espacios hasta un
           ancho en CARACTERES, y el width de abajo esta en ch: las dos cosas
           suponen que toda letra mide lo mismo. Desde que --font-mono es Space
           Grotesk (proporcional), apuntar aca habria torcido cada columna de
           cada recibo impreso, y es un defecto que no se ve en pantalla: se
           descubre en el papel que se le entrega al cliente. */
        .tiquete {
          font-family: ui-monospace, "SFMono-Regular", "Menlo", "Consolas",
            "Liberation Mono", "Courier New", monospace;
          font-size: 9.5px;
          line-height: 1.4;
          white-space: pre;
          color: #000;
          margin: 0 auto;
          width: ${ancho}ch;
        }
        /* El QR no puede quedar más ancho que el rollo ni más chico que lo que
           un teléfono alcanza a leer de un papel térmico. */
        .qr-dian { width: ${milimetros === 55 ? 30 : 38}mm; margin: 2mm auto 0; }
        .qr-dian svg { width: 100%; height: auto; shape-rendering: crispEdges; }
      `}</style>

      {imprimirSolo && <ImprimirAlAbrir />}
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
