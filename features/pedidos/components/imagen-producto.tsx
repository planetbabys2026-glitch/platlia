/**
 * La imagen de un producto en el POS: la foto si existe, o una inicial sobre un
 * tinte de color si no.
 *
 * El tinte no es decorativo: viene de los `--chart-N`, la misma paleta que ya
 * usa cualquier gráfico para distinguir series —es la paleta que este producto
 * ya tiene reservada para "diferenciar cosas de un vistazo", y elegirlo por el
 * nombre del producto hace que dos productos sin foto se vean distintos entre
 * sí en vez de ser todos el mismo cuadrado gris. No son los colores de marca:
 * esos son identidad, no función, y acá la función es "reconocer el producto
 * al vuelo", no firmar nada.
 */

const TINTES = [
  "bg-chart-1/15 text-chart-1",
  "bg-chart-2/15 text-chart-2",
  "bg-chart-3/15 text-chart-3",
  "bg-chart-4/15 text-chart-4",
  "bg-chart-5/15 text-chart-5",
] as const;

function tinteDe(nombre: string): string {
  let hash = 0;
  for (let i = 0; i < nombre.length; i++) hash = (hash * 31 + nombre.charCodeAt(i)) | 0;
  return TINTES[Math.abs(hash) % TINTES.length];
}

export function ImagenProducto({
  nombre,
  imageUrl,
  className,
}: {
  nombre: string;
  imageUrl: string | null;
  className?: string;
}) {
  if (imageUrl) {
    // Cloudinary sirve su propia URL final; no hay beneficio en pasarla por next/image acá.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={imageUrl} alt="" className={className} loading="lazy" />;
  }

  return (
    <div
      aria-hidden
      className={`flex items-center justify-center font-display text-2xl font-semibold ${tinteDe(nombre)} ${className ?? ""}`}
    >
      {nombre.trim().charAt(0).toUpperCase() || "?"}
    </div>
  );
}
