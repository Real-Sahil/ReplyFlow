// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from "eslint-plugin-storybook";

import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx,mjs}"],
    ignores: ["**/node_modules/**", "**/dist/**", "**/.astro/**"],
    languageOptions: {
      ecmaVersion: 2020,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          varsIgnorePattern: "^_",
          argsIgnorePattern: "^_",
        },
      ],
      "no-console": ["error", { allow: ["warn", "error"] }],
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/consistent-type-imports": "warn",
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    // Money is written through the business's own currency and market (src/components/atomic-crm/markets and
    // supabase/functions/_shared/moneyFormat.ts), never with a pound sign or "GBP" written into a screen. A
    // business can work in any currency, so a literal here would be wrong for it. The files below are UK-only by
    // nature (the VAT return), the defaults, or sample data.
    files: ["src/**/*.{ts,tsx}", "supabase/functions/**/*.ts"],
    ignores: [
      "**/*.test.{ts,tsx}",
      "src/components/atomic-crm/markets/**",
      "src/components/atomic-crm/finance/accountantPack.ts",
      "src/components/atomic-crm/root/defaultConfiguration.ts",
      "src/preview-main.tsx",
      "supabase/functions/_shared/moneyFormat.ts",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/£/]",
          message:
            "Do not write a pound sign into a screen. Use formatMoney, useMoney or currencySymbol (src/components/atomic-crm/markets).",
        },
        {
          selector: "TemplateElement[value.raw=/£/]",
          message:
            "Do not write a pound sign into a screen. Use formatMoney, useMoney or currencySymbol (src/components/atomic-crm/markets).",
        },
        {
          selector: "Literal[value='GBP']",
          message:
            "Do not write a currency code into a screen. A business chooses its own currency: use the markets helpers.",
        },
      ],
    },
  },
  {
    // Node scripts and Claude Code hooks. TypeScript files rely on the
    // compiler for undefined identifiers; plain JS needs no-undef back on.
    files: ["**/*.mjs"],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      "no-undef": "error",
    },
  },
  {
    files: [
      "src/components/admin/*.{ts,tsx}",
      "src/hooks/*.{ts,tsx}",
      "src/lib/*.{ts,tsx}",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "off",
    },
  },
  {
    files: ["src/components/ui/*.{ts,tsx}"],
    rules: {
      "react-refresh/only-export-components": "off",
      "@typescript-eslint/consistent-type-imports": "off",
    },
  },
  storybook.configs["flat/recommended"],
);
