/**
 * Contraste, para decidir de qué color va el texto sobre un color elegido por
 * otro.
 *
 * El menú QR deja que cada negocio elija su acento. Con el acento fijo de Platlia
 * alcanzaba con escribir el color del texto a mano; con seis temas —y con el
 * color libre que el dueño puede poner— hay que calcularlo, porque un botón
 * amarillo con letra blanca no se lee y uno azul oscuro con letra negra tampoco.
 *
 * Sin dependencias y sin `server-only`: se usa igual en el servidor y en el
 * cliente, y tiene pruebas.
 */

export type Rgb = { r: number; g: number; b: number };

/** Acepta `#RGB` y `#RRGGBB`. Devuelve null si no es un color entendible. */
export function leerHex(hex: string): Rgb | null {
  const limpio = hex.trim().replace(/^#/, "");
  const completo =
    limpio.length === 3
      ? limpio
          .split("")
          .map((c) => c + c)
          .join("")
      : limpio;
  if (!/^[0-9A-Fa-f]{6}$/.test(completo)) return null;
  return {
    r: parseInt(completo.slice(0, 2), 16),
    g: parseInt(completo.slice(2, 4), 16),
    b: parseInt(completo.slice(4, 6), 16),
  };
}

/** Luminancia relativa según WCAG 2.1 (sRGB linealizado). */
export function luminancia({ r, g, b }: Rgb): number {
  const canal = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

/** Razón de contraste WCAG entre dos colores. 1 = iguales, 21 = negro y blanco. */
export function razonDeContraste(a: Rgb, b: Rgb): number {
  const la = luminancia(a);
  const lb = luminancia(b);
  const [claro, oscuro] = la >= lb ? [la, lb] : [lb, la];
  return (claro + 0.05) / (oscuro + 0.05);
}

const TINTA: Rgb = { r: 0x17, g: 0x15, b: 0x12 };
const PAPEL: Rgb = { r: 0xed, g: 0xe7, b: 0xda };

/**
 * De qué color va el texto que se escribe ENCIMA de `fondo`: la tinta o el papel
 * de la marca, el que contraste más. No se usa blanco/negro puros porque sobre un
 * color saturado quedan duros y se van del mundo Dark Kitchen-Fire.
 */
export function textoSobre(fondo: string): string {
  const rgb = leerHex(fondo);
  if (!rgb) return "#EDE7DA";
  return razonDeContraste(rgb, TINTA) >= razonDeContraste(rgb, PAPEL) ? "#171512" : "#EDE7DA";
}

/**
 * ¿Este acento se lee como TEXTO sobre el fondo del menú?
 *
 * Un acento oscuro —el azul del preset Titanio, por ejemplo— sirve para rellenar
 * un botón pero desaparece si se usa para escribir un precio sobre un fondo
 * también oscuro. Cuando no llega a 4.5:1 conviene mostrar el precio en papel y
 * dejar el acento solo para los rellenos.
 */
export function acentoSirveComoTexto(acento: string, fondo: string): boolean {
  const a = leerHex(acento);
  const f = leerHex(fondo);
  if (!a || !f) return false;
  return razonDeContraste(a, f) >= 4.5;
}

/**
 * Aclara u oscurece un color hacia el papel o la tinta, para fabricar el tono de
 * texto cuando el acento crudo no alcanza.
 */
export function mezclarHacia(color: string, destino: "papel" | "tinta", proporcion: number): string {
  const c = leerHex(color);
  if (!c) return color;
  const d = destino === "papel" ? PAPEL : TINTA;
  const p = Math.min(1, Math.max(0, proporcion));
  const mezcla = (x: number, y: number) => Math.round(x + (y - x) * p);
  const hex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${hex(mezcla(c.r, d.r))}${hex(mezcla(c.g, d.g))}${hex(mezcla(c.b, d.b))}`;
}
