"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Aviso } from "@/lib/avisos";
import {
  engancharSonido,
  guardarPreferenciaSonido,
  leerPreferenciaSonido,
  pitar,
} from "@/features/avisos/sonido";

/**
 * La conexión en vivo del shell: pedidos que entran y contadores del menú.
 *
 * Vive acá y no en cada pantalla porque el problema que resuelve es justamente
 * ese: hasta ahora el aviso moría con la pantalla, y quien estaba en `/caja` no
 * se enteraba de una comanda. Como el proveedor se monta dentro de `AppShell`,
 * que a su vez vive en el layout de `(app)`, la conexión atraviesa las
 * navegaciones del cliente sin volver a abrirse.
 *
 * Nunca llama `router.refresh()`. Es a propósito: está montado en TODAS las
 * pantallas, y refrescar el árbol del servidor con cada evento haría
 * re-renderizar la pantalla que la persona está usando en ese momento —cobrando,
 * tomando un pedido— por algo que pasó en otra mesa. Los contadores vienen
 * hechos desde el stream y se pintan solos.
 */

const MAXIMO_EN_CAMPANA = 20;

type EstadoAvisos = {
  cocina: number;
  domicilios: number;
  /** Cuentas esperando cobro. Antes vivía en la píldora de Caja. */
  caja: number;
  avisos: Aviso[];
  noLeidos: number;
  sonido: boolean;
  alternarSonido: () => void;
  marcarLeidos: () => void;
};

const ContextoAvisos = createContext<EstadoAvisos | null>(null);

export function useAvisos(): EstadoAvisos {
  const contexto = useContext(ContextoAvisos);
  if (!contexto) {
    throw new Error("useAvisos necesita estar dentro de <ProveedorAvisos>.");
  }
  return contexto;
}

export function ProveedorAvisos({
  cocinaInicial = 0,
  domiciliosInicial = 0,
  cajaInicial = 0,
  children,
}: {
  cocinaInicial?: number;
  domiciliosInicial?: number;
  cajaInicial?: number;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [cocina, setCocina] = useState(cocinaInicial);
  const [domicilios, setDomicilios] = useState(domiciliosInicial);
  const [caja, setCaja] = useState(cajaInicial);
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [noLeidos, setNoLeidos] = useState(0);
  // Arranca en `true` y se corrige en el efecto: leer localStorage durante el
  // render daría distinto en servidor y cliente, y eso es un error de hidratación.
  const [sonido, setSonido] = useState(true);

  const sonidoRef = useRef(true);
  const vistos = useRef<Set<string>>(new Set());

  useEffect(() => {
    const guardado = leerPreferenciaSonido();
    sonidoRef.current = guardado;
    setSonido(guardado);
    engancharSonido();
  }, []);

  // La ref es la fuente de verdad y el estado solo la refleja para pintar. Meter
  // el cambio dentro del updater de `setSonido` haría que en modo estricto —que
  // llama al updater dos veces— la ref quedara al revés que la pantalla.
  const alternarSonido = useCallback(() => {
    const nuevo = !sonidoRef.current;
    sonidoRef.current = nuevo;
    guardarPreferenciaSonido(nuevo);
    setSonido(nuevo);
  }, []);

  const marcarLeidos = useCallback(() => setNoLeidos(0), []);

  const recibirAviso = useCallback(
    (aviso: Aviso) => {
      if (!aviso?.id || vistos.current.has(aviso.id)) return;
      vistos.current.add(aviso.id);

      setAvisos((previos) => [aviso, ...previos].slice(0, MAXIMO_EN_CAMPANA));
      setNoLeidos((n) => n + 1);

      toast(aviso.titulo, {
        id: aviso.id,
        description: aviso.detalle,
        action: { label: "Ver", onClick: () => router.push(aviso.href) },
      });

      if (sonidoRef.current) pitar();
    },
    [router],
  );

  // El manejador se guarda en una ref para que el efecto de la conexión no
  // dependa de él: si dependiera, cualquier cambio de identidad cerraría y
  // reabriría el EventSource, y con él se perderían los avisos de esos
  // milisegundos.
  const recibirAvisoRef = useRef(recibirAviso);
  useEffect(() => {
    recibirAvisoRef.current = recibirAviso;
  }, [recibirAviso]);

  useEffect(() => {
    let cerrado = false;
    let fuente: EventSource | null = null;
    let intentos = 0;
    let reintento: ReturnType<typeof setTimeout> | null = null;

    const conectar = () => {
      if (cerrado) return;

      fuente = new EventSource("/api/avisos/stream");

      fuente.onopen = () => {
        intentos = 0;
      };

      fuente.onmessage = (evento) => {
        try {
          const dato = JSON.parse(evento.data);
          if (dato.tipo === "contadores") {
            setCocina(Number(dato.cocina) || 0);
            setDomicilios(Number(dato.domicilios) || 0);
            setCaja(Number(dato.caja) || 0);
          } else if (dato.tipo === "aviso" && dato.aviso) {
            recibirAvisoRef.current(dato.aviso as Aviso);
          }
        } catch {
          // Un mensaje ilegible no puede tumbar la conexión.
        }
      };

      fuente.onerror = () => {
        if (cerrado) return;
        // Con `CONNECTING` el navegador ya está reintentando solo. `CLOSED` es
        // lo que deja el servidor cuando responde 401 o cierra de verdad, y de
        // ahí EventSource no vuelve: hay que rearmarlo a mano. Sin esto, una
        // caída de red dejaba el shell mudo hasta que alguien recargara.
        if (fuente?.readyState !== EventSource.CLOSED) return;

        fuente.close();
        fuente = null;
        const espera = Math.min(30_000, 1_000 * 2 ** intentos);
        intentos += 1;
        reintento = setTimeout(conectar, espera);
      };
    };

    conectar();

    return () => {
      cerrado = true;
      if (reintento) clearTimeout(reintento);
      fuente?.close();
    };
  }, []);

  return (
    <ContextoAvisos.Provider
      value={{ cocina, domicilios, caja, avisos, noLeidos, sonido, alternarSonido, marcarLeidos }}
    >
      {children}
    </ContextoAvisos.Provider>
  );
}
