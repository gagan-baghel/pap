import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "convex/_generated/**"]),
  {
    rules: {
      // PAP's copy is lowercase and full of apostrophes ("you're in", "can't make it").
      // Escaping every one of them hurts readability and catches nothing real here.
      "react/no-unescaped-entities": "off",
      // `const { _id, ...rest } = doc` is how we copy a document without its system fields
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true }],
    },
  },
]);

export default eslintConfig;
