"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Send, CheckCircle2, Phone, Mail, MapPin, Clock } from "lucide-react";

export function ContactSection() {
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [formData, setFormData] = useState({
    nombre: "",
    negocio: "",
    correo: "",
    telefono: "",
    ciudad: "",
    mensaje: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nombre || !formData.correo || !formData.telefono) {
      toast.error("Por favor completa los campos obligatorios (*)");
      return;
    }

    setEnviando(true);
    // Simular envío de formulario comercial
    setTimeout(() => {
      setEnviando(false);
      setEnviado(true);
      toast.success("¡Mensaje enviado con éxito! Un asesor comercial se comunicará contigo.");
    }, 1200);
  };

  return (
    <section id="contacto" className="py-20 bg-background relative">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
          
          {/* Información Comercial */}
          <div className="lg:col-span-5 space-y-6">
            <Badge variant="outline" className="border-brand/40 bg-brand/10 text-brand dark:text-[#3E9EA2] px-3 py-1 text-xs sm:text-sm font-medium">
              Contacto Comercial
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
              Hablemos de tu restaurante o bar
            </h2>
            <p className="text-muted-foreground text-base leading-relaxed">
              ¿Tienes dudas sobre cómo implementar Platlia en tu local o necesitas una demostración guiada para tu equipo? Completa el formulario y te responderemos en menos de 2 horas.
            </p>

            <div className="space-y-4 pt-4 border-t border-border">
              <div className="flex items-start gap-3 text-sm">
                <div className="size-9 rounded-lg bg-brand/10 text-brand dark:text-[#3E9EA2] flex items-center justify-center shrink-0 mt-0.5">
                  <Phone className="size-4.5" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">WhatsApp & Línea Comercial</p>
                  <p className="text-muted-foreground">+57 (300) 123-4567</p>
                </div>
              </div>

              <div className="flex items-start gap-3 text-sm">
                <div className="size-9 rounded-lg bg-brand/10 text-brand dark:text-[#3E9EA2] flex items-center justify-center shrink-0 mt-0.5">
                  <Mail className="size-4.5" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">Correo de Ventas & Soporte</p>
                  <p className="text-muted-foreground">contacto@platlia.com</p>
                </div>
              </div>

              <div className="flex items-start gap-3 text-sm">
                <div className="size-9 rounded-lg bg-brand/10 text-brand dark:text-[#3E9EA2] flex items-center justify-center shrink-0 mt-0.5">
                  <MapPin className="size-4.5" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">Cobertura Nacional</p>
                  <p className="text-muted-foreground">Bogotá, Medellín, Cali, Barranquilla, Bucaramanga y toda Colombia</p>
                </div>
              </div>

              <div className="flex items-start gap-3 text-sm">
                <div className="size-9 rounded-lg bg-brand/10 text-brand dark:text-[#3E9EA2] flex items-center justify-center shrink-0 mt-0.5">
                  <Clock className="size-4.5" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">Horario de Atención Comercial</p>
                  <p className="text-muted-foreground">Lunes a Sábado: 8:00 a.m. – 8:00 p.m.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Formulario */}
          <div className="lg:col-span-7">
            <div className="rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-sm">
              {enviado ? (
                <div className="py-12 text-center space-y-4">
                  <div className="size-16 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="size-8" />
                  </div>
                  <h3 className="text-2xl font-bold text-foreground">¡Solicitud recibida con éxito!</h3>
                  <p className="text-muted-foreground text-sm max-w-md mx-auto">
                    Gracias por escribirnos, <strong>{formData.nombre}</strong>. Un especialista en gastronomía se pondrá en contacto contigo al número <strong>{formData.telefono}</strong> o correo <strong>{formData.correo}</strong>.
                  </p>
                  <Button
                    onClick={() => {
                      setEnviado(false);
                      setFormData({ nombre: "", negocio: "", correo: "", telefono: "", ciudad: "", mensaje: "" });
                    }}
                    variant="outline"
                    className="mt-4"
                  >
                    Enviar otra consulta
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="nombre" className="text-xs font-semibold">
                        Nombre completo *
                      </Label>
                      <Input
                        id="nombre"
                        required
                        placeholder="Ej. Alejandro Gómez"
                        value={formData.nombre}
                        onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="negocio" className="text-xs font-semibold">
                        Nombre del restaurante / bar
                      </Label>
                      <Input
                        id="negocio"
                        placeholder="Ej. Bar El Destilería"
                        value={formData.negocio}
                        onChange={(e) => setFormData({ ...formData, negocio: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="correo" className="text-xs font-semibold">
                        Correo electrónico *
                      </Label>
                      <Input
                        id="correo"
                        type="email"
                        required
                        placeholder="ejemplo@restaurante.com"
                        value={formData.correo}
                        onChange={(e) => setFormData({ ...formData, correo: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="telefono" className="text-xs font-semibold">
                        Teléfono / WhatsApp *
                      </Label>
                      <Input
                        id="telefono"
                        required
                        placeholder="Ej. 300 123 4567"
                        value={formData.telefono}
                        onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="ciudad" className="text-xs font-semibold">
                      Ciudad o Municipio
                    </Label>
                    <Input
                      id="ciudad"
                      placeholder="Ej. Medellín, Antioquia"
                      value={formData.ciudad}
                      onChange={(e) => setFormData({ ...formData, ciudad: e.target.value })}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="mensaje" className="text-xs font-semibold">
                      ¿En qué podemos ayudarte? (Opcional)
                    </Label>
                    <textarea
                      id="mensaje"
                      rows={4}
                      className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      placeholder="Cuéntanos cuántas mesas o sucursales tienes..."
                      value={formData.mensaje}
                      onChange={(e) => setFormData({ ...formData, mensaje: e.target.value })}
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={enviando}
                    className="w-full bg-brand text-brand-foreground hover:bg-brand/90 font-semibold h-11"
                  >
                    {enviando ? (
                      <span>Enviando mensaje...</span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <Send className="size-4" />
                        Enviar consulta comercial
                      </span>
                    )}
                  </Button>
                  <p className="text-[11px] text-muted-foreground text-center">
                    Al enviar este formulario aceptas nuestras políticas de Tratamiento de Datos (Habeas Data).
                  </p>
                </form>
              )}
            </div>
          </div>

        </div>

      </div>
    </section>
  );
}
