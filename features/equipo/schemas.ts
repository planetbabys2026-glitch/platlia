import { z } from "zod";
import { Role } from "@/generated/prisma/enums";
import { id } from "@/lib/validaciones";

const correo = z.string().trim().toLowerCase().pipe(z.email("Escribí un correo válido."));

const contrasena = z
  .string()
  .min(8, "La contraseña necesita al menos 8 caracteres.")
  .max(200, "La contraseña es demasiado larga.");

/** El propietario no se reparte desde el formulario de alta: se asciende después. */
const rolAsignable = z.enum([
  Role.ADMINISTRADOR,
  Role.CAJERO,
  Role.MESERO,
  Role.COCINA,
  Role.PROPIETARIO,
]);

export const agregarEmpleadoSchema = z.object({
  name: z.string().trim().min(2, "Escribí el nombre.").max(120),
  email: correo,
  password: contrasena,
  role: rolAsignable,
});

export const cambiarRolSchema = z.object({
  membershipId: id,
  role: rolAsignable,
});

export const cambiarEstadoSchema = z.object({
  membershipId: id,
  active: z.preprocess((v) => v === "true" || v === true, z.boolean()),
});

export const restablecerContrasenaSchema = z.object({
  membershipId: id,
  password: contrasena,
});
