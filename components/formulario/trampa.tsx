import { CAMPO_TRAMPA } from "@/lib/actions/estado";

/**
 * El campo que solo llena un robot.
 *
 * Va escondido y sin etiqueta visible: una persona no lo ve y nunca lo escribe;
 * un programa que completa todo lo que encuentra en el formulario, sí. Cuando
 * llega con algo, `definePublicAction` contesta que todo salió bien y no hace
 * nada —decirle que lo detectamos solo le enseña a esquivarlo—.
 *
 * Tres detalles que lo hacen funcionar y son fáciles de perder:
 *
 * · **No se esconde con `type="hidden"`.** Un robot que lee el HTML ignora los
 *   ocultos igual que ignoraría este; lo que lo delata es que parezca un campo
 *   normal en el marcado y solo el CSS lo saque de la vista.
 * · **`tabIndex={-1}` y `aria-hidden`** para que quien navega con teclado o con
 *   lector de pantalla no se lo encuentre: si no, la trampa la pisa justamente
 *   la persona que más ayuda necesita.
 * · **`autoComplete="off"`** para que el navegador no lo rellene solo, que
 *   convertiría a un cliente legítimo en un robot a los ojos del servidor.
 */
export function CampoTrampa() {
  return (
    <div aria-hidden className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
      <label htmlFor={CAMPO_TRAMPA}>No completes este campo</label>
      <input id={CAMPO_TRAMPA} name={CAMPO_TRAMPA} type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
    </div>
  );
}
