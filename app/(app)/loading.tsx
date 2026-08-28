import { EsqueletoPantalla } from "@/components/ui/esqueleto-pantalla";
import { VeloDeCarga } from "@/components/marca/loader";

/**
 * El cambio de módulo: salón → caja → cocina.
 *
 * El esqueleto queda debajo para que el desenfoque tenga qué desenfocar y para
 * que se adivine la forma de lo que viene; encima, la comanda centrada dice que
 * el sistema está trabajando. La barra de navegación se sigue viendo detrás del
 * velo, así que nadie pierde de vista dónde está parado.
 */
export default function Loading() {
  return (
    <>
      <EsqueletoPantalla />
      <VeloDeCarga />
    </>
  );
}
