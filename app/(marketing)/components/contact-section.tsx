"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
    <section id="contacto" className="py-24 bg-[var(--tinta)] relative border-t border-dashed border-[var(--linea-30)]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
          
          {/* Información Comercial */}
          <div className="lg:col-span-5 space-y-6">
            <span className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
              — Asesoría Gastronómica Directa
            </span>
            <h2 className="font-display font-black text-4xl sm:text-5xl uppercase tracking-tight text-[var(--papel)] leading-[0.94]">
              Hablemos de tu restaurante o bar
            </h2>
            <p className="text-[var(--muted)] text-base leading-relaxed">
              ¿Tienes dudas sobre cómo implementar Platlia en tu local o necesitas una demostración guiada para tu equipo? Déjanos un mensaje y te responderemos en menos de 2 horas.
            </p>

            <div className="space-y-4 pt-6 border-t border-dashed border-[var(--linea-30)]">
              <div className="flex items-start gap-3.5 text-sm">
                <div className="size-10 rounded-xl bg-[var(--panel-2)] border border-[var(--linea-30)] text-[var(--brasa)] flex items-center justify-center shrink-0">
                  <Phone className="size-4.5" />
                </div>
                <div>
                  <p className="font-mono text-xs uppercase tracking-wider text-[var(--muted)]">WhatsApp & Línea Comercial</p>
                  <p className="font-bold text-[var(--papel)] text-base">+57 (310) 574-2111</p>
                </div>
              </div>

              <div className="flex items-start gap-3.5 text-sm">
                <div className="size-10 rounded-xl bg-[var(--panel-2)] border border-[var(--linea-30)] text-[var(--brasa)] flex items-center justify-center shrink-0">
                  <Mail className="size-4.5" />
                </div>
                <div>
                  <p className="font-mono text-xs uppercase tracking-wider text-[var(--muted)]">Correo de Ventas & Soporte</p>
                  <p className="font-bold text-[var(--papel)] text-base">contacto@platlia.com</p>
                </div>
              </div>

              <div className="flex items-start gap-3.5 text-sm">
                <div className="size-10 rounded-xl bg-[var(--panel-2)] border border-[var(--linea-30)] text-[var(--brasa)] flex items-center justify-center shrink-0">
                  <MapPin className="size-4.5" />
                </div>
                <div>
                  <p className="font-mono text-xs uppercase tracking-wider text-[var(--muted)]">Cobertura Nacional</p>
                  <p className="font-bold text-[var(--papel)] text-base">Bogotá, Medellín, Cali, Barranquilla y toda Colombia</p>
                </div>
              </div>

              <div className="flex items-start gap-3.5 text-sm">
                <div className="size-10 rounded-xl bg-[var(--panel-2)] border border-[var(--linea-30)] text-[var(--brasa)] flex items-center justify-center shrink-0">
                  <Clock className="size-4.5" />
                </div>
                <div>
                  <p className="font-mono text-xs uppercase tracking-wider text-[var(--muted)]">Horario de Atención</p>
                  <p className="font-bold text-[var(--papel)] text-base">Lunes a Domingo: 8:00 a.m. – 10:00 p.m.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Formulario */}
          <div className="lg:col-span-7">
            <div className="rounded-2xl border border-[var(--linea-16)] bg-[var(--panel-bg)] p-8 sm:p-10 shadow-2xl">
              {enviado ? (
                <div className="text-center py-12 space-y-4">
                  <div className="size-16 rounded-full bg-[var(--papel)] text-[var(--tinta)] flex items-center justify-center mx-auto shadow-lg">
                    <CheckCircle2 className="size-8 stroke-[2.5]" />
                  </div>
                  <h3 className="font-display font-black text-3xl uppercase text-[var(--papel)]">
                    ¡Mensaje recibido con éxito!
                  </h3>
                  <p className="text-[var(--muted)] text-sm max-w-md mx-auto">
                    Gracias por tu interés en Platlia. Nuestro equipo de soporte comercial se pondrá en contacto contigo muy pronto.
                  </p>
                  <Button
                    type="button"
                    onClick={() => {
                      setEnviado(false);
                      setFormData({ nombre: "", negocio: "", correo: "", telefono: "", ciudad: "", mensaje: "" });
                    }}
                    variant="outline"
                    className="border-[var(--linea-30)] text-[var(--papel)] hover:bg-[var(--panel-2)] mt-4"
                  >
                    Enviar otro mensaje
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="contact-nombre" className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-[var(--muted)] font-semibold">
                        Tu nombre *
                      </Label>
                      <Input
                        id="contact-nombre"
                        required
                        placeholder="Ej. Carlos Restrepo"
                        value={formData.nombre}
                        onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                        className="bg-[var(--panel-2)] border-[var(--linea-30)] text-[var(--papel)]"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="contact-negocio" className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-[var(--muted)] font-semibold">
                        Nombre del restaurante / bar
                      </Label>
                      <Input
                        id="contact-negocio"
                        placeholder="Ej. Hamburguesas La Brasa"
                        value={formData.negocio}
                        onChange={(e) => setFormData({ ...formData, negocio: e.target.value })}
                        className="bg-[var(--panel-2)] border-[var(--linea-30)] text-[var(--papel)]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="contact-correo" className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-[var(--muted)] font-semibold">
                        Correo electrónico *
                      </Label>
                      <Input
                        id="contact-correo"
                        type="email"
                        required
                        placeholder="carlos@mitiendadecomidas.com"
                        value={formData.correo}
                        onChange={(e) => setFormData({ ...formData, correo: e.target.value })}
                        className="bg-[var(--panel-2)] border-[var(--linea-30)] text-[var(--papel)]"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="contact-telefono" className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-[var(--muted)] font-semibold">
                        Celular / WhatsApp *
                      </Label>
                      <Input
                        id="contact-telefono"
                        type="tel"
                        required
                        placeholder="310 123 4567"
                        value={formData.telefono}
                        onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                        className="bg-[var(--panel-2)] border-[var(--linea-30)] text-[var(--papel)]"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="contact-ciudad" className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-[var(--muted)] font-semibold">
                      Ciudad o municipio
                    </Label>
                    <Input
                      id="contact-ciudad"
                      placeholder="Ej. Medellín / Envigado"
                      value={formData.ciudad}
                      onChange={(e) => setFormData({ ...formData, ciudad: e.target.value })}
                      className="bg-[var(--panel-2)] border-[var(--linea-30)] text-[var(--papel)]"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="contact-mensaje" className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-[var(--muted)] font-semibold">
                      ¿Cómo te podemos ayudar?
                    </Label>
                    <textarea
                      id="contact-mensaje"
                      rows={4}
                      placeholder="Cuéntanos cuántas mesas tienes, si manejas domicilios o si deseas asesoría para migrar desde otro software..."
                      value={formData.mensaje}
                      onChange={(e) => setFormData({ ...formData, mensaje: e.target.value })}
                      className="w-full rounded-lg border border-[var(--linea-30)] bg-[var(--panel-2)] px-3.5 py-2.5 text-sm text-[var(--papel)] outline-none focus:border-[var(--brasa)] focus:ring-2 focus:ring-[var(--brasa)]/30 resize-none"
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={enviando}
                    className="w-full bg-[var(--brasa)] text-[var(--tinta)] font-bold hover:bg-[var(--brasa-hover)] h-12 text-base transition-all"
                  >
                    {enviando ? "Enviando mensaje…" : (
                      <span className="flex items-center justify-center gap-2">
                        <Send className="size-4" />
                        <span>Enviar mensaje a ventas</span>
                      </span>
                    )}
                  </Button>
                </form>
              )}
            </div>
          </div>

        </div>

      </div>
    </section>
  );
}
