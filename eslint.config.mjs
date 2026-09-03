import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

// eslint-config-next 15.x publica configs estilo eslintrc (index.js,
// core-web-vitals.js, typescript.js), no flat config. FlatCompat los puentea.
const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "generated/**",
      "next-env.d.ts",
      "test-results/**",
      "playwright-report/**",
    ],
  },

  ...compat.extends("next/core-web-vitals", "next/typescript"),

  {
    // SQL crudo: solo la forma parametrizada.
    //
    // Hoy hay exactamente dos consultas crudas en el producto y las dos usan
    // plantilla etiquetada, que es lo que hace que los valores viajen como
    // parámetros y no pegados al texto de la consulta. O sea que no hay nada
    // que arreglar: lo que hay que impedir es que vuelva.
    //
    // Las tres formas prohibidas son las que aceptan una cadena armada a mano.
    // Como con `@/lib/db/root`, la salida existe y es visible: desactivar la
    // regla en la línea y explicar por qué, para que la excepción aparezca en
    // el diff en vez de pasar desapercibida.
    files: ["app/**/*.{ts,tsx}", "features/**/*.{ts,tsx}", "lib/**/*.ts", "scripts/**/*.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "MemberExpression[property.name=/^\\$(queryRawUnsafe|executeRawUnsafe)$/]",
          message:
            "$queryRawUnsafe y $executeRawUnsafe reciben la consulta como cadena: lo que se interpole ahí se ejecuta. Usá la plantilla etiquetada ($queryRaw`...`), que manda los valores como parámetros.",
        },
        {
          selector: "MemberExpression[object.name='Prisma'][property.name='raw']",
          message:
            "Prisma.raw inserta texto sin escapar en la consulta. Si es un fragmento fijo, escribilo en la plantilla; si depende de un valor, va como parámetro.",
        },
      ],
    },
  },

  {
    // El cliente Prisma base no aplica scoping de tenant: una query mal escrita
    // con él cruza empresas. En código de negocio siempre se usa
    // tenantDb(businessId). Los pocos módulos legítimamente cross-tenant (auth,
    // billing, superadmin) desactivan la regla en la línea del import, para que
    // cada excepción quede visible en el diff.
    files: ["app/**/*.{ts,tsx}", "features/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"],
    rules: {
      "@next/next/no-img-element": "off",
      "react-hooks/set-state-in-effect": "off",
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/db/root",
              message:
                "Usá tenantDb(businessId) desde @/lib/db/tenant. Si de verdad necesitás el cliente base (auth, billing, superadmin), desactivá la regla en esa línea y explicá por qué.",
            },
          ],
        },
      ],
    },
  },
];

export default eslintConfig;
