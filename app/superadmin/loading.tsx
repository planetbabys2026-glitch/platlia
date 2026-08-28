import { EsqueletoPantalla } from "@/components/ui/esqueleto-pantalla";
import { VeloDeCarga } from "@/components/marca/loader";

export default function SuperadminLoading() {
  return (
    <>
      <EsqueletoPantalla />
      <VeloDeCarga />
    </>
  );
}
