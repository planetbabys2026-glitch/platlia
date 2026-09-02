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
      expect(["EFECTIVO", "BANCO", "OTRO", "CREDITO"]).toContain(cuentaDelMetodo(metodo));
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

  /**
   * El fiado tiene saldo propio y NO puede caer en efectivo ni en bancos: el
   * cierre pediría contar una plata que está en la calle. Tampoco en "otros",
   * que es lo que nunca va a entrar —un bono es consumo ya descontado—; un fiado
   * sí va a entrar, otro día, y por eso se mira aparte.
   */
  it("el crédito es su propio saldo, ni cajón ni banco ni 'otros'", () => {
    expect(cuentaDelMetodo(PaymentMethod.CREDITO)).toBe("CREDITO");
  });

  it("la tarjeta de crédito NO es fiado: esa plata la puso el banco", () => {
    expect(cuentaDelMetodo(PaymentMethod.TARJETA_CREDITO)).toBe("BANCO");
  });

  it("un valor que no está en el enum no ensucia un saldo real", () => {
    expect(cuentaDelMetodo("CRIPTO")).toBe("OTRO");
  });
});
