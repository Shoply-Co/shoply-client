import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      ".expo/**",
      "apps/*/.expo/**",
      "dist/**",
      "**/dist/**",
      "coverage/**",
      "**/src/shared/api/generated/**",
      ".prettierrc.cjs",
      "**/babel.config.js",
      "**/metro.config.js",
      "packages/config/prettier/**",
      "packages/design-system/.storybook/**",
      "packages/design-system/storybook/**"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          "argsIgnorePattern": "^_",
          "varsIgnorePattern": "^_"
        }
      ],
      "@typescript-eslint/no-explicit-any": "off"
    }
  }
);
