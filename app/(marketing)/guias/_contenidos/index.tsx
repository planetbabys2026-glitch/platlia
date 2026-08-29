import type { ComponentType } from "react";
import { ImpuestoAlConsumo } from "./impuesto-consumo";
import { FacturaDian } from "./dian";
import { Propina } from "./propina";
import { CierreDeCaja } from "./cierre-caja";
import { CostoPorPlato } from "./costo-plato";
import type { Guia } from "../guias";

/**
 * De qué slug sale qué contenido.
 *
 * La carpeta empieza con `_` para que no genere ruta: `/guias/_contenidos` no
 * existe. Es la misma convención con la que el proyecto esconde rutas privadas.
 *
 * El mapa es explícito y no un `import()` dinámico armado con el slug: así el
 * compilador verifica que cada guía declarada tenga su archivo, y una guía
 * publicada sin contenido no llega a producción como un 404 silencioso.
 */
export const CONTENIDOS: Record<string, ComponentType> = {
  "impuesto-al-consumo-o-iva-en-restaurantes": ImpuestoAlConsumo,
  "factura-electronica-dian-para-restaurantes": FacturaDian,
  "propina-en-colombia": Propina,
  "cierre-de-caja-en-un-bar": CierreDeCaja,
  "costo-por-plato": CostoPorPlato,
};

/** Cómo se nombra en pantalla la página con la que cada guía se enlaza. */
export const NOMBRE_RELACIONADA: Record<Guia["relacionada"], string> = {
  "/software-para-restaurantes": "Platlia lo trae hecho para tu restaurante",
  "/software-para-bares": "Platlia lo trae hecho para tu bar",
  "/precios": "Mirá cuánto cuesta",
};
