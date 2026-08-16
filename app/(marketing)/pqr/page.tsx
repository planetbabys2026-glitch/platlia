"use client";

import { useState } from "react";
import Link from "next/link";
import { Navbar } from "../components/navbar";
import { Footer } from "../components/footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { FileText, CheckCircle2, Clock, Hash, ArrowLeft } from "lucide-react";

export default function PqrPage() {
  const [enviando, setEnviando] = useState(false);
  const [radicado, setRadicado] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    tipoSolicitud: "Petición",
    tipoDoc: "CC",
    numDoc: "",
    nombre: "",
    correo: "",
    telefono: "",
    asunto: "",
    descripcion: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.numDoc || !formData.nombre || !formData.correo || !formData.descripcion) {
      toast.error("Por favor completa todos los campos obligatorios (*)");
      return;
    }

    setEnviando(true);
    setTimeout(() => {
      setEnviando(false);
      const codigoRadicado = `PQR-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;
      setRadicado(codigoRadicado);
      toast.success(`PQR radicada con éxito. Radicado: ${codigoRadicado}`);
    }, 1200);
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground selection:bg-brand selection:text-brand-foreground">
      <Navbar />

      <main className="flex-1 py-12 lg:py-20">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 space-y-10">
          
          {/* Volver */}
          <div>
            <Button asChild variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
              <Link href="/">
                <ArrowLeft className="size-4" />
                Volver al inicio
              </Link>
            </Button>
          </div>

          {/* Encabezado */}
          <div className="space-y-4 pb-8 border-b border-border text-center sm:text-left">
            <Badge variant="outline" className="border-brand-accent/40 bg-brand-accent/10 text-brand-accent px-3.5 py-1 text-xs font-medium">
              Atención al Consumidor · Colombia 🇨🇴
            </Badge>
            <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-foreground">
              Radicación de PQR (Peticiones, Quejas, Reclamos y Sugerencias)
            </h1>
            <p className="text-muted-foreground text-base sm:text-lg leading-relaxed max-w-3xl">
              Canal oficial de radicación de solicitudes en cumplimiento del Código de Procedimiento Administrativo (Ley 1755 de 2015) y el Estatuto del Consumidor (Ley 1480 de 2011) de Colombia.
            </p>
          </div>

          {/* Definiciones Legales de PQR */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            <div className="p-4 rounded-xl bg-card border border-border space-y-1">
              <span className="font-bold text-brand text-sm">Petición</span>
              <p className="text-muted-foreground">Solicitud formal de información, documentación o prestación de un servicio.</p>
            </div>
            <div className="p-4 rounded-xl bg-card border border-border space-y-1">
              <span className="font-bold text-warning-soft text-sm">Queja</span>
              <p className="text-muted-foreground">Manifiesto de inconformidad por la conducta o atención recibida del personal.</p>
            </div>
            <div className="p-4 rounded-xl bg-card border border-border space-y-1">
              <span className="font-bold text-destructive-soft text-sm">Reclamo</span>
              <p className="text-muted-foreground">Exigencia de corrección por fallas o cobros indebidos en el servicio contratado.</p>
            </div>
            <div className="p-4 rounded-xl bg-card border border-border space-y-1">
              <span className="font-bold text-brand-accent text-sm">Sugerencia</span>
              <p className="text-muted-foreground">Recomendación o propuesta orientada a mejorar la calidad del software o servicio.</p>
            </div>
          </div>

          {/* Formulario Principal de Radicación */}
          <div className="rounded-3xl border border-border bg-card p-6 sm:p-10 shadow-sm">
            {radicado ? (
              <div className="py-12 text-center space-y-6">
                <div className="size-16 rounded-full bg-success/60 text-success-soft flex items-center justify-center mx-auto">
                  <CheckCircle2 className="size-8" />
                </div>

                <div className="space-y-2">
                  <h2 className="text-2xl sm:text-3xl font-bold text-foreground">¡Solicitud Radicada Exitosamente!</h2>
                  <p className="text-muted-foreground text-sm">
                    Guarda tu número de radicado oficial para consultar el estado de tu trámite:
                  </p>
                  <div className="inline-flex items-center gap-2 bg-brand/10 border border-brand/30 text-brand px-6 py-3 rounded-2xl font-mono text-2xl font-bold">
                    <Hash className="size-6" />
                    <span>{radicado}</span>
                  </div>
                </div>

                <div className="max-w-lg mx-auto p-5 rounded-2xl bg-muted text-xs text-muted-foreground space-y-2 text-left border border-border">
                  <div className="flex items-center gap-2 font-semibold text-foreground text-sm">
                    <Clock className="size-4 text-brand shrink-0" />
                    <span>Términos Legales de Respuesta (Ley 1755 de 2015):</span>
                  </div>
                  <p className="leading-relaxed">
                    De conformidad con la legislación colombiana, PLATLIA S.A.S. emitirá respuesta motivada y completa a tu solicitud dentro del término máximo de <strong>quince (15) días hábiles</strong> siguientes a su radicación al correo electrónico <strong>{formData.correo}</strong>.
                  </p>
                </div>

                <Button
                  onClick={() => {
                    setRadicado(null);
                    setFormData({
                      tipoSolicitud: "Petición",
                      tipoDoc: "CC",
                      numDoc: "",
                      nombre: "",
                      correo: "",
                      telefono: "",
                      asunto: "",
                      descripcion: "",
                    });
                  }}
                  variant="outline"
                  className="mt-4"
                >
                  Radicar una nueva solicitud
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                
                <div className="border-b border-border pb-4">
                  <h3 className="text-lg font-bold text-foreground">Formulario Oficial de Radicación</h3>
                  <p className="text-xs text-muted-foreground">Todos los campos marcados con (*) son obligatorios para otorgarle validez jurídica al trámite.</p>
                </div>

                {/* Tipo de Solicitud y Asunto */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="tipoSolicitud" className="text-xs font-semibold">
                      Tipo de solicitud *
                    </Label>
                    <Select
                      value={formData.tipoSolicitud}
                      onValueChange={(val) => setFormData({ ...formData, tipoSolicitud: val })}
                    >
                      <SelectTrigger id="tipoSolicitud" className="w-full">
                        <SelectValue placeholder="Selecciona el tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Petición">Petición (Solicitud de información o servicio)</SelectItem>
                        <SelectItem value="Queja">Queja (Inconformidad con la atención)</SelectItem>
                        <SelectItem value="Reclamo">Reclamo (Inconformidad con la prestación del servicio)</SelectItem>
                        <SelectItem value="Sugerencia">Sugerencia (Propuesta de mejora)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="asunto" className="text-xs font-semibold">
                      Asunto o título de la solicitud *
                    </Label>
                    <Input
                      id="asunto"
                      required
                      placeholder="Ej. Requerimiento sobre facturación de mi suscripción"
                      value={formData.asunto}
                      onChange={(e) => setFormData({ ...formData, asunto: e.target.value })}
                    />
                  </div>
                </div>

                {/* Documento de Identificación */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="tipoDoc" className="text-xs font-semibold">
                      Tipo de Documento *
                    </Label>
                    <Select
                      value={formData.tipoDoc}
                      onValueChange={(val) => setFormData({ ...formData, tipoDoc: val })}
                    >
                      <SelectTrigger id="tipoDoc" className="w-full">
                        <SelectValue placeholder="Tipo de Doc" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CC">Cédula de Ciudadanía (CC)</SelectItem>
                        <SelectItem value="NIT">NIT de Empresa</SelectItem>
                        <SelectItem value="CE">Cédula de Extranjería (CE)</SelectItem>
                        <SelectItem value="Pasaporte">Pasaporte</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="numDoc" className="text-xs font-semibold">
                      Número de Documento / NIT *
                    </Label>
                    <Input
                      id="numDoc"
                      required
                      placeholder="Ej. 901.234.567-8 o 1.020.304.506"
                      value={formData.numDoc}
                      onChange={(e) => setFormData({ ...formData, numDoc: e.target.value })}
                    />
                  </div>
                </div>

                {/* Nombre y Contacto */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="nombrePqr" className="text-xs font-semibold">
                      Nombre completo o Razón Social *
                    </Label>
                    <Input
                      id="nombrePqr"
                      required
                      placeholder="Ej. Restaurante La Candelaria S.A.S."
                      value={formData.nombre}
                      onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="telefonoPqr" className="text-xs font-semibold">
                      Teléfono de contacto
                    </Label>
                    <Input
                      id="telefonoPqr"
                      placeholder="Ej. 300 123 4567"
                      value={formData.telefono}
                      onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="correoPqr" className="text-xs font-semibold">
                    Correo electrónico para notificaciones oficiales *
                  </Label>
                  <Input
                    id="correoPqr"
                    type="email"
                    required
                    placeholder="notificaciones@turestaurante.com"
                    value={formData.correo}
                    onChange={(e) => setFormData({ ...formData, correo: e.target.value })}
                  />
                  <p className="text-rotulo text-muted-foreground">
                    A este buzón se remitirá el acto administrativo o respuesta motivada formal.
                  </p>
                </div>

                {/* Descripción Detallada */}
                <div className="space-y-2">
                  <Label htmlFor="descripcionPqr" className="text-xs font-semibold">
                    Descripción clara de los hechos y pretensión *
                  </Label>
                  <textarea
                    id="descripcionPqr"
                    required
                    rows={6}
                    className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    placeholder="Relata cronológicamente los hechos, fechas, número de factura o transacción y la solución esperada..."
                    value={formData.descripcion}
                    onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                  />
                </div>

                {/* Pie del Formulario y Botón */}
                <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-border">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="size-4 text-brand shrink-0" />
                    <span>Plazo de respuesta: 15 días hábiles (Ley 1755).</span>
                  </div>

                  <Button
                    type="submit"
                    disabled={enviando}
                    className="w-full sm:w-auto bg-brand text-brand-foreground hover:bg-brand/90 font-semibold px-8 h-11"
                  >
                    {enviando ? (
                      <span>Generando número de radicado...</span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <FileText className="size-4" />
                        Radicar PQR Oficial
                      </span>
                    )}
                  </Button>
                </div>

              </form>
            )}
          </div>

        </div>
      </main>

      <Footer />
    </div>
  );
}
