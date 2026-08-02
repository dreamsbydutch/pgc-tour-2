import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.vercel/**",
      "**/.output/**",
      "**/.nitro/**",
      "**/.github/**",
      "**/.vscode/**",
      "**/docs/**",
      "**/build/**",
      "**/coverage/**",
      "**/convex/_generated/**",
      "**/routeTree.gen.ts",
      "**/*.config.js",
      "**/*.config.ts",
    ],
  },
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        // Node.js globals
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        module: "readonly",
        require: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        // Browser globals
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        localStorage: "readonly",
        sessionStorage: "readonly",
        fetch: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        Event: "readonly",
        HTMLElement: "readonly",
        HTMLDivElement: "readonly",
        HTMLButtonElement: "readonly",
        HTMLAnchorElement: "readonly",
        HTMLParagraphElement: "readonly",
        HTMLHeadingElement: "readonly",
        HTMLTableElement: "readonly",
        HTMLTableSectionElement: "readonly",
        HTMLTableRowElement: "readonly",
        HTMLTableCellElement: "readonly",
        HTMLTableCaptionElement: "readonly",
        // Service Worker globals
        self: "readonly",
        caches: "readonly",
        clients: "readonly",
        // React
        React: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
      react,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...tseslint.configs.recommended.rules,
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,

      // TypeScript specific
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],

      // React specific
      "react/react-in-jsx-scope": "off", // Not needed in React 19
      "react/prop-types": "off", // Using TypeScript for prop validation
      "react/no-unescaped-entities": "off",
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/purity": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/preserve-manual-memoization": "off",

      // General best practices
      "no-console": "off", // Allow console for now
      "no-debugger": "warn",
      "prefer-const": "warn",
      "no-var": "error",
      "no-undef": "off", // TypeScript handles this
      "no-empty-pattern": "off",
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib", "@/lib/index", "@/lib/index.ts"],
              message:
                "Import the specific constants, rules, types, or utility module instead of the legacy lib barrel.",
            },
            {
              group: ["@/components", "@/components/*", "@/components/**"],
              message:
                "Import components through @/ui, @/displays, @/widgets, or @/facilitators.",
            },
          ],
        },
      ],
    },
    settings: {
      react: {
        version: "detect",
      },
    },
  },
  {
    files: ["src/components/**/*.{ts,tsx}", "src/routes/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/convex",
              importNames: [
                "useAction",
                "useMutation",
                "usePaginatedQuery",
                "useQuery",
              ],
              message:
                "Routes and components receive data and actions from src/hooks/.",
            },
            {
              name: "convex/react",
              importNames: [
                "useAction",
                "useMutation",
                "usePaginatedQuery",
                "useQuery",
              ],
              message:
                "Routes and components receive data and actions from src/hooks/.",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSInterfaceDeclaration",
          message:
            "App-owned interfaces belong in src/types/. Use a local type alias only for implementation-only shapes.",
        },
      ],
    },
  },
  {
    files: ["src/hooks/**/*.{ts,tsx}", "src/utils/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSInterfaceDeclaration",
          message: "App-owned interfaces belong in src/types/.",
        },
      ],
    },
  },
  {
    files: ["src/utils/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/hooks",
                "@/hooks/*",
                "@/components/*",
                "@/ui",
                "@/displays",
                "@/widgets",
                "@/facilitators",
              ],
              message: "Utilities cannot depend on hooks or components.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/components/ui/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/lib",
                "@/lib/index",
                "@/lib/index.ts",
                "convex",
                "convex/*",
                "@clerk/*",
                "@tanstack/react-router",
                "@/hooks",
                "@/convex",
              ],
              message:
                "UI primitives cannot depend on data, authentication, or routing.",
            },
          ],
        },
      ],
    },
  },
];
