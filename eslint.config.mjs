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
    // El cliente Prisma base no aplica scoping de tenant: una query mal escrita
    // con él cruza empresas. En código de negocio siempre se usa
    // tenantDb(businessId). Los pocos módulos legítimamente cross-tenant (auth,
    // billing, superadmin) desactivan la regla en la línea del import, para que
    // cada excepción quede visible en el diff.
    files: ["app/**/*.{ts,tsx}", "features/**/*.{ts,tsx}"],
    rules: {
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
