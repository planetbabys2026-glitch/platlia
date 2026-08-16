import { cn } from "@/lib/utils";

/**
 * Las piezas de composición de una pantalla de trabajo.
 *
 * Existen porque hasta acá cada vista se dibujaba su propio encabezado a mano y
 * quedaron dos convenciones conviviendo: nueve pantallas con el sistema de marca
 * y veintitrés con el `text-2xl font-semibold` que trae shadcn de fábrica —que es
 * justo la tipografía por defecto que el manual manda rechazar—. Con esto hay un
 * solo lugar donde está escrito cómo se ve un encabezado.
 */

type EncabezadoPantallaProps = {
  titulo: string;
  /** La bajada: qué se hace en esta pantalla, en una frase. */
  descripcion?: string;
  /** Chips y botones. Envuelven solos cuando no entran. */
  acciones?: React.ReactNode;
  className?: string;
};

export function EncabezadoPantalla({
  titulo,
  descripcion,
  acciones,
  className,
}: EncabezadoPantallaProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-4 border-b border-dashed border-[var(--linea-30)] pb-5",
        className,
      )}
    >
      <div className="min-w-0">
        {/* clamp en vez de saltos por breakpoint: el título crece parejo entre el
            teléfono de 360 y el monitor de 1920, sin escalones a mitad de camino. */}
        <h1 className="font-display font-black uppercase tracking-tight text-foreground leading-[0.95] text-[clamp(1.875rem,3vw,2.5rem)]">
          {titulo}
        </h1>
        {descripcion ? (
          <p className="mt-2 font-sans text-sm text-muted-foreground text-pretty">{descripcion}</p>
        ) : null}
      </div>
      {acciones ? <div className="flex flex-wrap items-center gap-2.5">{acciones}</div> : null}
    </div>
  );
}

type RotuloSeccionProps = {
  children: React.ReactNode;
  /** Se pinta con el mismo peso del título, a la derecha del texto. */
  cuenta?: React.ReactNode;
  className?: string;
};

/**
 * El rótulo de sección con su guía punteada. Es la firma del sistema: la línea de
 * la tirilla térmica que corre hasta el borde y ata la pantalla.
 */
export function RotuloSeccion({ children, cuenta, className }: RotuloSeccionProps) {
  return (
    <p className={cn("rotulo-seccion", className)}>
      <span className="shrink-0">
        {children}
        {cuenta !== undefined ? (
          <>
            {" · "}
            <span className="numeral font-bold text-foreground">{cuenta}</span>
          </>
        ) : null}
      </span>
    </p>
  );
}

type PanelProps = React.ComponentProps<"div"> & {
  /** Sube un escalón de superficie, para lo seleccionado o lo que está encima. */
  destacado?: boolean;
};

/** La tarjeta del sistema: superficie de panel, borde fino, radio de marca. */
export function Panel({ className, destacado, ...props }: PanelProps) {
  return (
    <div
      className={cn(
        "rounded-lg border transition-colors",
        destacado
          ? "border-[var(--papel-60)] bg-[var(--panel-2)]"
          : "border-[var(--linea-16)] bg-[var(--panel)]",
        className,
      )}
      {...props}
    />
  );
}

type VacioProps = {
  titulo: string;
  /** Qué hacer para que deje de estar vacío. Nunca dejarlo en blanco. */
  descripcion?: string;
  icono?: React.ReactNode;
  accion?: React.ReactNode;
  className?: string;
};

/**
 * El estado vacío. El manifiesto lo pide como estado de primera clase, y una
 * pantalla en blanco en mitad de un turno no dice si no hay nada o si falló algo.
 */
export function Vacio({ titulo, descripcion, icono, accion, className }: VacioProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-[var(--linea-30)] px-6 py-12 text-center",
        className,
      )}
    >
      {icono ? <div className="text-muted-foreground [&_svg]:size-7">{icono}</div> : null}
      <p className="font-display text-xl font-black uppercase tracking-tight text-foreground">
        {titulo}
      </p>
      {descripcion ? (
        <p className="max-w-sm text-sm text-muted-foreground text-pretty">{descripcion}</p>
      ) : null}
      {accion ? <div className="mt-1">{accion}</div> : null}
    </div>
  );
}
