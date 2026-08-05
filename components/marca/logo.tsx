import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * La marca, en sus tres piezas.
 *
 *  · `Logo`      emblema + logotipo + bajada. Es la firma completa y necesita
 *                tamaño: por debajo de unos 80 px de alto la bajada deja de
 *                leerse y se vuelve una mancha. Va en la portada y en el correo.
 *  · `Logotipo`  emblema + palabra, sin bajada. Es la pieza de la interfaz: la
 *                barra superior, el encabezado del tiquete, la pantalla de ingreso.
 *  · `Isotipo`   solo el emblema, para cuando no hay ancho (avatar, favicon,
 *                icono de la PWA).
 *
 * El emblema trae su propio disco blanco, así que se ve igual sobre cualquier
 * fondo y tiene una sola versión. La palabra no: en verde azulado profundo sobre
 * el fondo oscuro queda ilegible, así que hay una versión inversa con la palabra
 * aclarada.
 *
 * Las dos versiones se pintan siempre y se alternan por CSS con la clase `dark`.
 * Elegir en el cliente leyendo el tema haría parpadear el logo equivocado en cada
 * carga, que es justo lo que no puede pasar con lo primero que ve el usuario.
 */

type MarcaProps = {
  /** Se espera un alto (`h-10`, `h-20`); el ancho se calcula solo. */
  className?: string;
  /** Para el logo que entra en el primer render de la página. */
  priority?: boolean;
};

function ParClaroOscuro({
  claro,
  oscuro,
  width,
  height,
  alt,
  className,
  priority,
}: MarcaProps & {
  claro: string;
  oscuro: string;
  width: number;
  height: number;
  alt: string;
}) {
  return (
    <>
      <Image
        src={claro}
        width={width}
        height={height}
        alt={alt}
        priority={priority}
        className={cn("w-auto dark:hidden", className)}
      />
      <Image
        src={oscuro}
        width={width}
        height={height}
        alt=""
        aria-hidden
        priority={priority}
        className={cn("hidden w-auto dark:block", className)}
      />
    </>
  );
}

export function Logo(props: MarcaProps) {
  return (
    <ParClaroOscuro
      {...props}
      claro="/marca/platlia-logo.png"
      oscuro="/marca/platlia-logo-inverso.png"
      width={1200}
      height={400}
      alt="Platlia — Gestión de Restaurantes y Bares"
    />
  );
}

export function Logotipo(props: MarcaProps) {
  return (
    <ParClaroOscuro
      {...props}
      claro="/marca/platlia-logotipo.png"
      oscuro="/marca/platlia-logotipo-inverso.png"
      width={900}
      height={299}
      alt="Platlia"
    />
  );
}

export function Isotipo({ className, priority = false }: MarcaProps) {
  return (
    <Image
      src="/marca/platlia-isotipo.png"
      width={512}
      height={512}
      alt="Platlia"
      priority={priority}
      className={cn("w-auto", className)}
    />
  );
}
