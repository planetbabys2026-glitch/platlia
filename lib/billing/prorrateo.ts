/**
 * Cálculo de Prorrateo para Adición de Sucursales (2ª Sucursal).
 *
 * Precios oficiales en COP:
 * - 1 Sucursal Mensual: $50.000 COP / mes
 * - 2 Sucursales Mensual: $80.000 COP / mes ($30.000 COP / mes por la 2ª sucursal)
 *
 * - 1 Sucursal 6 Meses (10% desc): $270.000 COP ($45.000 COP / mes)
 * - 2 Sucursales 6 Meses (10% desc): $432.000 COP ($72.000 COP / mes -> $162.000 COP adicionales por 6 meses)
 *
 * - 1 Sucursal 12 Meses (20% desc): $480.000 COP ($40.000 COP / mes)
 * - 2 Sucursales 12 Meses (20% desc): $768.000 COP ($64.000 COP / mes -> $288.000 COP adicionales por 12 meses)
 */

export type FrecuenciaPago = "mensual" | "6meses" | "12meses";

export type ParametrosProrrateo = {
  frecuencia: FrecuenciaPago;
  inicioPeriodo: Date;
  finPeriodo: Date;
  ahora?: Date;
};

export type ResultadoProrrateo = {
  montoProrrateoCop: number;
  diasRestantes: number;
  diasTotales: number;
  precioSiguienteCicloCop: number;
  costoAdicionalMensualCop: number;
};

export function calcularProrrateoSegundaSucursal({
  frecuencia,
  inicioPeriodo,
  finPeriodo,
  ahora = new Date(),
}: ParametrosProrrateo): ResultadoProrrateo {
  const MS_POR_DIA = 86_400_000;

  const inicioMs = inicioPeriodo.getTime();
  const finMs = finPeriodo.getTime();
  const ahoraMs = ahora.getTime();

  const diasTotales = Math.max(1, Math.ceil((finMs - inicioMs) / MS_POR_DIA));
  const diasRestantes = Math.max(0, Math.ceil((finMs - ahoraMs) / MS_POR_DIA));

  let costoAdicionalPeriodoCop = 30000;
  let precioSiguienteCicloCop = 80000;
  let costoAdicionalMensualCop = 30000;

  if (frecuencia === "6meses") {
    costoAdicionalPeriodoCop = 162000; // 432.000 - 270.000
    precioSiguienteCicloCop = 432000;
    costoAdicionalMensualCop = 27000;
  } else if (frecuencia === "12meses") {
    costoAdicionalPeriodoCop = 288000; // 768.000 - 480.000
    precioSiguienteCicloCop = 768000;
    costoAdicionalMensualCop = 24000;
  } else {
    // mensual
    costoAdicionalPeriodoCop = 30000; // 80.000 - 50.000
    precioSiguienteCicloCop = 80000;
    costoAdicionalMensualCop = 30000;
  }

  if (diasRestantes === 0) {
    return {
      montoProrrateoCop: 0,
      diasRestantes: 0,
      diasTotales,
      precioSiguienteCicloCop,
      costoAdicionalMensualCop,
    };
  }

  const proporcion = diasRestantes / diasTotales;
  const montoProrrateoCop = Math.round(costoAdicionalPeriodoCop * proporcion);

  return {
    montoProrrateoCop,
    diasRestantes,
    diasTotales,
    precioSiguienteCicloCop,
    costoAdicionalMensualCop,
  };
}
