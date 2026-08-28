import { preguntasFrecuentes } from "../preguntas";
import { enlaceWhatsapp } from "@/lib/soporte";

/**
 * Las preguntas, a la vista.
 *
 * No está solo por posicionamiento: es la sección que cierra ventas. Quien llega
 * a la portada tiene cuatro dudas concretas —cuánto sale, si la factura va
 * aparte, si lo amarra un contrato, qué equipo necesita— y si no las encuentra
 * escritas, se va a preguntarlas a otro lado o no pregunta.
 *
 * Sale de `preguntas.ts`, el mismo archivo que alimenta el marcado que leen
 * Google y los asistentes. Google exige que lo que se declara como `FAQPage`
 * esté visible en la página; con dos listas separadas, la primera edición las
 * habría separado y el marcado pasaría a declarar algo que no existe.
 *
 * Es `<details>` nativo y no un acordeón hecho a mano: funciona sin JavaScript,
 * el buscador lee el contenido aunque esté plegado, y el teclado lo abre solo.
 */
export function Faq({ mensualCop }: { mensualCop: number | null }) {
  const preguntas = preguntasFrecuentes(mensualCop);

  return (
    <section
      id="preguntas"
      className="border-t border-dashed border-[var(--linea-30)] bg-[var(--tinta)] py-24"
    >
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 space-y-4 text-center">
          <span className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">
            — Antes de que preguntes
          </span>
          <h2 className="font-display text-4xl font-black uppercase leading-[0.92] tracking-tight text-[var(--papel)] sm:text-5xl">
            Lo que todos nos preguntan
          </h2>
        </div>

        <div className="divide-y divide-dashed divide-[var(--linea-30)] border-y border-dashed border-[var(--linea-30)]">
          {preguntas.map(({ pregunta, respuesta }) => (
            <details key={pregunta} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brasa)]">
                <h3 className="text-base font-semibold text-[var(--papel)] sm:text-lg">
                  {pregunta}
                </h3>
                <span
                  aria-hidden
                  className="shrink-0 font-mono text-xl leading-none text-[var(--brasa)] transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                {respuesta}
              </p>
            </details>
          ))}
        </div>

        <p className="mt-10 text-center text-sm text-muted-foreground">
          ¿Te quedó otra duda?{" "}
          <a
            href={enlaceWhatsapp("Hola, tengo una duda sobre Platlia para mi negocio.")}
            target="_blank"
            rel="noopener"
            className="font-semibold text-[var(--brasa)] underline underline-offset-4"
          >
            Escribinos por WhatsApp
          </a>{" "}
          y te contestamos hoy.
        </p>
      </div>
    </section>
  );
}
