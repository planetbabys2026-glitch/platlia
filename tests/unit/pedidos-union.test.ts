import { describe, expect, it } from "vitest";
import { puedenUnirse, type CuentaParaUnir } from "@/features/pedidos/reglas-union";

const cuenta = (id: string, extra: Partial<CuentaParaUnir> = {}): CuentaParaUnir => ({
  id,
  code: Number(id.replace(/\D/g, "")) || 1,
  status: "ABIERTA",
  paidCop: 0,
  facturada: false,
  esDomicilio: false,
  ...extra,
});

describe("unir cuentas en una sola", () => {
  it("dos cuentas vivas se unen en la elegida", () => {
    const r = puedenUnirse([cuenta("c1"), cuenta("c2")], "c1");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.destino.id).toBe("c1");
    expect(r.origenes.map((c) => c.id)).toEqual(["c2"]);
  });

  it("tres mesas del mismo grupo caen en una", () => {
    const r = puedenUnirse([cuenta("c1"), cuenta("c2"), cuenta("c3")], "c2");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.origenes.map((c) => c.id)).toEqual(["c1", "c3"]);
  });

  it("con una sola cuenta no hay nada que unir", () => {
    expect(puedenUnirse([cuenta("c1")], "c1")).toEqual({ ok: false, motivo: "MUY_POCAS" });
  });

  /**
   * El destino tiene que estar entre las elegidas: unir hacia una cuenta que no
   * está en la lista mueve renglones a un pedido que quien aprieta el botón no
   * está mirando.
   */
  it("el destino tiene que ser una de las elegidas", () => {
    const r = puedenUnirse([cuenta("c1"), cuenta("c2")], "c9");
    expect(r).toEqual({ ok: false, motivo: "DESTINO_AJENO" });
  });

  it("una cuenta cerrada no participa", () => {
    const r = puedenUnirse([cuenta("c1"), cuenta("c2", { status: "PAGADA" })], "c1");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe("CUENTA_CERRADA");
    expect(r.cuenta?.id).toBe("c2");
  });

  /**
   * Un pago está atado a un pedido y a una caja. Mudar los renglones dejaría el
   * pago cobrando una cuenta vacía y el arqueo de esa caja sin nada que lo
   * explique.
   */
  it("una cuenta con un pago recibido no se une", () => {
    const r = puedenUnirse([cuenta("c1"), cuenta("c2", { paidCop: 20_000 })], "c1");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe("CON_PAGOS");
  });

  it("una cuenta ya facturada ante la DIAN tampoco", () => {
    const r = puedenUnirse([cuenta("c1", { facturada: true }), cuenta("c2")], "c2");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe("FACTURADA");
  });

  it("los domicilios quedan afuera: cada uno tiene su dirección", () => {
    const r = puedenUnirse([cuenta("c1"), cuenta("c2", { esDomicilio: true })], "c1");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe("ES_DOMICILIO");
  });

  it("el destino también se valida, no solo las origen", () => {
    const r = puedenUnirse([cuenta("c1", { paidCop: 5_000 }), cuenta("c2")], "c1");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe("CON_PAGOS");
    expect(r.cuenta?.id).toBe("c1");
  });
});
