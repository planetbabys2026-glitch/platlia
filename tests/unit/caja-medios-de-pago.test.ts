import { describe, expect, it } from "vitest";
import { PaymentMethod } from "@/generated/prisma/enums";
import { cuentaDelMetodo } from "@/features/caja/medios-de-pago";

/**
 * El arqueo cuadra dos saldos, y de qué lado cae cada medio de pago es lo que
 * decide si la noche da faltante. Un medio nuevo sin clasificar tiene que hacer
 * fallar este archivo, no aparecer callado en el saldo equivocado.
 */
describe("de qué saldo es cada medio de pago", () => {
  it("clasifica TODOS los medios del enum: ninguno cae por descarte", () => {
    for (const metodo of Object.values(PaymentMethod)) {
      expect(["EFECTIVO", "BANCO", "OTRO"]).toContain(cuentaDelMetodo(metodo));
    }
  });

  it("solo el efectivo se cuenta en el cajón", () => {
    expect(cuentaDelMetodo(PaymentMethod.EFECTIVO)).toBe("EFECTIVO");
  });

  it("el datáfono y las billeteras van al banco", () => {
    expect(cuentaDelMetodo(PaymentMethod.TARJETA_DEBITO)).toBe("BANCO");
    expect(cuentaDelMetodo(PaymentMethod.TARJETA_CREDITO)).toBe("BANCO");
    expect(cuentaDelMetodo(PaymentMethod.NEQUI)).toBe("BANCO");
    expect(cuentaDelMetodo(PaymentMethod.DAVIPLATA)).toBe("BANCO");
    expect(cuentaDelMetodo(PaymentMethod.TRANSFERENCIA)).toBe("BANCO");
  });

  it("el bono y 'otro' no suman a ningún saldo: no hay plata que contar", () => {
    expect(cuentaDelMetodo(PaymentMethod.BONO)).toBe("OTRO");
    expect(cuentaDelMetodo(PaymentMethod.OTRO)).toBe("OTRO");
  });

  it("un valor que no está en el enum no ensucia un saldo real", () => {
    expect(cuentaDelMetodo("CRIPTO")).toBe("OTRO");
  });
});
