"use client";

import { useEffect, useState } from "react";
import { consultarDeuda } from "@/features/cartera/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCop } from "@/lib/money";

/**
 * Los tres campos del fiado: a nombre de quién, cómo se le ubica y dónde vive.
 *
 * **El teléfono va primero porque es la identidad.** Es lo que junta los pedidos
 * de la misma persona, así que en cuanto está completo se consulta: si ese número
 * ya debe, se precargan el nombre y la dirección guardados y se dice cuánto lleva.
 *
 * Decir la deuda previa no es un adorno. Fiarle a alguien sin saber cuánto lleva
 * es lo que convierte una cartera en un problema; y precargar el nombre evita que
 * la misma persona entre como "Andrés" una noche y "Andres G" la otra. No se
 * bloquea nada —cuánto se le fía a quién lo decide el negocio— pero no a ciegas.
 */
export function CamposDeCredito() {
  const [telefono, setTelefono] = useState("");
  const [nombre, setNombre] = useState("");
  const [direccion, setDireccion] = useState("");
  const [conocido, setConocido] = useState<{
    nombre: string;
    deudaCop: number;
    cuantos: number;
  } | null>(null);

  const digitos = telefono.replace(/\D/g, "");

  useEffect(() => {
    if (digitos.length < 7) {
      setConocido(null);
      return;
    }

    let vigente = true;
    void consultarDeuda(undefined, { telefono: digitos }).then((r) => {
      if (!vigente) return;
      if (r.ok && r.data) {
        const encontrado = r.data;
        setConocido({
          nombre: encontrado.nombre,
          deudaCop: encontrado.deudaCop,
          cuantos: encontrado.cuantos,
        });
        // Se precarga solo lo vacío: si quien cobra ya escribió un nombre, no se
        // lo pisamos por debajo mientras teclea.
        setNombre((actual) => actual || encontrado.nombre);
        setDireccion((actual) => actual || encontrado.direccion || "");
      } else {
        setConocido(null);
      }
    });

    return () => {
      vigente = false;
    };
  }, [digitos]);

  return (
    <div className="space-y-3 rounded-xl border border-warning/40 bg-warning/5 p-3">
      <p className="text-xs text-warning-soft">
        Fiar cierra el pedido pero no entra plata: queda como deuda en Cartera, a nombre
        de quien la autoriza.
      </p>

      <div className="space-y-1.5">
        <Label htmlFor="creditoTelefono">Teléfono</Label>
        <Input
          id="creditoTelefono"
          name="creditoTelefono"
          inputMode="tel"
          autoComplete="off"
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
          placeholder="300 123 4567"
          required
        />
        {conocido ? (
          <p className="text-xs text-foreground">
            Ya está en la cartera:{" "}
            <strong className="font-semibold">{conocido.nombre}</strong> · debe{" "}
            <span className="numeral font-bold text-warning-soft">
              {formatCop(conocido.deudaCop)}
            </span>{" "}
            en {conocido.cuantos} {conocido.cuantos === 1 ? "pedido" : "pedidos"}.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Es lo que junta los pedidos de la misma persona.
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="creditoNombre">A nombre de</Label>
        <Input
          id="creditoNombre"
          name="creditoNombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          autoComplete="off"
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="creditoDireccion">Dirección</Label>
        <Input
          id="creditoDireccion"
          name="creditoDireccion"
          value={direccion}
          onChange={(e) => setDireccion(e.target.value)}
          autoComplete="off"
          placeholder="Opcional"
        />
      </div>
    </div>
  );
}
