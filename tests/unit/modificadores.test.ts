import { describe, expect, it } from "vitest";
import {
  alternarOpcion,
  calcularRecargoCop,
  claveDeLinea,
  minimoEfectivo,
  seleccionInicial,
  validarSeleccion,
  type GrupoModificador,
} from "@/lib/modificadores";

const proteina: GrupoModificador = {
  id: "g-proteina",
  name: "Proteína",
  minSelect: 1,
  maxSelect: 1,
  required: true,
  options: [
    { id: "pollo", name: "Pollo", priceDeltaCop: 0, isDefault: true },
    { id: "carne", name: "Carne", priceDeltaCop: 2000 },
    { id: "chorizo", name: "Chorizo", priceDeltaCop: 0 },
  ],
};

const termino: GrupoModificador = {
  id: "g-termino",
  name: "Término",
  minSelect: 1,
  maxSelect: 1,
  required: true,
  options: [
    { id: "tres-cuartos", name: "Tres cuartos", priceDeltaCop: 0 },
    { id: "bien-asado", name: "Bien asado", priceDeltaCop: 0 },
  ],
};

const adiciones: GrupoModificador = {
  id: "g-adiciones",
  name: "Adiciones",
  minSelect: 0,
  maxSelect: 2,
  required: false,
  options: [
    { id: "queso", name: "Extra queso", priceDeltaCop: 3000 },
    { id: "aguacate", name: "Aguacate", priceDeltaCop: 2500 },
    { id: "tocineta", name: "Tocineta", priceDeltaCop: 4000 },
  ],
};

describe("validarSeleccion", () => {
  it("exige una opción de cada grupo obligatorio", () => {
    expect(validarSeleccion([proteina, termino], [])).toBe('Elegí una opción de "Proteína".');
    expect(validarSeleccion([proteina, termino], ["carne"])).toBe(
      'Elegí una opción de "Término".',
    );
    expect(validarSeleccion([proteina, termino], ["carne", "bien-asado"])).toBeNull();
  });

  it("deja pasar un grupo opcional sin elegir nada", () => {
    expect(validarSeleccion([adiciones], [])).toBeNull();
  });

  it("corta cuando se pasan del máximo del grupo", () => {
    expect(validarSeleccion([adiciones], ["queso", "aguacate", "tocineta"])).toBe(
      'En "Adiciones" se eligen máximo 2 opciones.',
    );
  });

  it("corta cuando llegan dos opciones de un grupo de una sola", () => {
    expect(validarSeleccion([proteina], ["pollo", "carne"])).toBe(
      'En "Proteína" se elige una sola opción.',
    );
  });

  /**
   * El caso que importa para la seguridad: el modal nunca mandaría una opción de
   * otro producto, pero un POST armado a mano sí.
   */
  it("rechaza una opción que no pertenece a ningún grupo del producto", () => {
    expect(validarSeleccion([proteina], ["langosta"])).toContain("ya no está disponible");
  });

  it("ignora el minSelect del grupo cuando el producto lo marcó como opcional", () => {
    const opcionalEnEstePlato = { ...proteina, required: false };
    expect(minimoEfectivo(opcionalEnEstePlato)).toBe(0);
    expect(validarSeleccion([opcionalEnEstePlato], [])).toBeNull();
  });
});

describe("calcularRecargoCop", () => {
  it("suma solo lo elegido", () => {
    expect(calcularRecargoCop([proteina, adiciones], ["carne", "queso"])).toBe(5000);
  });

  it("es cero cuando lo elegido no cuesta", () => {
    expect(calcularRecargoCop([proteina, termino], ["pollo", "bien-asado"])).toBe(0);
  });

  it("ignora ids que no existen en los grupos", () => {
    expect(calcularRecargoCop([proteina], ["carne", "inventado"])).toBe(2000);
  });
});

describe("claveDeLinea", () => {
  it("no depende del orden en que se tocaron los botones", () => {
    expect(claveDeLinea("p1", ["carne", "bien-asado"])).toBe(
      claveDeLinea("p1", ["bien-asado", "carne"]),
    );
  });

  it("separa combinaciones distintas del mismo producto", () => {
    expect(claveDeLinea("p1", ["pollo"])).not.toBe(claveDeLinea("p1", ["carne"]));
  });

  it("separa productos distintos con la misma opción", () => {
    expect(claveDeLinea("p1", ["carne"])).not.toBe(claveDeLinea("p2", ["carne"]));
  });

  it("un producto sin opciones se identifica por su id solo", () => {
    expect(claveDeLinea("p1", [])).toBe("p1");
  });

  it("ignora ids repetidos", () => {
    expect(claveDeLinea("p1", ["carne", "carne"])).toBe(claveDeLinea("p1", ["carne"]));
  });
});

describe("alternarOpcion", () => {
  it("en un grupo de una sola opción, reemplaza en vez de sumar", () => {
    expect(alternarOpcion(proteina, ["pollo"], "carne")).toEqual(["carne"]);
  });

  it("no deja vaciar un grupo obligatorio de una sola opción", () => {
    expect(alternarOpcion(proteina, ["carne"], "carne")).toEqual(["carne"]);
  });

  it("sí deja destildar en un grupo opcional", () => {
    const opcional = { ...proteina, required: false, minSelect: 0 };
    expect(alternarOpcion(opcional, ["carne"], "carne")).toEqual([]);
  });

  it("acumula en un grupo de varias y destilda al volver a tocar", () => {
    const conQueso = alternarOpcion(adiciones, [], "queso");
    expect(conQueso).toEqual(["queso"]);
    const conAmbas = alternarOpcion(adiciones, conQueso, "aguacate");
    expect(conAmbas).toEqual(["queso", "aguacate"]);
    expect(alternarOpcion(adiciones, conAmbas, "queso")).toEqual(["aguacate"]);
  });

  it("no pasa del máximo del grupo", () => {
    const dos = ["queso", "aguacate"];
    expect(alternarOpcion(adiciones, dos, "tocineta")).toEqual(dos);
  });

  it("no toca las opciones de otros grupos", () => {
    expect(alternarOpcion(proteina, ["bien-asado", "pollo"], "carne")).toEqual([
      "bien-asado",
      "carne",
    ]);
  });
});

describe("seleccionInicial", () => {
  it("marca las opciones por defecto", () => {
    expect(seleccionInicial([proteina, termino])).toEqual(["pollo"]);
  });

  /**
   * Un grupo mal cargado —tres opciones por defecto con maxSelect 1— abriría el
   * modal ya inválido y con el error puesto antes de que nadie toque nada.
   */
  it("no marca más de las que caben en el grupo", () => {
    const malCargado: GrupoModificador = {
      ...proteina,
      options: proteina.options.map((o) => ({ ...o, isDefault: true })),
    };
    expect(seleccionInicial([malCargado])).toHaveLength(1);
  });

  it("no marca nada cuando ninguna es por defecto", () => {
    expect(seleccionInicial([termino, adiciones])).toEqual([]);
  });
});
