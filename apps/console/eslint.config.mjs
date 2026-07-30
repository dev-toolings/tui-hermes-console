import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

/**
 * Remplace `eslint-config-next`, parti avec Next.
 *
 * On garde ce qui attrapait de vrais défauts : les règles react-hooks (dont
 * `set-state-in-effect`, à l'origine des re-rendus en cascade) et les règles
 * typées de typescript-eslint.
 */
export default tseslint.config(
  { ignores: ["dist", "src-tauri", "src/_next-pages"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // `configs.flat.*` est la variante flat-config ; `configs["recommended-latest"]`
  // reste au format legacy (plugins en tableau) et fait échouer ESLint 9.
  reactHooks.configs.flat["recommended-latest"],
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);
