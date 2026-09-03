import { z } from "zod";
import { Role } from "@/generated/prisma/enums";
import { contrasenaFuerte as contrasena, correo, id } from "@/lib/validaciones";

// El correo y la contraseña se comparten con el registro (lib/validaciones.ts).
// Estaban copiados acá, y con la copia la política de contraseña se podía
// endurecer en el alta de un dueño y quedar floja en la de un cajero, que es
// justamente la cuenta que más manos toca.

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

export const mandarEnlaceSchema = z.object({
  membershipId: id,
});
